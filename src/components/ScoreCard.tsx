import type { DimensionScore, ScoreReport } from '../types'

function grade(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Legendary', color: 'text-amber-500' }
  if (score >= 80) return { label: 'Excellent', color: 'text-emerald-600' }
  if (score >= 70) return { label: 'Strong', color: 'text-emerald-600' }
  if (score >= 55) return { label: 'Getting there', color: 'text-sky-600' }
  if (score >= 40) return { label: 'Rough draft', color: 'text-orange-500' }
  return { label: 'Keep at it', color: 'text-rose-500' }
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
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Melody map
        </span>
        <span className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-slate-400" /> original
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-indigo-500" /> you
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg bg-slate-50">
        {toSegments(melody.ref, x, y).map((points, i) => (
          <polyline
            key={`r${i}`}
            points={points}
            fill="none"
            stroke="#94a3b8"
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
            stroke="#6366f1"
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
        <span className="text-sm font-medium text-slate-700">
          {icon} {name}
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-800">
          {dim.score === null ? '—' : dim.score}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        {dim.score !== null && (
          <div
            className={`h-full rounded-full animate-bar-fill ${barColor(dim.score)}`}
            style={{ width: `${dim.score}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{dim.detail}</p>
    </div>
  )
}

export function ScoreCard({
  report,
  attemptNumber,
  newBest,
}: {
  report: ScoreReport
  attemptNumber: number
  newBest: boolean
}) {
  const g = grade(report.overall)
  const ringDeg = report.overall * 3.6

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-pop-in">
      <div className="flex items-center gap-4 mb-4">
        <div
          className="relative h-20 w-20 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${report.overall >= 70 ? '#10b981' : report.overall >= 45 ? '#0ea5e9' : '#f43f5e'} ${ringDeg}deg, #e2e8f0 0deg)`,
          }}
        >
          <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-white">
            <span className="text-2xl font-extrabold tabular-nums text-slate-800">{report.overall}</span>
          </div>
        </div>
        <div>
          <div className={`text-lg font-bold ${g.color}`}>{g.label}</div>
          <div className="text-xs text-slate-500">
            Attempt {attemptNumber} of 3
            {newBest && (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
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
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500">
          We heard: “{report.transcript}”
        </p>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
          Coach’s notes
        </div>
        <ul className="space-y-1.5">
          {report.tips.map((tip, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600">
              <span className="text-indigo-400">▸</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
