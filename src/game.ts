/** Takes allowed on the daily clip. Practice clips are unlimited. */
export const MAX_TRIES = 3
/** LLM coach notes allowed per clip per day; past this the rule-based coach answers. */
export const MAX_COACHED_TRIES = 3

interface ClipDay {
  attempts: number
  best: number
}

interface SavedState {
  days: Record<string, Record<string, ClipDay>>
  streakCount: number
  lastStreakDate: string | null
  bestEver: Record<string, number>
}

const KEY = 'echo-trainer-v1'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function load(): SavedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as SavedState
  } catch {
    /* corrupted state — start fresh */
  }
  return { days: {}, streakCount: 0, lastStreakDate: null, bestEver: {} }
}

function save(state: SavedState): void {
  // Keep only today + yesterday; older days no longer affect anything
  const keep = new Set([todayKey(), yesterdayKey()])
  for (const day of Object.keys(state.days)) {
    if (!keep.has(day)) delete state.days[day]
  }
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function attemptsToday(clipId: string): number {
  return load().days[todayKey()]?.[clipId]?.attempts ?? 0
}

/** Takes left on the DAILY clip (practice clips are unlimited). */
export function triesLeft(clipId: string): number {
  return Math.max(0, MAX_TRIES - attemptsToday(clipId))
}

/** Whether the next attempt on this clip still earns an LLM coach note today. */
export function coachedTriesLeft(clipId: string): number {
  return Math.max(0, MAX_COACHED_TRIES - attemptsToday(clipId))
}

export function bestToday(clipId: string): number {
  return load().days[todayKey()]?.[clipId]?.best ?? 0
}

export function bestEver(clipId: string): number {
  return load().bestEver[clipId] ?? 0
}

export function streak(): number {
  const s = load()
  // A streak shown today is valid if they played today or yesterday
  if (s.lastStreakDate === todayKey() || s.lastStreakDate === yesterdayKey()) {
    return s.streakCount
  }
  return 0
}

export function recordAttempt(
  clipId: string,
  score: number,
  opts: { daily: boolean },
): { attempts: number; newBest: boolean } {
  const s = load()
  const today = todayKey()
  s.days[today] ??= {}
  s.days[today][clipId] ??= { attempts: 0, best: 0 }
  const rec = s.days[today][clipId]
  rec.attempts += 1
  rec.best = Math.max(rec.best, score)

  const prevBest = s.bestEver[clipId] ?? 0
  const newBest = score > prevBest
  if (newBest) s.bestEver[clipId] = score

  // The streak is the daily ritual: only playing the Speech of the Day extends it.
  if (opts.daily && s.lastStreakDate !== today) {
    s.streakCount = s.lastStreakDate === yesterdayKey() ? s.streakCount + 1 : 1
    s.lastStreakDate = today
  }

  save(s)
  return { attempts: rec.attempts, newBest }
}

// ---- Speech of the Day -----------------------------------------------------
// Everyone gets the same clip on the same (local) date, so scores are
// comparable between friends — the Wordle anchor. Day numbers are 1-based.

const DAY_ONE = new Date(2026, 6, 1) // 2026-07-01 = Echo Chamber #1

/** Today's 1-based puzzle number (local time), for "Echo Chamber #N" shares. */
export function dayNumber(): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Round, not floor: DST shifts make some day-gaps 23 or 25 hours.
  return Math.round((today.getTime() - DAY_ONE.getTime()) / 86_400_000) + 1
}

/** The shared daily clip: deterministic rotation through the manifest. */
export function dailyClip<T>(clips: T[]): T {
  return clips[(dayNumber() - 1) % clips.length]
}
