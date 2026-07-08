/**
 * Echo Chamber backend — a thin Cloudflare Worker proxy with two endpoints:
 *
 *   POST /coach       ScoreReport + clip context in → one coach-note string out.
 *                     Speaks the OpenAI chat-completions wire format by default
 *                     (covers DeepSeek/Groq/OpenRouter/Ollama/LM Studio), with an
 *                     Anthropic /v1/messages adapter selected via COACH_FORMAT.
 *
 *   POST /transcribe  Recorded audio bytes in → { text } out, via an
 *                     OpenAI-compatible /audio/transcriptions endpoint
 *                     (Groq Whisper by default).
 *
 * API keys live here as Worker secrets — never in the client.
 */

const COACH_SYSTEM = `You are the coach in "Echo Chamber", a game where players mimic famous
historical speeches and get scored on pronunciation, intonation, rhythm and tone (0-100 each).
Given one scored attempt, write ONE short coach note (2-3 sentences, max 60 words) that:
- names the single weakest dimension and gives one concrete, actionable tip for it,
- references something specific from the attempt (a missed word, pacing, pitch) when the data shows it,
- stays encouraging and playful, never condescending.
Reply with the note only - no preamble, no quotes, no markdown.`

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

/** Flatten the client's payload into a compact prompt for the LLM. */
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request.headers.get('Origin') ?? '')

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors)

    try {
      if (url.pathname === '/coach') return await handleCoach(request, env, cors)
      if (url.pathname === '/transcribe') return await handleTranscribe(request, env, cors)
      return json({ error: 'not found' }, 404, cors)
    } catch (err) {
      console.error(err)
      return json({ error: 'upstream failure' }, 502, cors)
    }
  },
}
