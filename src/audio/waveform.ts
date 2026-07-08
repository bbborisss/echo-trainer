/**
 * Utilities for turning audio into stylized waveform drawings. Shared by the
 * live recording view, clip bubbles and the share-card/video exporters.
 */

/** Downsample samples into N normalized RMS peaks (0..1) for drawing. */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets)
  if (samples.length === 0) return out
  const per = samples.length / buckets
  let max = 0
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per)
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((b + 1) * per)))
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    out[b] = Math.sqrt(sum / (end - start))
    if (out[b] > max) max = out[b]
  }
  if (max > 0) for (let b = 0; b < buckets; b++) out[b] /= max
  return out
}

export interface WaveRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BarStyle {
  color: string
  /** fraction of each bar slot occupied by the bar; rest is gap (default 0.65) */
  fill?: number
  /** minimum half-height in px so silence still reads as a dotted line (default 1) */
  minHalf?: number
}

/** Draw a mirrored rounded-bar waveform centered vertically in `rect`. */
export function drawBars(
  ctx: CanvasRenderingContext2D,
  peaks: ArrayLike<number>,
  rect: WaveRect,
  style: BarStyle,
): void {
  const n = peaks.length
  if (n === 0 || rect.width <= 0 || rect.height <= 0) return
  const slot = rect.width / n
  const bw = Math.max(1, slot * (style.fill ?? 0.65))
  const midY = rect.y + rect.height / 2
  const maxHalf = rect.height / 2
  const minHalf = style.minHalf ?? 1
  ctx.fillStyle = style.color
  for (let i = 0; i < n; i++) {
    const half = Math.min(maxHalf, Math.max(minHalf, peaks[i] * maxHalf))
    const x = rect.x + i * slot + (slot - bw) / 2
    ctx.beginPath()
    ctx.roundRect(x, midY - half, bw, half * 2, bw / 2)
    ctx.fill()
  }
}

/** The reference clip's envelope, used as the "shadow" the player chases. */
export interface GhostWave {
  peaks: Float32Array
  /** seconds of actual speech (silence-trimmed) */
  duration: number
}

/**
 * Pick up to `count` prominent local maxima of an envelope as gameplay
 * "milestones" — the loudness peaks the player should hit. Peaks are kept at
 * least `minGapFrac` of the envelope apart so they don't cluster in one burst.
 * Returns bucket indices in ascending order.
 */
export function findMilestones(peaks: ArrayLike<number>, count = 5, minGapFrac = 0.08): number[] {
  const n = peaks.length
  if (n < 3) return []
  const minGap = Math.max(1, Math.round(n * minGapFrac))
  // Local maxima (plateau-tolerant: strictly greater than one side, >= other)
  const candidates: number[] = []
  for (let i = 1; i < n - 1; i++) {
    if (peaks[i] >= peaks[i - 1] && peaks[i] > peaks[i + 1]) candidates.push(i)
  }
  candidates.sort((a, b) => peaks[b] - peaks[a])
  const chosen: number[] = []
  for (const idx of candidates) {
    if (chosen.length >= count) break
    if (chosen.every((c) => Math.abs(c - idx) >= minGap)) chosen.push(idx)
  }
  return chosen.sort((a, b) => a - b)
}
