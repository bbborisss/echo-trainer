/**
 * Client for the optional Echo Chamber backend (see server/). Every call is
 * best-effort: if VITE_API_BASE is unset, the request fails, or it times out,
 * callers get null and fall back to the offline path (rule-based coach,
 * browser speech recognition).
 */
import type { Clip, ScoreReport } from './types'

const API_BASE: string | undefined = import.meta.env.VITE_API_BASE

export const backendConfigured = Boolean(API_BASE)

async function post(path: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  if (!API_BASE) return null
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      method: 'POST',
      credentials: 'include', // uid cookie
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok ? res : null
  } catch {
    return null
  }
}

// ---- server-side game state --------------------------------------------------

/** Shape of GET /me — the server's view of this player. */
export interface ServerState {
  uid: string
  streak: number
  lastStreakDay: string | null
  today: Record<string, { attempts: number; best: number }>
  bestEver: Record<string, number>
  heard: string[]
  subscribed: boolean
}

/** Bootstrap identity + state. Sets the uid cookie on first call. */
export async function fetchMe(day: string): Promise<ServerState | null> {
  if (!API_BASE) return null
  try {
    const res = await fetch(`${API_BASE}/me?day=${day}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(6_000),
    })
    return res.ok ? ((await res.json()) as ServerState) : null
  } catch {
    return null
  }
}

const jsonPost = (path: string, body: unknown) =>
  post(path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 6_000)

/** Fire-and-forget: the player finished listening to a reference clip today. */
export function reportHeard(day: string, clipId: string): void {
  void jsonPost('/heard', { day, clipId })
}

/** Fire-and-forget: a scored attempt happened. */
export function reportAttempt(
  day: string,
  prevDay: string,
  clipId: string,
  score: number,
  daily: boolean,
): void {
  void jsonPost('/attempt', { day, prevDay, clipId, score, daily })
}

/** Daily-reminder opt-in. Resolves true when the server accepted the email. */
export async function subscribeEmail(email: string): Promise<boolean> {
  const res = await jsonPost('/subscribe', { email })
  return res !== null
}

/** One-shot LLM coach note for a scored attempt, or null (use rule-based tips). */
export async function fetchCoachNote(
  clip: Clip,
  report: ScoreReport,
  attempt: number,
  day?: string,
): Promise<string | null> {
  const res = await post(
    '/coach',
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attempt,
        day, // lets the server enforce the coaching allowance per uid
        clip: {
          id: clip.id,
          speaker: clip.speaker,
          title: clip.title,
          year: clip.year,
          text: clip.text,
        },
        report: {
          overall: report.overall,
          pronunciation: report.pronunciation,
          intonation: report.intonation,
          rhythm: report.rhythm,
          tone: report.tone,
          transcript: report.transcript,
        },
      }),
    },
    10_000,
  )
  if (!res) return null
  const data = (await res.json().catch(() => null)) as { note?: string } | null
  return data?.note?.trim() || null
}

/** Server-side Whisper transcription of the recorded take, or null (use browser SR). */
export async function transcribeOnServer(blob: Blob): Promise<string | null> {
  const res = await post(
    '/transcribe',
    { headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob },
    15_000,
  )
  if (!res) return null
  const data = (await res.json().catch(() => null)) as { text?: string } | null
  const text = data?.text?.trim()
  return text ? text : null
}
