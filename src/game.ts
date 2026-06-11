export const MAX_TRIES = 3

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

export function triesLeft(clipId: string): number {
  return Math.max(0, MAX_TRIES - attemptsToday(clipId))
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

export function recordAttempt(clipId: string, score: number): { attempts: number; newBest: boolean } {
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

  if (s.lastStreakDate !== today) {
    s.streakCount = s.lastStreakDate === yesterdayKey() ? s.streakCount + 1 : 1
    s.lastStreakDate = today
  }

  save(s)
  return { attempts: rec.attempts, newBest }
}

/** First clip (by manifest order) that still has tries left today, else null. */
export function nextPlayableClip<T extends { id: string }>(clips: T[], afterId?: string): T | null {
  const startIdx = afterId ? clips.findIndex((c) => c.id === afterId) + 1 : 0
  for (let k = 0; k < clips.length; k++) {
    const clip = clips[(startIdx + k) % clips.length]
    if (triesLeft(clip.id) > 0) return clip
  }
  return null
}
