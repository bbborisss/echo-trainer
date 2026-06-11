/** Synthetic sanity checks for the DSP scoring pipeline (run: npx tsx scripts/test_scoring.mts) */
import { extractFeatures } from '../src/audio/dsp'
import { scoreAttempt } from '../src/audio/score'

const SR = 16000

/** Synthesize speech-like audio: pitch contour (Hz over time) + syllable amplitude envelope. */
function synth(seconds: number, f0: (t: number) => number, amp: (t: number) => number): Float32Array {
  const n = Math.floor(seconds * SR)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    phase += (2 * Math.PI * f0(t)) / SR
    // a couple of harmonics so it resembles voice
    out[i] = amp(t) * (0.6 * Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase))
  }
  return out
}

const contour = (t: number) => 140 + 40 * Math.sin(2 * Math.PI * 0.7 * t) + 15 * Math.sin(2 * Math.PI * 2.1 * t)
const syllables = (t: number) => 0.35 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 3 * t)) * (t < 2.8 ? 1 : 0)

const ref = extractFeatures(synth(3, contour, syllables))

// Good imitation: same shapes, higher register (should NOT be penalized), 10% slower
const good = extractFeatures(
  synth(3.3, (t) => 1.6 * contour(t / 1.1), (t) => syllables(t / 1.1)),
)

// Bad imitation: flat monotone, even loudness, much faster
const bad = extractFeatures(
  synth(1.8, () => 180, (t) => 0.3 * (t < 1.7 ? 1 : 0)),
)

const goodReport = scoreAttempt({ ref, user: good, targetText: 'test phrase here', transcript: null, speaker: 'Test' })
const badReport = scoreAttempt({ ref, user: bad, targetText: 'test phrase here', transcript: null, speaker: 'Test' })

console.log('GOOD take :', JSON.stringify({
  overall: goodReport.overall,
  intonation: goodReport.intonation.score,
  rhythm: goodReport.rhythm.score,
  tone: goodReport.tone.score,
}))
console.log('BAD take  :', JSON.stringify({
  overall: badReport.overall,
  intonation: badReport.intonation.score,
  rhythm: badReport.rhythm.score,
  tone: badReport.tone.score,
}))

if (goodReport.overall <= badReport.overall + 15) {
  console.error('FAIL: good take should clearly outscore bad take')
  process.exit(1)
}
if (goodReport.overall < 70) {
  console.error('FAIL: faithful imitation scored too low (calibration off)')
  process.exit(1)
}
console.log('PASS')
