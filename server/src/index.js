/**
 * Echo Chamber backend — Cloudflare Worker + D1.
 *
 * Identity: anonymous `uid` in a secure httpOnly cookie, minted on first /me.
 * Game state (attempts, bests, streak, heard-clips) is tracked per uid so it
 * survives cache clears and follows the player across devices. Day keys are
 * the client's LOCAL date string — the server never guesses the player's
 * timezone for game state.
 *
 *   GET  /me?day=YYYY-MM-DD   bootstrap: identity cookie + full state
 *   POST /heard               { day, clipId } — reference clip fully listened
 *   POST /attempt             { day, prevDay, clipId, score, daily }
 *   POST /subscribe           { email } — daily-teaser reminder opt-in
 *   GET  /unsubscribe?token=  one-click opt-out (link in every email)
 *   POST /coach               ScoreReport + clip → one LLM coach note
 *   POST /transcribe          audio bytes → Whisper transcript
 *
 * Cron (see wrangler.toml): daily teaser email via Resend when
 * RESEND_API_KEY is set; silently skipped otherwise.
 */
import { dailyClipUTC, dayNumberUTC } from './clips.js'

const COACH_SYSTEM = `You are the coach in "Echo Chamber", a game where players mimic famous
historical speeches and get scored on pronunciation, intonation, rhythm and tone (0-100 each).
Given one scored attempt, write ONE short coach note (2-3 sentences, max 60 words) that:
- names the single weakest dimension and gives one concrete, actionable tip for it,
- references something specific from the attempt (a missed word, pacing, pitch) when the data shows it,
- stays encouraging and playful, never condescending.
Reply with the note only - no preamble, no quotes, no markdown.`

/** LLM coach notes allowed per clip per day (mirrors MAX_COACHED_TRIES client-side). */
const MAX_COACHED_TRIES = 3

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// ---------- helpers ----------------------------------------------------------

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
  const allow = allowed.includes('*') ? origin || '*' : allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function getUid(request) {
  const cookie = request.headers.get('Cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)uid=([a-f0-9-]{36})/)
  return m ? m[1] : null
}

/** uid from cookie if the user exists; otherwise null (state routes require /me first). */
async function requireUser(request, env) {
  const uid = getUid(request)
  if (!uid) return null
  const row = await env.DB.prepare('SELECT uid FROM users WHERE uid = ?').bind(uid).first()
  return row ? uid : null
}

// ---------- state endpoints ---------------------------------------------------

async function handleMe(request, env, cors) {
  const url = new URL(request.url)
  const day = url.searchParams.get('day')
  if (!day || !DAY_RE.test(day)) return json({ error: 'day required (YYYY-MM-DD)' }, 400, cors)

  let uid = getUid(request)
  const headers = { ...cors }
  let user = uid
    ? await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(uid).first()
    : null
  if (!user) {
    uid = crypto.randomUUID()
    await env.DB.prepare('INSERT INTO users (uid, created_at) VALUES (?, ?)')
      .bind(uid, new Date().toISOString())
      .run()
    user = { uid, streak: 0, last_streak_day: null }
    // Secure+SameSite=None so the cookie flows cross-origin (game site → worker).
    // Browsers treat localhost as a secure context, so wrangler dev works too.
    headers['Set-Cookie'] =
      `uid=${uid}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=None`
  }

  const [attempts, bests, heard, sub] = await Promise.all([
    env.DB.prepare('SELECT clip_id, attempts, best FROM attempts WHERE uid = ? AND day = ?')
      .bind(uid, day)
      .all(),
    env.DB.prepare('SELECT clip_id, best FROM best_ever WHERE uid = ?').bind(uid).all(),
    env.DB.prepare('SELECT clip_id FROM heard WHERE uid = ? AND day = ?').bind(uid, day).all(),
    env.DB.prepare('SELECT 1 AS s FROM subscribers WHERE uid = ? AND unsubscribed = 0')
      .bind(uid)
      .first(),
  ])

  return json(
    {
      uid,
      streak: user.streak,
      lastStreakDay: user.last_streak_day,
      today: Object.fromEntries(
        attempts.results.map((r) => [r.clip_id, { attempts: r.attempts, best: r.best }]),
      ),
      bestEver: Object.fromEntries(bests.results.map((r) => [r.clip_id, r.best])),
      heard: heard.results.map((r) => r.clip_id),
      subscribed: Boolean(sub),
    },
    200,
    headers,
  )
}

async function handleHeard(request, env, cors) {
  const uid = await requireUser(request, env)
  if (!uid) return json({ error: 'no identity — call /me first' }, 401, cors)
  const { day, clipId } = await request.json()
  if (!DAY_RE.test(day ?? '') || typeof clipId !== 'string')
    return json({ error: 'bad request' }, 400, cors)
  await env.DB.prepare('INSERT OR IGNORE INTO heard (uid, day, clip_id) VALUES (?, ?, ?)')
    .bind(uid, day, clipId)
    .run()
  return json({ ok: true }, 200, cors)
}

async function handleAttempt(request, env, cors) {
  const uid = await requireUser(request, env)
  if (!uid) return json({ error: 'no identity — call /me first' }, 401, cors)
  const { day, prevDay, clipId, score, daily } = await request.json()
  if (
    !DAY_RE.test(day ?? '') ||
    typeof clipId !== 'string' ||
    typeof score !== 'number' ||
    score < 0 ||
    score > 100
  )
    return json({ error: 'bad request' }, 400, cors)

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO attempts (uid, day, clip_id, attempts, best) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (uid, day, clip_id)
       DO UPDATE SET attempts = attempts + 1, best = MAX(best, excluded.best)`,
    ).bind(uid, day, clipId, score),
    env.DB.prepare(
      `INSERT INTO best_ever (uid, clip_id, best) VALUES (?, ?, ?)
       ON CONFLICT (uid, clip_id) DO UPDATE SET best = MAX(best, excluded.best)`,
    ).bind(uid, clipId, score),
  ])

  // The streak is the daily ritual: only the daily clip extends it.
  if (daily === true) {
    const user = await env.DB.prepare('SELECT streak, last_streak_day FROM users WHERE uid = ?')
      .bind(uid)
      .first()
    if (user.last_streak_day !== day) {
      const streak = user.last_streak_day === prevDay ? user.streak + 1 : 1
      await env.DB.prepare('UPDATE users SET streak = ?, last_streak_day = ? WHERE uid = ?')
        .bind(streak, day, uid)
        .run()
      return json({ ok: true, streak }, 200, cors)
    }
    return json({ ok: true, streak: user.streak }, 200, cors)
  }
  return json({ ok: true }, 200, cors)
}

// ---------- email -------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSubscribe(request, env, cors) {
  const uid = await requireUser(request, env)
  const { email } = await request.json()
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254)
    return json({ error: 'invalid email' }, 400, cors)
  const token = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO subscribers (email, uid, token, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET unsubscribed = 0, uid = COALESCE(excluded.uid, uid)`,
  )
    .bind(email.toLowerCase(), uid, token, new Date().toISOString())
    .run()
  return json({ ok: true }, 200, cors)
}

async function handleUnsubscribe(request, env) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const res = await env.DB.prepare('UPDATE subscribers SET unsubscribed = 1 WHERE token = ?')
    .bind(token)
    .run()
  const ok = res.meta.changes > 0
  return new Response(
    `<html><body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:grid;place-items:center;height:100vh"><p>${
      ok ? '🎙️ Unsubscribed — no more reminders.' : 'Link not recognized.'
    }</p></body></html>`,
    { status: ok ? 200 : 404, headers: { 'Content-Type': 'text/html' } },
  )
}

/** Cron: send the daily teaser to all active subscribers via Resend. */
async function sendDailyTeasers(env) {
  if (!env.RESEND_API_KEY) {
    console.log('cron: RESEND_API_KEY not set, skipping email send')
    return
  }
  const clip = dailyClipUTC()
  const n = dayNumberUTC()
  const site = env.SITE_URL ?? 'https://echo-chamber.example'
  const subs = await env.DB.prepare(
    'SELECT email, token FROM subscribers WHERE unsubscribed = 0',
  ).all()
  console.log(`cron: sending day #${n} teaser (${clip.speaker}) to ${subs.results.length} subscriber(s)`)

  for (const s of subs.results) {
    const html = `
      <div style="font-family:system-ui,sans-serif;background:#18181b;color:#e4e4e7;padding:32px;border-radius:16px;max-width:480px;margin:auto">
        <h2 style="margin:0 0 4px">🎙️ Echo Chamber #${n}</h2>
        <p style="color:#a1a1aa;margin:0 0 16px">Today's voice is ready.</p>
        <p style="font-size:20px;font-weight:800;margin:0 0 2px">${clip.emoji} ${clip.speaker}</p>
        <p style="color:#a1a1aa;margin:0 0 20px">${clip.title} · ${clip.year} — what will <em>you</em> have to say?</p>
        <a href="${site}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:999px">Take today's speech →</a>
        <p style="margin:24px 0 0;font-size:12px;color:#71717a">Three takes. Keep the streak. 🔥<br/>
        <a href="${env.API_URL ?? ''}/unsubscribe?token=${s.token}" style="color:#71717a">Unsubscribe</a></p>
      </div>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? 'Echo Chamber <onboarding@resend.dev>',
        to: s.email,
        subject: `🎙️ Echo Chamber #${n} — ${clip.speaker} awaits`,
        html,
      }),
    })
    if (!res.ok) console.error(`cron: send to ${s.email} failed ${res.status}: ${await res.text()}`)
  }
}

// ---------- coach + transcribe (proxied LLM/ASR) -------------------------------

function coachPrompt({ clip, report, attempt }) {
  const dim = (d) => (d && d.score !== null ? `${d.score}/100 (${d.detail})` : 'not measured')
  return [
    `Speech: "${clip.title}" by ${clip.speaker} (${clip.year}).`,
    `Target line: "${clip.text}"`,
    `Attempt #${attempt}. Overall score: ${report.overall}/100.`,
    `Pronunciation: ${dim(report.pronunciation)}`,
    `Intonation: ${dim(report.intonation)}`,
    `Rhythm: ${dim(report.rhythm)}`,
    `Tone: ${dim(report.tone)}`,
    report.transcript ? `We heard the player say: "${report.transcript}"` : 'No transcript available.',
  ].join('\n')
}

async function callOpenAI(env, prompt) {
  const res = await fetch(`${env.COACH_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.COACH_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.COACH_MODEL,
      max_tokens: 200,
      messages: [
        { role: 'system', content: COACH_SYSTEM },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`coach provider ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim()
}

async function callAnthropic(env, prompt) {
  const base = env.COACH_BASE_URL || 'https://api.anthropic.com'
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.COACH_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.COACH_MODEL || 'claude-haiku-4-5',
      max_tokens: 300,
      system: COACH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`coach provider ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

async function handleCoach(request, env, cors) {
  const payload = await request.json()
  if (!payload?.clip || !payload?.report) return json({ error: 'bad request' }, 400, cors)

  // Enforce the coaching allowance server-side using tracked attempts:
  // the note for attempt N is only issued while the day's count allows it.
  const uid = await requireUser(request, env)
  if (uid && payload.day && DAY_RE.test(payload.day) && payload.clip.id) {
    const row = await env.DB.prepare(
      'SELECT attempts FROM attempts WHERE uid = ? AND day = ? AND clip_id = ?',
    )
      .bind(uid, payload.day, payload.clip.id)
      .first()
    if (row && row.attempts > MAX_COACHED_TRIES)
      return json({ error: 'coaching allowance used for today' }, 429, cors)
  }

  const prompt = coachPrompt(payload)
  const note =
    env.COACH_FORMAT === 'anthropic'
      ? await callAnthropic(env, prompt)
      : await callOpenAI(env, prompt)
  if (!note) throw new Error('empty coach note')
  return json({ note }, 200, cors)
}

async function handleTranscribe(request, env, cors) {
  const audio = await request.arrayBuffer()
  if (!audio.byteLength) return json({ error: 'no audio' }, 400, cors)
  if (audio.byteLength > 10 * 1024 * 1024) return json({ error: 'audio too large' }, 413, cors)

  const type = request.headers.get('Content-Type') || 'audio/webm'
  const form = new FormData()
  form.append('file', new File([audio], 'take.webm', { type }))
  form.append('model', env.ASR_MODEL)
  form.append('language', 'en') // recordings are English regardless of UI language
  form.append('response_format', 'json')

  const res = await fetch(`${env.ASR_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ASR_API_KEY}` },
    body: form,
  })
  if (!res.ok) throw new Error(`asr provider ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return json({ text: (data.text ?? '').trim() }, 200, cors)
}

// ---------- router ------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request.headers.get('Origin') ?? '')

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    try {
      if (request.method === 'GET') {
        if (url.pathname === '/me') return await handleMe(request, env, cors)
        if (url.pathname === '/unsubscribe') return await handleUnsubscribe(request, env)
        return json({ error: 'not found' }, 404, cors)
      }
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors)

      switch (url.pathname) {
        case '/heard':
          return await handleHeard(request, env, cors)
        case '/attempt':
          return await handleAttempt(request, env, cors)
        case '/subscribe':
          return await handleSubscribe(request, env, cors)
        case '/coach':
          return await handleCoach(request, env, cors)
        case '/transcribe':
          return await handleTranscribe(request, env, cors)
        default:
          return json({ error: 'not found' }, 404, cors)
      }
    } catch (err) {
      console.error(err)
      return json({ error: 'upstream failure' }, 502, cors)
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDailyTeasers(env))
  },
}
