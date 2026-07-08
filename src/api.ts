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
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok ? res : null
  } catch {
    return null
  }
}

/** One-shot LLM coach note for a scored attempt, or null (use rule-based tips). */
export async function fetchCoachNote(
  clip: Clip,
  report: ScoreReport,
  attempt: number,
): Promise<string | null> {
  const res = await post(
    '/coach',
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attempt,
        clip: {
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
