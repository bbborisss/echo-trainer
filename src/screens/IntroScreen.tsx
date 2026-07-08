import { dayNumber, streak, tomorrowClip, triesLeft, bestToday, MAX_TRIES } from '../game'
import { CLIPS } from '../clips'
import type { Clip } from '../types'

interface Props {
  daily: Clip
  onPlayDaily: () => void
  onPractice: () => void
}

/** Landing screen: the two doors — today's shared speech, or the practice gym. */
export function IntroScreen({ daily, onPlayDaily, onPractice }: Props) {
  const tries = triesLeft(daily.id)
  const played = MAX_TRIES - tries
  const done = tries === 0
  const tomorrow = tomorrowClip(CLIPS)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6 py-10">
      <div className="text-center">
        <div className="text-5xl">🎙️</div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-100">Echo Chamber</h1>
        <p className="mt-1 text-sm text-zinc-400">Speak like history’s greatest voices</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-sm font-bold text-zinc-400">
            #{dayNumber()}
          </span>
          <span className="rounded-full bg-orange-500/15 px-3 py-1 text-sm font-bold text-orange-400">
            🔥 {streak()}
          </span>
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <button
          onClick={onPlayDaily}
          disabled={done}
          className="group rounded-2xl border border-orange-500/40 bg-gradient-to-b from-orange-600 to-orange-700 p-5 text-left shadow-lg shadow-orange-950/40 transition hover:from-orange-500 hover:to-orange-600 active:scale-[0.98] disabled:from-zinc-800 disabled:to-zinc-900 disabled:border-zinc-700 disabled:shadow-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-lg font-extrabold text-white group-disabled:text-zinc-400">
              🏛️ Speech of the Day
            </span>
            <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-bold text-white/90 group-disabled:text-zinc-500">
              #{dayNumber()}
            </span>
          </div>
          <p className="mt-1 text-sm text-orange-100 group-disabled:text-zinc-500">
            {done
              ? `Done for today — best ${bestToday(daily.id)}. Back tomorrow!`
              : played > 0
                ? `${tries} ${tries === 1 ? 'take' : 'takes'} left — best so far ${bestToday(daily.id)}`
                : 'Same speech for everyone. Three takes. No pressure.'}
          </p>
        </button>

        <button
          onClick={onPractice}
          className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-left transition hover:bg-zinc-800 active:scale-[0.98]"
        >
          <span className="text-lg font-extrabold text-zinc-100">🎯 Practice</span>
          <p className="mt-1 text-sm text-zinc-400">
            The full speech library. Unlimited takes — warm up or chase a best.
          </p>
        </button>

        {/* Tomorrow teaser: the speaker, never the line */}
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-4">
          <img
            src={tomorrow.image}
            alt={`Portrait of ${tomorrow.speaker}`}
            className="h-12 w-12 shrink-0 rounded-full border border-zinc-700 object-cover object-[50%_20%]"
          />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Tomorrow’s voice · #{dayNumber() + 1}
            </div>
            <div className="truncate text-sm font-bold text-zinc-200">
              {tomorrow.speaker} <span className="font-normal text-zinc-500">({tomorrow.year})</span>
            </div>
            <div className="text-xs text-zinc-500">What will you have to say? 🔥</div>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-600">Pro tip: wear headphones so your mic only hears you.</p>
    </div>
  )
}
