import type { AudioFeatures, DimensionScore, ScoreReport } from '../types'
import { align } from './dtw'

/** Pearson correlation over paired values. */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 8) return 0
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  const den = Math.sqrt(dx * dy)
  return den > 1e-9 ? num / den : 0
}

/**
 * Map a correlation (-1..1) to a game score. Calibrated to be encouraging:
 * a genuine attempt lands ~60-80, a great one 85+, random noise ~30-45.
 */
function corrToScore(corr: number): number {
  const eased = Math.max(0, Math.min(1, (corr + 0.35) / 1.35))
  return Math.round(20 + 80 * Math.pow(eased, 1.25))
}

function clampScore(s: number): number {
  return Math.max(0, Math.min(100, Math.round(s)))
}

const FILLER = new Set(['the', 'a', 'an', 'and', 'uh', 'um'])

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

/** Word-level edit distance, for transcript vs target text. */
function wordErrorRate(target: string[], hyp: string[]): number {
  const n = target.length
  const m = hyp.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) dp[i][0] = i
  for (let j = 0; j <= m; j++) dp[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = target[i - 1] === hyp[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + sub)
    }
  }
  return n > 0 ? dp[n][m] / n : 1
}

function missingWords(target: string[], hyp: string[]): string[] {
  const hypSet = new Set(hyp)
  return target.filter((w) => !hypSet.has(w) && !FILLER.has(w))
}

export interface ScoreInput {
  ref: AudioFeatures
  user: AudioFeatures
  targetText: string
  /** what SpeechRecognition heard, or null when unavailable */
  transcript: string | null
  speaker: string
}

export function scoreAttempt(input: ScoreInput): ScoreReport {
  const { ref, user, targetText, transcript, speaker } = input
  const tips: string[] = []

  // --- sanity: did they say anything? ---
  if (user.duration < 0.4 || user.voicedRatio < 0.05) {
    return emptyAttemptReport(transcript)
  }

  const alignment = align(ref, user)

  // --- Intonation: shape of the pitch contour at aligned moments ---
  const refPitch: number[] = []
  const userPitch: number[] = []
  for (const [i, j] of alignment.path) {
    if (!Number.isNaN(ref.pitch[i]) && !Number.isNaN(user.pitch[j])) {
      refPitch.push(ref.pitch[i])
      userPitch.push(user.pitch[j])
    }
  }
  const voicedOverlap = refPitch.length / alignment.path.length
  const pitchCorr = correlation(refPitch, userPitch)
  const melody = melodyContours(ref, user, alignment.path)
  let intonationScore = corrToScore(pitchCorr)
  // Penalize when too little of the take was actually voiced speech
  if (voicedOverlap < 0.25) intonationScore = Math.round(intonationScore * (0.5 + 2 * voicedOverlap))
  intonationScore = clampScore(intonationScore)

  const rangeRatio = ref.pitchRange > 0.5 ? user.pitchRange / ref.pitchRange : 1
  const intonation: DimensionScore = {
    score: intonationScore,
    detail:
      pitchCorr > 0.6
        ? 'Your melody closely traces the original.'
        : rangeRatio < 0.6
          ? 'Your pitch stayed flatter than the original.'
          : rangeRatio > 1.6
            ? 'You swung your pitch more than the original.'
            : 'The ups and downs land in different places than the original.',
  }
  if (intonationScore < 70) {
    if (rangeRatio < 0.6) {
      tips.push(
        `${speaker} moves the pitch a lot here — exaggerate the rise and fall more than feels natural.`,
      )
    } else if (rangeRatio > 1.6) {
      tips.push('Rein in the melody a little — the original is more controlled than your take.')
    } else {
      tips.push('Listen once more just for the melody: hum it without the words, then add words back.')
    }
  }

  // --- Rhythm: tempo + how much the alignment had to warp ---
  const durationRatio = user.duration / ref.duration
  let warp = 0
  const n = ref.energy.length
  const m = user.energy.length
  for (const [i, j] of alignment.path) {
    warp += Math.abs(i / n - j / m)
  }
  warp /= alignment.path.length // 0 = perfectly proportional timing
  const tempoScore = 100 - Math.min(60, Math.abs(Math.log(durationRatio)) * 130)
  const warpScore = 100 - Math.min(70, warp * 600)
  const rhythmScore = clampScore(tempoScore * 0.45 + warpScore * 0.55)
  const rhythm: DimensionScore = {
    score: rhythmScore,
    detail:
      durationRatio > 1.18
        ? `You took ${Math.round((durationRatio - 1) * 100)}% longer than the original.`
        : durationRatio < 0.85
          ? `You rushed it — ${Math.round((1 - durationRatio) * 100)}% faster than the original.`
          : warp > 0.06
            ? 'Overall speed is right, but pauses and stresses fall in different spots.'
            : 'Your pacing tracks the original well.',
  }
  if (rhythmScore < 70) {
    if (durationRatio > 1.18) tips.push('Pick up the pace — match the original word for word, beat for beat.')
    else if (durationRatio < 0.85) tips.push('Slow down. Great orators let lines breathe; honor the pauses.')
    else tips.push('Tap out the stresses while the clip plays, then mirror that drum line in your take.')
  }

  // --- Tone: loudness dynamics + brightness (spectral centroid) ---
  const refEnergy: number[] = []
  const userEnergy: number[] = []
  const refCent: number[] = []
  const userCent: number[] = []
  for (const [i, j] of alignment.path) {
    refEnergy.push(ref.energy[i])
    userEnergy.push(user.energy[j])
    refCent.push(ref.centroid[i])
    userCent.push(user.centroid[j])
  }
  const energyCorr = correlation(refEnergy, userEnergy)
  const centroidCorr = correlation(refCent, userCent)
  const toneScore = clampScore(corrToScore(energyCorr) * 0.65 + corrToScore(centroidCorr) * 0.35)
  const dynamicsRatio = ref.energyDynamics > 0.05 ? user.energyDynamics / ref.energyDynamics : 1
  const tone: DimensionScore = {
    score: toneScore,
    detail:
      energyCorr > 0.6
        ? 'You punch the same words the original does.'
        : dynamicsRatio < 0.6
          ? 'Your delivery is more even-keeled than the original.'
          : 'Your emphasis lands on different words than the original.',
  }
  if (toneScore < 70) {
    if (dynamicsRatio < 0.6) {
      tips.push(`${speaker} drives certain words hard. Find the two or three punched words and hit them.`)
    } else {
      tips.push('Match where the original gets louder and softer — emphasis placement matters more than volume.')
    }
  }

  // --- Pronunciation: did the right words come through? ---
  let pronunciation: DimensionScore
  if (transcript !== null) {
    const target = normalizeWords(targetText)
    const hyp = normalizeWords(transcript)
    const wer = wordErrorRate(target, hyp)
    const pronScore = clampScore(100 * Math.pow(Math.max(0, 1 - wer), 0.8))
    const missing = missingWords(target, hyp)
    pronunciation = {
      score: pronScore,
      detail:
        wer < 0.12
          ? 'Every word came through clearly.'
          : missing.length > 0
            ? `Hard to make out: ${missing.slice(0, 4).map((w) => `“${w}”`).join(', ')}.`
            : 'Most words landed, but some were garbled.',
    }
    if (pronScore < 70 && missing.length > 0) {
      tips.push(`Articulate ${missing.slice(0, 2).map((w) => `“${w}”`).join(' and ')} more crisply.`)
    }
  } else {
    pronunciation = {
      score: null,
      detail: 'Speech recognition unavailable in this browser — not scored.',
    }
  }

  // --- Overall ---
  const parts: Array<[number | null, number]> = [
    [pronunciation.score, 0.3],
    [intonation.score, 0.3],
    [rhythm.score, 0.2],
    [tone.score, 0.2],
  ]
  let total = 0
  let weight = 0
  for (const [s, w] of parts) {
    if (s !== null) {
      total += s * w
      weight += w
    }
  }
  const overall = clampScore(weight > 0 ? total / weight : 0)

  if (tips.length === 0) {
    tips.push('Outstanding mimicry. Try the next speech — or chase a perfect 100.')
  }

  return { overall, pronunciation, intonation, rhythm, tone, tips, transcript, melody }
}

const MELODY_POINTS = 96

/**
 * Both pitch contours resampled onto a common time axis (the DTW path), so
 * the scorecard can draw "your melody vs. theirs" moment by moment.
 */
function melodyContours(
  ref: AudioFeatures,
  user: AudioFeatures,
  path: Array<[number, number]>,
): ScoreReport['melody'] {
  const refOut: Array<number | null> = []
  const userOut: Array<number | null> = []
  const L = path.length
  for (let b = 0; b < MELODY_POINTS; b++) {
    const start = Math.floor((b * L) / MELODY_POINTS)
    const end = Math.max(start + 1, Math.floor(((b + 1) * L) / MELODY_POINTS))
    let rSum = 0
    let rN = 0
    let uSum = 0
    let uN = 0
    for (let k = start; k < end && k < L; k++) {
      const [i, j] = path[k]
      if (!Number.isNaN(ref.pitch[i])) {
        rSum += ref.pitch[i]
        rN++
      }
      if (!Number.isNaN(user.pitch[j])) {
        uSum += user.pitch[j]
        uN++
      }
    }
    refOut.push(rN > 0 ? rSum / rN : null)
    userOut.push(uN > 0 ? uSum / uN : null)
  }
  return { ref: refOut, user: userOut }
}

function emptyAttemptReport(transcript: string | null): ScoreReport {
  const zero: DimensionScore = { score: 5, detail: 'We could barely hear any speech.' }
  return {
    overall: 5,
    pronunciation: { score: transcript ? 5 : null, detail: 'We could barely hear any speech.' },
    intonation: zero,
    rhythm: zero,
    tone: zero,
    tips: ['Check your microphone and speak up — we barely caught anything that time.'],
    transcript,
    melody: null,
  }
}
