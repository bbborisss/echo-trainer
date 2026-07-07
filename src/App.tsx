import { useCallback, useEffect, useRef, useState } from 'react'
import { CLIPS } from './clips'
import type { AudioFeatures, ChatMessage, Clip } from './types'
import { decodeToMono, extractFeatures, trimSilence } from './audio/dsp'
import { scoreAttempt } from './audio/score'
import { useRecorder, type RecordingResult } from './audio/recorder'
import { startTranscription, speechRecognitionSupported, type TranscriptSession } from './audio/speech'
import { computePeaks, type GhostWave } from './audio/waveform'
import { MAX_TRIES, bestToday, nextPlayableClip, recordAttempt, streak, triesLeft } from './game'
import { AudioBubble } from './components/AudioBubble'
import { LiveWave } from './components/LiveWave'
import { RecordButton } from './components/RecordButton'
import { ScoreCard } from './components/ScoreCard'

type Phase = 'listening' | 'analyzing' | 'scored' | 'day-done'

interface RefData {
  features: AudioFeatures
  wave: GhostWave
}

// Reference features are computed once per clip per session and cached.
const refDataCache = new Map<string, Promise<RefData>>()

function getRefData(clip: Clip): Promise<RefData> {
  let cached = refDataCache.get(clip.id)
  if (!cached) {
    cached = fetch(clip.audio)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load clip: ${r.status}`)
        return r.arrayBuffer()
      })
      .then(decodeToMono)
      .then((samples) => {
        const features = extractFeatures(samples)
        const speech = trimSilence(samples)
        return { features, wave: { peaks: computePeaks(speech, 96), duration: features.duration } }
      })
    cached.catch(() => refDataCache.delete(clip.id))
    refDataCache.set(clip.id, cached)
  }
  return cached
}

function coachReaction(score: number, attemptsLeft: number): string {
  if (score >= 90) return 'Incredible. That gave me chills. 🏆'
  if (score >= 80) return 'Now THAT sounded presidential. Excellent take.'
  if (score >= 70)
    return attemptsLeft > 0
      ? 'Strong take! There’s a little more in the tank though — check the notes and go again?'
      : 'Strong take! A great score to carry into tomorrow.'
  if (score >= 50)
    return attemptsLeft > 0
      ? 'Decent foundation. Read the coach’s notes, replay the original, and give it another shot.'
      : 'Decent foundation — tomorrow’s fresh tries will crack this one.'
  return attemptsLeft > 0
    ? 'Rough one — happens to everyone. Listen once more, focus on just the melody, and retry.'
    : 'Tough clip! Sleep on it — it’ll click tomorrow.'
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [phase, setPhase] = useState<Phase>('listening')
  const [clip, setClip] = useState<Clip | null>(null)
  const [clipHeard, setClipHeard] = useState(false)
  const [streakCount, setStreakCount] = useState(streak())
  const [coachTyping, setCoachTyping] = useState(false)
  const [refWave, setRefWave] = useState<{ clipId: string; wave: GhostWave } | null>(null)
  const nextId = useRef(1)
  const transcriptRef = useRef<TranscriptSession | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const booted = useRef(false)

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: nextId.current++ }])
  }, [])

  /** Push coach messages one by one with a typing pause between them. */
  const coachSay = useCallback(
    (texts: string[], andThen?: () => void) => {
      let delay = 0
      texts.forEach((text, i) => {
        delay += i === 0 ? 250 : 1100
        setTimeout(() => {
          setCoachTyping(true)
          setTimeout(() => {
            setCoachTyping(false)
            addMessage({ role: 'coach', kind: 'text', text })
            if (i === texts.length - 1) andThen?.()
          }, 500)
        }, delay)
      })
    },
    [addMessage],
  )

  const presentClip = useCallback(
    (c: Clip) => {
      setClip(c)
      setClipHeard(false)
      setPhase('listening')
      // Warm the cache and grab the ghost wave; errors resurface on scoring
      getRefData(c)
        .then((d) => setRefWave({ clipId: c.id, wave: d.wave }))
        .catch(() => {})
      const tries = triesLeft(c.id)
      coachSay([`${c.emoji} ${c.speaker} — “${c.title}” (${c.year}). ${c.context}`], () => {
        addMessage({ role: 'coach', kind: 'clip', clip: c })
        setTimeout(() => {
          addMessage({
            role: 'coach',
            kind: 'text',
            text: `Listen all the way through, then hit the mic and say it like ${c.speaker.split(' ').pop()}. You have ${tries} ${tries === 1 ? 'try' : 'tries'} today.`,
          })
        }, 800)
      })
    },
    [addMessage, coachSay],
  )

  const goNext = useCallback(
    (afterId?: string) => {
      const next = nextPlayableClip(CLIPS, afterId)
      if (next) {
        presentClip(next)
      } else {
        setPhase('day-done')
        coachSay([
          'That’s every speech for today — all takes used. 🎬',
          `Come back tomorrow for fresh tries. Your streak is on the line… 🔥${streak()}`,
        ])
      }
    },
    [coachSay, presentClip],
  )

  // Boot: greet and present the first playable clip
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const first = nextPlayableClip(CLIPS)
    const greeting = [
      'Welcome to Echo Chamber. 🎙️ I play you a line from a famous speech — you say it back, and I score the impression.',
      'Pro tip: wear headphones so your mic only hears you.',
    ]
    if (!speechRecognitionSupported) {
      greeting.push(
        'Heads-up: this browser has no speech recognition, so pronunciation won’t be scored — intonation, rhythm and tone still are. Chrome or Edge scores all four.',
      )
    }
    coachSay(greeting, () => {
      if (first) {
        setTimeout(() => presentClip(first), 700)
      } else {
        setPhase('day-done')
        coachSay([`You’ve used today’s takes on every speech. Come back tomorrow! 🔥${streak()}`])
      }
    })
  }, [coachSay, presentClip])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, coachTyping, phase])

  const handleRecordingComplete = useCallback(
    async (result: RecordingResult) => {
      if (!clip) return
      addMessage({ role: 'user', kind: 'recording', audioUrl: result.url })
      setPhase('analyzing')

      const transcriptPromise =
        transcriptRef.current?.finish() ?? Promise.resolve<string | null>(null)
      transcriptRef.current = null

      try {
        const [refData, userBuffer, transcript] = await Promise.all([
          getRefData(clip),
          result.blob.arrayBuffer(),
          transcriptPromise,
        ])
        const userFeatures = extractFeatures(await decodeToMono(userBuffer))
        const report = scoreAttempt({
          ref: refData.features,
          user: userFeatures,
          targetText: clip.text,
          transcript,
          speaker: clip.speaker,
        })

        const { attempts, newBest } = recordAttempt(clip.id, report.overall)
        setStreakCount(streak())
        const remaining = MAX_TRIES - attempts

        addMessage({
          role: 'coach',
          kind: 'scorecard',
          report,
          attemptNumber: attempts,
          newBest,
        })

        setTimeout(() => {
          if (remaining > 0) {
            coachSay([coachReaction(report.overall, remaining)], () => setPhase('scored'))
          } else {
            coachSay(
              [
                coachReaction(report.overall, 0),
                `That was your third take on “${clip.title}” — it locks until tomorrow. Best today: ${bestToday(clip.id)}${newBest ? ' (all-time best!)' : ''}.`,
              ],
              () => goNext(clip.id),
            )
          }
        }, 600)
      } catch {
        coachSay(['Hmm, I couldn’t analyze that recording. Mind trying again?'], () =>
          setPhase('listening'),
        )
      }
    },
    [addMessage, clip, coachSay, goNext],
  )

  const recorder = useRecorder(handleRecordingComplete)

  const startRecording = useCallback(() => {
    transcriptRef.current = startTranscription()
    void recorder.start()
  }, [recorder])

  const replayClip = useCallback(() => {
    if (clip) addMessage({ role: 'coach', kind: 'clip', clip })
  }, [addMessage, clip])

  const retry = useCallback(() => {
    if (!clip) return
    coachSay([`Take ${MAX_TRIES - triesLeft(clip.id) + 1}. Make it count. 🎬`], () =>
      setPhase('listening'),
    )
  }, [clip, coachSay])

  const remainingTries = clip ? triesLeft(clip.id) : 0

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-800">🎙️ Echo Chamber</h1>
          <p className="text-xs text-slate-500">Speak like history’s greatest voices</p>
        </div>
        <span title="Daily streak" className="rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-600">
          🔥 {streakCount}
        </span>
      </header>

      {/* Chat */}
      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex animate-pop-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.kind === 'text' && (
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'rounded-br-md bg-indigo-600 text-white'
                    : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                }`}
              >
                {m.text}
              </div>
            )}
            {m.kind === 'clip' && m.clip && (
              <div className="max-w-[85%] space-y-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white p-3 shadow-sm">
                <AudioBubble
                  src={m.clip.audio}
                  label={`${m.clip.speaker}, ${m.clip.year}`}
                  onEnded={() => setClipHeard(true)}
                />
                <blockquote className="border-l-2 border-indigo-300 pl-3 font-display text-sm italic text-slate-600">
                  “{m.clip.text}”
                </blockquote>
              </div>
            )}
            {m.kind === 'recording' && m.audioUrl && (
              <AudioBubble src={m.audioUrl} accent label="Your take" />
            )}
            {m.kind === 'scorecard' && m.report && (
              <ScoreCard report={m.report} attemptNumber={m.attemptNumber ?? 1} newBest={m.newBest ?? false} />
            )}
          </div>
        ))}
        {(coachTyping || phase === 'analyzing') && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              {phase === 'analyzing' && (
                <span className="ml-1 text-xs text-slate-400">analyzing your take…</span>
              )}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Footer controls */}
      <footer className="border-t border-slate-200 bg-white px-4 py-4">
        {phase === 'listening' && clip && (
          <div className="flex flex-col items-center gap-2">
            {recorder.status === 'recording' && (
              <div className="w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-3 pt-2 pb-1">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide">
                  <span className="text-indigo-500">You</span>
                  <span className="text-slate-400">Shadow = original — chase its shape</span>
                </div>
                <LiveWave
                  analyser={recorder.analyser}
                  ghost={refWave?.clipId === clip.id ? refWave.wave : null}
                />
              </div>
            )}
            <RecordButton
              recording={recorder.status === 'recording'}
              disabled={!clipHeard || recorder.status === 'requesting'}
              elapsed={recorder.elapsed}
              onStart={startRecording}
              onStop={recorder.stop}
            />
            {!clipHeard && (
              <p className="text-xs text-slate-400">
                Play the clip all the way through to unlock the mic
              </p>
            )}
            {recorder.error && <p className="text-xs text-rose-500">{recorder.error}</p>}
          </div>
        )}
        {phase === 'scored' && clip && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={retry}
              className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 active:scale-95"
            >
              🎤 Try again ({remainingTries} left)
            </button>
            <button
              onClick={replayClip}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              🔁 Replay original
            </button>
            <button
              onClick={() => goNext(clip.id)}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              ⏭️ Next speech
            </button>
          </div>
        )}
        {phase === 'analyzing' && (
          <p className="text-center text-sm text-slate-400">Scoring your impression…</p>
        )}
        {phase === 'day-done' && (
          <p className="text-center text-sm font-medium text-slate-500">
            All done for today — see you tomorrow 👋
          </p>
        )}
      </footer>
    </div>
  )
}
