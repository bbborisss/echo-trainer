/**
 * Thin wrapper over the browser SpeechRecognition API (Chrome/Edge/Safari).
 * Runs alongside MediaRecorder during the user's take and accumulates a final
 * transcript. Resolves null wherever recognition is unsupported or fails, so
 * pronunciation simply drops out of the scorecard instead of breaking it.
 */

type SpeechRecognitionCtor = new () => any

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechRecognitionSupported = getRecognitionCtor() !== null

export interface TranscriptSession {
  /** Stop listening and get whatever was heard (null = unsupported/failed). */
  finish: () => Promise<string | null>
}

export function startTranscription(): TranscriptSession {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    return { finish: async () => null }
  }

  let transcript = ''
  let failed = false
  let ended = false
  let resolveEnd: (() => void) | null = null

  const recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.continuous = true
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        transcript += ' ' + event.results[i][0].transcript
      }
    }
  }
  recognition.onerror = (event: any) => {
    // 'no-speech' still yields a valid (empty) result; real failures null out
    if (event.error !== 'no-speech') failed = true
  }
  recognition.onend = () => {
    ended = true
    resolveEnd?.()
  }

  try {
    recognition.start()
  } catch {
    failed = true
    ended = true
  }

  return {
    finish: () =>
      new Promise<string | null>((resolve) => {
        const settle = () => resolve(failed ? null : transcript.trim())
        if (ended) {
          settle()
          return
        }
        resolveEnd = settle
        // Give pending results a moment to flush before stopping
        window.setTimeout(() => {
          try {
            recognition.stop()
          } catch {
            settle()
          }
          // Hard deadline in case onend never fires
          window.setTimeout(settle, 2500)
        }, 400)
      }),
  }
}
