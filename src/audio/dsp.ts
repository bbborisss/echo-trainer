import type { AudioFeatures } from '../types'

const SAMPLE_RATE = 16000
const FRAME_SIZE = 1024
const HOP_SIZE = 256
const F0_MIN = 65
const F0_MAX = 500
const YIN_THRESHOLD = 0.18

/** Decode arbitrary encoded audio (mp3/ogg/webm blob) to 16 kHz mono samples. */
export async function decodeToMono(data: ArrayBuffer): Promise<Float32Array> {
  // Decode at native rate first (decodeAudioData on an OfflineAudioContext
  // resamples for us when we render through it).
  const probe = new AudioContext()
  const decoded = await probe.decodeAudioData(data.slice(0))
  await probe.close()

  const length = Math.ceil(decoded.duration * SAMPLE_RATE)
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

/** Strip leading/trailing silence so timing scores measure speech, not dead air. */
export function trimSilence(samples: Float32Array): Float32Array {
  const win = 256
  let peak = 0
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0
    const end = Math.min(i + win, samples.length)
    for (let j = i; j < end; j++) sum += samples[j] * samples[j]
    peak = Math.max(peak, Math.sqrt(sum / (end - i)))
  }
  const threshold = peak * 0.06
  let start = 0
  let stop = samples.length

  outer: for (let i = 0; i < samples.length; i += win) {
    let sum = 0
    const end = Math.min(i + win, samples.length)
    for (let j = i; j < end; j++) sum += samples[j] * samples[j]
    if (Math.sqrt(sum / (end - i)) > threshold) {
      start = Math.max(0, i - win * 4)
      break outer
    }
  }
  outer2: for (let i = samples.length - win; i >= 0; i -= win) {
    let sum = 0
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j]
    if (Math.sqrt(sum / win) > threshold) {
      stop = Math.min(samples.length, i + win * 5)
      break outer2
    }
  }
  return start < stop ? samples.slice(start, stop) : samples
}

/** YIN pitch detection for one frame. Returns f0 in Hz or NaN if unvoiced. */
function yinPitch(frame: Float32Array): number {
  const tauMin = Math.floor(SAMPLE_RATE / F0_MAX)
  const tauMax = Math.min(Math.floor(SAMPLE_RATE / F0_MIN), frame.length - 1)
  const diff = new Float32Array(tauMax + 1)

  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0
    for (let i = 0; i < frame.length - tau; i++) {
      const d = frame[i] - frame[i + tau]
      sum += d * d
    }
    diff[tau] = sum
  }

  // Cumulative mean normalized difference
  const cmnd = new Float32Array(tauMax + 1)
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau]
    cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1
  }

  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++
      // Parabolic interpolation around the minimum
      let betterTau = tau
      if (tau > 1 && tau < tauMax) {
        const s0 = cmnd[tau - 1]
        const s1 = cmnd[tau]
        const s2 = cmnd[tau + 1]
        const denom = 2 * (2 * s1 - s2 - s0)
        if (Math.abs(denom) > 1e-12) betterTau = tau + (s2 - s0) / denom
      }
      return SAMPLE_RATE / betterTau
    }
  }
  return NaN
}

function spectralCentroid(frame: Float32Array, hann: Float32Array): number {
  const n = frame.length
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = frame[i] * hann[i]
  fft(re, im)
  let num = 0
  let den = 0
  for (let k = 1; k < n / 2; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k])
    num += mag * ((k * SAMPLE_RATE) / n)
    den += mag
  }
  return den > 1e-9 ? num / den : 0
}

/** In-place radix-2 FFT */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j]
        const uIm = im[i + j]
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + len / 2] = uRe - vRe
        im[i + j + len / 2] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

function zNormalize(arr: Float32Array): Float32Array {
  let mean = 0
  for (const v of arr) mean += v
  mean /= arr.length || 1
  let variance = 0
  for (const v of arr) variance += (v - mean) * (v - mean)
  const std = Math.sqrt(variance / (arr.length || 1)) || 1
  const out = new Float32Array(arr.length)
  for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - mean) / std
  return out
}

/** Median filter (window 5) that skips NaN gaps shorter than the window. */
function smoothPitch(pitch: Float32Array): Float32Array {
  const out = new Float32Array(pitch.length)
  for (let i = 0; i < pitch.length; i++) {
    const window: number[] = []
    for (let j = Math.max(0, i - 2); j <= Math.min(pitch.length - 1, i + 2); j++) {
      if (!Number.isNaN(pitch[j])) window.push(pitch[j])
    }
    out[i] = Number.isNaN(pitch[i]) && window.length < 3 ? NaN : window.length ? median(window) : NaN
  }
  return out
}

/**
 * Extract the full feature set used for scoring. Pitch is expressed in
 * semitones relative to the speaker's own median so register differences
 * (e.g. imitating a deeper voice) are not penalized — only contour shape is.
 */
export function extractFeatures(samplesRaw: Float32Array): AudioFeatures {
  const samples = trimSilence(samplesRaw)
  const frameCount = Math.max(1, Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1)

  const hann = new Float32Array(FRAME_SIZE)
  for (let i = 0; i < FRAME_SIZE; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1))
  }

  const rawPitchHz = new Float32Array(frameCount)
  const rawEnergy = new Float32Array(frameCount)
  const rawCentroid = new Float32Array(frameCount)

  for (let f = 0; f < frameCount; f++) {
    const frame = samples.subarray(f * HOP_SIZE, f * HOP_SIZE + FRAME_SIZE)
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    rawEnergy[f] = Math.sqrt(sum / frame.length)
    rawCentroid[f] = spectralCentroid(frame, hann)
    rawPitchHz[f] = NaN // filled below only for sufficiently loud frames
  }

  const energyPeak = percentile(Array.from(rawEnergy), 0.95)
  for (let f = 0; f < frameCount; f++) {
    if (rawEnergy[f] > energyPeak * 0.1) {
      const frame = samples.subarray(f * HOP_SIZE, f * HOP_SIZE + FRAME_SIZE)
      rawPitchHz[f] = yinPitch(frame)
    }
  }

  // Hz -> semitones relative to this speaker's median
  const voicedHz = Array.from(rawPitchHz).filter((v) => !Number.isNaN(v))
  const medianHz = median(voicedHz) || 1
  const pitchSemis = new Float32Array(frameCount)
  for (let f = 0; f < frameCount; f++) {
    pitchSemis[f] = Number.isNaN(rawPitchHz[f])
      ? NaN
      : 12 * Math.log2(rawPitchHz[f] / medianHz)
  }
  const pitch = smoothPitch(pitchSemis)

  const voiced = Array.from(pitch).filter((v) => !Number.isNaN(v))
  const energyMean = rawEnergy.reduce((a, b) => a + b, 0) / frameCount
  const energyStd = Math.sqrt(
    Array.from(rawEnergy).reduce((a, b) => a + (b - energyMean) ** 2, 0) / frameCount,
  )

  return {
    duration: samples.length / SAMPLE_RATE,
    pitch,
    energy: zNormalize(rawEnergy),
    centroid: zNormalize(rawCentroid),
    voicedRatio: voiced.length / frameCount,
    pitchRange: percentile(voiced, 0.95) - percentile(voiced, 0.05),
    energyDynamics: energyMean > 1e-9 ? energyStd / energyMean : 0,
  }
}
