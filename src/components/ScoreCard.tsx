import { useState } from 'react'
import type { Clip, DimensionScore, ScoreReport } from '../types'
import { blobToWav } from '../audio/wav'
import { saveBlob, slugify } from '../audio/download'
import { renderShareCard } from '../audio/shareCard'

function grade(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Legendary', color: 'text-amber-400' }
  if (score >= 80) return { label: 'Excellent', color: 'text-emerald-400' }
  if (score >= 70) return { label: 'Strong', color: 'text-emerald-400' }
  if (score >= 55) return { label: 'Getting there', color: 'text-sky-400' }
  if (score >= 40) return { label: 'Rough draft', color: 'text-orange-400' }
  return { label: 'Keep at it', color: 'text-rose-400' }
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-sky-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-rose-500'
}

/** Split a contour with unvoiced (null) gaps into drawable polyline segments. */
function toSegments(
  contour: Array<number | null>,
  x: (i: number) => number,
  y: (v: number) => number,
): string[] {
  const segments: string[] = []
  let current: string[] = []
  contour.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
    } else {
      current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    }
  })
  if (current.length > 1) segments.push(current.join(' '))
  return segments
}

function MelodyChart({ melody }: { melody: NonNullable<ScoreReport['melody']> }) {
  const W = 320
  const H = 72
  const PAD = 6
  const values = [...melody.ref, ...melody.user].filter((v): v is number => v !== null)
  if (values.length < 16) return null
  const lo = Math.min(...values)
  const span = Math.max(3, Math.max(...values) - lo)
  const x = (i: number) => (i / (melody.ref.length - 1)) * W
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD)

  return (
    <div className="mt-4 border-t border-zinc-800 pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Melody map
        </span>
        <span className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-zinc-500" /> original
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-orange-500" /> you
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg bg-zinc-950/60">
        {toSegments(melody.ref, x, y).map((points, i) => (
          <polyline
            key={`r${i}`}
            points={points}
            fill="none"
            stroke="#71717a"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
        ))}
        {toSegments(melody.user, x, y).map((points, i) => (
          <polyline
            key={`u${i}`}
            points={points}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  )
}

function Dimension({ name, icon, dim }: { name: string; icon: string; dim: DimensionScore }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-zinc-300">
          {icon} {name}
        </span>
        <span className="text-sm font-bold tabular-nums text-zinc-100">
          {dim.score === null ? '—' : dim.score}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        {dim.score !== null && (
          <div
            className={`h-full rounded-full animate-bar-fill ${barColor(dim.score)}`}
            style={{ width: `${dim.score}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">{dim.detail}</p>
    </div>
  )
}

/** Download + share-card export row. Only rendered when a take is available. */
function ExportRow({
  clip,
  blob,
  report,
  refPeaks,
  userPeaks,
}: {
  clip: Clip
  blob: Blob
  report: ScoreReport
  refPeaks: Float32Array
  userPeaks: Float32Array
}) {
  const [busy, setBusy] = useState<null | 'wav' | 'card'>(null)
  const [error, setError] = useState<string | null>(null)
  const stem = slugify(`${clip.speaker}-${clip.title}`)

  const downloadWav = async () => {
    setBusy('wav')
    setError(null)
    try {
      const wav = await blobToWav(blob)
      saveBlob(wav, `${stem}-take.wav`)
    } catch {
      setError('Couldn’t convert the audio. Try again?')
    } finally {
      setBusy(null)
    }
  }

  const shareCard = async () => {
    setBusy('card')
    setError(null)
    try {
      const png = await renderShareCard({
        speaker: clip.speaker,
        title: clip.title,
        year: clip.year,
        emoji: clip.emoji,
        quote: clip.text,
        image: clip.image,
        report,
        refPeaks,
        userPeaks,
      })
      const file = new File([png], `${stem}-card.png`, { type: 'image/png' })
      // Prefer the native share sheet (mobile) so it can go straight to IG/TikTok,
      // but only when the platform can actually share files. Everywhere else —
      // and if sharing is cancelled or fails — fall back to a plain download.
      const canShareFile =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: 'My Echo Chamber score' })
        } catch (e) {
          // AbortError = user dismissed the sheet; anything else = share failed.
          if (!(e instanceof DOMException && e.name === 'AbortError')) saveBlob(png, file.name)
        }
      } else {
        saveBlob(png, file.name)
      }
    } catch {
      setError('Couldn’t build the share card. Try again?')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-800 pt-3">
      <div className="flex gap-2">
        <button
          onClick={downloadWav}
          disabled={busy !== null}
          className="flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
        >
          {busy === 'wav' ? 'Preparing…' : '⬇️ Download take'}
        </button>
        <button
          onClick={shareCard}
          disabled={busy !== null}
          className="flex-1 rounded-full bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 active:scale-95 disabled:opacity-50"
        >
          {busy === 'card' ? 'Rendering…' : '📸 Share card'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  )
}

export function ScoreCard({
  report,
  attemptNumber,
  newBest,
  clip,
  blob,
  refPeaks,
  userPeaks,
  llmNote,
}: {
  report: ScoreReport
  attemptNumber: number
  newBest: boolean
  clip?: Clip
  blob?: Blob
  refPeaks?: Float32Array
  userPeaks?: Float32Array
  /** LLM coach note: undefined = not requested/failed, null = loading */
  llmNote?: string | null
}) {
  const g = grade(report.overall)
  const ringDeg = report.overall * 3.6

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm animate-pop-in">
      <div className="flex items-center gap-4 mb-4">
        <div
          className="relative h-20 w-20 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${report.overall >= 70 ? '#10b981' : report.overall >= 45 ? '#0ea5e9' : '#f43f5e'} ${ringDeg}deg, #3f3f46 0deg)`,
          }}
        >
          <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-zinc-900">
            <span className="text-2xl font-extrabold tabular-nums text-zinc-100">{report.overall}</span>
          </div>
        </div>
        <div>
          <div className={`text-lg font-bold ${g.color}`}>{g.label}</div>
          <div className="text-xs text-zinc-500">
            Attempt {attemptNumber} of 3
            {newBest && (
              <span className="ml-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-semibold text-amber-400">
                ★ New best
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Dimension name="Pronunciation" icon="🗣️" dim={report.pronunciation} />
        <Dimension name="Intonation" icon="🎵" dim={report.intonation} />
        <Dimension name="Rhythm" icon="🥁" dim={report.rhythm} />
        <Dimension name="Tone" icon="🎙️" dim={report.tone} />
      </div>

      {report.melody && <MelodyChart melody={report.melody} />}

      {report.transcript !== null && report.transcript.length > 0 && (
        <p className="mt-4 rounded-lg bg-zinc-950/60 px-3 py-2 text-xs italic text-zinc-400">
          We heard: “{report.transcript}”
        </p>
      )}

      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
          Coach’s notes
        </div>
        {llmNote === null && (
          <p className="mb-2 animate-pulse rounded-lg bg-orange-500/10 px-3 py-2 text-sm text-orange-300/60">
            Coach is reviewing your take…
          </p>
        )}
        {typeof llmNote === 'string' && (
          <p className="mb-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-sm leading-relaxed text-orange-200">
            🎙️ {llmNote}
          </p>
        )}
        <ul className="space-y-1.5">
          {report.tips.map((tip, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-300">
              <span className="text-orange-400">▸</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {clip && blob && refPeaks && userPeaks && (
        <ExportRow
          clip={clip}
          blob={blob}
          report={report}
          refPeaks={refPeaks}
          userPeaks={userPeaks}
        />
      )}
    </div>
  )
}
