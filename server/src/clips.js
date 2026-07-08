/**
 * Server-side mini manifest for the daily-teaser email.
 * KEEP IN SYNC with src/clips.ts (ids + order drive the daily rotation).
 * Only the fields the email needs are mirrored here.
 */
export const CLIPS = [
  { id: 'armstrong-step', speaker: 'Neil Armstrong', title: 'One Small Step', year: 1969, emoji: '🌕' },
  { id: 'fdr-fear', speaker: 'Franklin D. Roosevelt', title: 'Fear Itself', year: 1933, emoji: '🎩' },
  { id: 'jfk-asknot', speaker: 'John F. Kennedy', title: 'Ask Not', year: 1961, emoji: '🇺🇸' },
  { id: 'jfk-moon', speaker: 'John F. Kennedy', title: 'We Choose the Moon', year: 1962, emoji: '🚀' },
  { id: 'reagan-wall', speaker: 'Ronald Reagan', title: 'Tear Down This Wall', year: 1987, emoji: '🧱' },
  { id: 'er-humanrights', speaker: 'Eleanor Roosevelt', title: 'Foundation Stones', year: 1950, emoji: '🕊️' },
  { id: 'perkins-security', speaker: 'Frances Perkins', title: 'Life, Liberty & Security', year: 1935, emoji: '🤝' },
  { id: 'fdr-infamy', speaker: 'Franklin D. Roosevelt', title: 'A Date Which Will Live in Infamy', year: 1941, emoji: '⚓' },
  { id: 'ike-mic', speaker: 'Dwight D. Eisenhower', title: 'Military-Industrial Complex', year: 1961, emoji: '⭐' },
]

/** Day 1 = 2026-07-01, matching DAY_ONE in src/game.ts. */
export function dayNumberUTC(date = new Date()) {
  const dayOne = Date.UTC(2026, 6, 1)
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.round((today - dayOne) / 86_400_000) + 1
}

export function dailyClipUTC(date = new Date()) {
  return CLIPS[(dayNumberUTC(date) - 1) % CLIPS.length]
}
