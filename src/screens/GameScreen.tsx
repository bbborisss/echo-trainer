import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, ScoreReport } from '../types'
import { decodeToMono, extractFeatures, trimSilence } from '../audio/dsp'
import { getRefData } from '../audio/refdata'
import { scoreAttempt } from '../audio/score'
import { useRecorder, type RecordingResult } from '../audio/recorder'
import { startTranscription, type TranscriptSession } from '../audio/speech'
import { computePeaks, type GhostWave } from '../audio/waveform'
import { backendConfigured, fetchCoachNote, transcribeOnServer } from '../api'
import {
  MAX_TRIES,
  bestToday,
  coachedTriesLeft,
  dayNumber,
  heardToday,
  markHeard,
  recordAttempt,
  todayKey,
  triesLeft,
} from '../game'
import { AudioBubble } from '../components/AudioBubble'
import { RecordButton } from '../components/RecordButton'
import { ScoreCard } from '../components/ScoreCard'
import { ScrollingWave } from '../components/ScrollingWave'

type Phase = 'listen' | 'analyzing' | 'results'

interface Props {
  clip: Clip
  mode: 'daily' | 'practice'
  onExit: () => void
  onPractice: () => void
}

interface AttemptResult {
  report: ScoreReport
  attemptNumber: number
  newBest: boolean
  blob: Blob
  userPeaks: Float32Array
}

function reaction(score: number, canRetry: boolean): string {
  if (score >= 90) return 'Incredible. That gave me chills. 🏆'
  if (score >= 80) return 'Now THAT sounded presidential. Excellent take.'
  if (score >= 70)
    return canRetry
      ? 'Strong take! There’s a little more in the tank — check the notes and go again.'
      : 'Strong take! A great score to carry into tomorrow.'
  if (score >= 50)
    return canRetry
      ? 'Decent foundation. Read the notes, replay the original, and give it another shot.'
      : 'Decent foundation — fresh takes tomorrow will crack this one.'
  return canRetry
    ? 'Rough one — happens to everyone. Focus on just the melody and retry.'
    : 'Tough clip! Sleep on it — it’ll click tomorrow.'
}

/** One speech, played and scored. The single screen where the game happens. */
export function GameScreen({ clip, mode, onExit, onPractice }: Props) {
  const [phase, setPhase] = useState<Phase>('listen')
  // Once heard today, the mic stays unlocked — even after leaving this screen
  // (or the site) and coming back. Persisted in game state + synced to server.
  const [clipHeard, setClipHeard] = useState(() => heardToday(clip.id))
  const [refWave, setRefWave] = useState<GhostWave | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  /** LLM coach note: undefined = not requested, null = loading, string = note */
  const [llmNote, setLlmNote] = useState<string | null | undefined>(undefined)
  const transcriptRef = useRef<TranscriptSession | null>(null)

  const daily = mode === 'daily'
  const remaining = daily ? triesLeft(clip.id) : Infinity
  const canRetry = daily ? remaining > 0 : true

  useEffect(() => {
    // Warm the cache and grab the ghost wave; errors resurface on scoring
    getRefData(clip)
      .then((d) => setRefWave(d.wave))
      .catch(() => {})
  }, [clip])

  const handleRecordingComplete = useCallback(
    async (rec: RecordingResult) => {
      setPhase('analyzing')
      setAnalyzeError(null)
      const browserTranscriptPromise =
        transcriptRef.current?.finish() ?? Promise.resolve<string | null>(null)
      transcriptRef.current = null

      try {
        // Server Whisper is preferred (works in every browser, better accuracy);
        // the live browser-SR result is the free fallback when it's unavailable.
        const [refData, userBuffer, browserTranscript, serverTranscript] = await Promise.all([
          getRefData(clip),
          rec.blob.arrayBuffer(),
          browserTranscriptPromise,
          transcribeOnServer(rec.blob),
        ])
        const userMono = await decodeToMono(userBuffer)
        const userFeatures = extractFeatures(userMono)
        const userPeaks = computePeaks(trimSilence(userMono), 96)
        const report = scoreAttempt({
          ref: refData.features,
          user: userFeatures,
          targetText: clip.text,
          transcript: serverTranscript ?? browserTranscript,
          speaker: clip.speaker,
        })
        // Check the LLM-coaching allowance before recording the attempt bumps it.
        const coachable = coachedTriesLeft(clip.id) > 0
        const { attempts, newBest } = recordAttempt(clip.id, report.overall, { daily })
        setResult({ report, attemptNumber: attempts, newBest, blob: rec.blob, userPeaks })
        setPhase('results')

        if (coachable && backendConfigured) {
          setLlmNote(null) // loading
          void fetchCoachNote(clip, report, attempts, todayKey()).then((note) =>
            // Ignore if the player already started another take
            setLlmNote((cur) => (cur === null ? (note ?? undefined) : cur)),
          )
        }
      } catch {
        setAnalyzeError('Couldn’t analyze that recording. Mind trying again?')
        setPhase('listen')
      }
    },
    [clip, daily],
  )

  const recorder = useRecorder(handleRecordingComplete)

  const startRecording = useCallback(() => {
    transcriptRef.current = startTranscription()
    void recorder.start()
  }, [recorder])

  const retry = useCallback(() => {
    setResult(null)
    setLlmNote(undefined)
    setPhase('listen')
  }, [])

  const recording = recorder.status === 'recording'
  const dailyLocked = daily && remaining === 0

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-5 py-3">
        <button
          onClick={onExit}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          ←
        </button>
        <div className="flex-1">
          <span className="text-sm font-extrabold text-zinc-100">
            {daily ? `🏛️ Speech of the Day #${dayNumber()}` : '🎯 Practice'}
          </span>
        </div>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-400">
          {daily ? `${remaining} ${remaining === 1 ? 'take' : 'takes'} left` : 'unlimited takes'}
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-5 py-5">
          {/* Speaker hero */}
          <div className="relative overflow-hidden rounded-2xl">
            <img
              src={clip.image}
              alt={`Portrait of ${clip.speaker}`}
              className="h-64 w-full object-cover object-[50%_22%]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10">
              <div className="text-xl font-extrabold leading-tight text-white">{clip.speaker}</div>
              <div className="text-xs text-white/80">
                {clip.emoji} {clip.title} · {clip.year}
              </div>
            </div>
          </div>

          {/* The occasion */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              The occasion
            </div>
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">{clip.context}</p>
          </div>

          {/* The line */}
          <blockquote className="mt-4 border-l-2 border-orange-500/60 pl-3 font-display text-base italic text-zinc-200">
            “{clip.text}”
          </blockquote>

          {/* Original audio */}
          <div className="mt-4">
            <AudioBubble
              src={clip.audio}
              peaks={refWave?.peaks ?? null}
              label="Original"
              onEnded={() => {
                setClipHeard(true)
                markHeard(clip.id)
              }}
            />
          </div>

          {/* Results */}
          {phase === 'results' && result && (
            <div className="mt-5 flex flex-col items-center gap-4 pb-4">
              <p className="text-center text-sm text-zinc-300">
                {reaction(result.report.overall, canRetry)}
              </p>
              <ScoreCard
                report={result.report}
                attemptNumber={daily ? Math.min(result.attemptNumber, MAX_TRIES) : result.attemptNumber}
                newBest={result.newBest}
                clip={clip}
                blob={result.blob}
                refPeaks={refWave?.peaks}
                userPeaks={result.userPeaks}
                llmNote={llmNote}
              />
              {dailyLocked && (
                <p className="text-center text-xs text-zinc-500">
                  That was your last take on today’s speech — best today: {bestToday(clip.id)}.
                  Fresh takes tomorrow. 🔥
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom stage: record / analyzing / result actions */}
      <footer className="border-t border-zinc-800 bg-zinc-950">
        {phase === 'listen' && (
          <div className="flex flex-col items-center gap-2 py-4">
            {recording && (
              <div className="w-full">
                <div className="flex items-center justify-between px-5 text-[10px] font-semibold uppercase tracking-wide">
                  <span className="text-orange-400">You</span>
                  <span className="text-zinc-500">Chase the shadow — light up every ◆</span>
                </div>
                {/* Full-bleed: the wave runs off both edges of the screen */}
                <ScrollingWave analyser={recorder.analyser} ghost={refWave} />
              </div>
            )}
            <RecordButton
              recording={recording}
              disabled={!clipHeard || recorder.status === 'requesting'}
              elapsed={recorder.elapsed}
              onStart={startRecording}
              onStop={recorder.stop}
            />
            {!clipHeard && (
              <p className="text-xs text-zinc-500">Play the clip all the way through to unlock the mic</p>
            )}
            {recorder.error && <p className="text-xs text-rose-400">{recorder.error}</p>}
            {analyzeError && <p className="text-xs text-rose-400">{analyzeError}</p>}
          </div>
        )}

        {phase === 'analyzing' && (
          <p className="py-6 text-center text-sm text-zinc-500">Scoring your impression…</p>
        )}

        {phase === 'results' && (
          <div className="flex flex-wrap items-center justify-center gap-2 py-4">
            {canRetry ? (
              <button
                onClick={retry}
                className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-orange-500 active:scale-95"
              >
                🎤 Try again{daily ? ` (${remaining} left)` : ''}
              </button>
            ) : (
              <button
                onClick={onPractice}
                className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-orange-500 active:scale-95"
              >
                🎯 Keep practicing
              </button>
            )}
            <button
              onClick={onExit}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 active:scale-95"
            >
              🏠 Home
            </button>
          </div>
        )}
      </footer>
    </div>
  )
}
