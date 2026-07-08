import { bestEver } from '../game'
import type { Clip } from '../types'

interface Props {
  clips: Clip[]
  /** today's daily clip — excluded so practice can't burn daily takes */
  dailyId: string
  onPick: (clip: Clip) => void
  onBack: () => void
}

/** Practice gym: pick any speech, unlimited takes. */
export function PracticeScreen({ clips, dailyId, onPick, onBack }: Props) {
  const pool = clips.filter((c) => c.id !== dailyId)

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-5 py-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-zinc-100">🎯 Practice</h1>
          <p className="text-xs text-zinc-400">Unlimited takes — today’s daily speech is hidden here</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-2 gap-4">
          {pool.map((clip) => {
            const best = bestEver(clip.id)
            return (
              <button
                key={clip.id}
                onClick={() => onPick(clip)}
                className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-left transition hover:border-zinc-600 active:scale-[0.98]"
              >
                <div className="relative">
                  <img
                    src={clip.image}
                    alt={`Portrait of ${clip.speaker}`}
                    className="h-32 w-full object-cover object-[50%_20%] transition group-hover:scale-[1.03]"
                  />
                  {best > 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-amber-400">
                      ★ {best}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-bold leading-tight text-zinc-100">{clip.speaker}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {clip.emoji} {clip.title} · {clip.year}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
