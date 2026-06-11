import type { AudioFeatures } from '../types'

export interface Alignment {
  /** pairs of [refFrame, userFrame] along the optimal path */
  path: Array<[number, number]>
  /** mean normalized cost along the path */
  cost: number
}

/** Cost between one reference frame and one user frame. */
function frameCost(ref: AudioFeatures, user: AudioFeatures, i: number, j: number): number {
  const refVoiced = !Number.isNaN(ref.pitch[i])
  const userVoiced = !Number.isNaN(user.pitch[j])

  let pitchCost: number
  if (refVoiced && userVoiced) {
    pitchCost = Math.min(Math.abs(ref.pitch[i] - user.pitch[j]) / 6, 1.5)
  } else if (refVoiced !== userVoiced) {
    pitchCost = 0.8 // voicing mismatch (speaking where the original pauses, etc.)
  } else {
    pitchCost = 0
  }

  const energyCost = Math.min(Math.abs(ref.energy[i] - user.energy[j]) / 2, 1.5)
  return pitchCost * 0.6 + energyCost * 0.4
}

/**
 * Dynamic time warping with a Sakoe-Chiba band. Aligns the user's take to the
 * reference so all dimension scores compare corresponding moments of speech
 * even when the user speaks faster or slower overall.
 */
export function align(ref: AudioFeatures, user: AudioFeatures): Alignment {
  const n = ref.energy.length
  const m = user.energy.length
  const band = Math.max(Math.floor(Math.max(n, m) * 0.25), 40)

  const INF = Number.POSITIVE_INFINITY
  // dp[i][j] flattened; only cells within the band are touched
  const dp = new Float64Array(n * m).fill(INF)
  const from = new Int8Array(n * m) // 0 = diag, 1 = up (skip ref), 2 = left (skip user)

  const idx = (i: number, j: number) => i * m + j
  const ratio = m / n

  for (let i = 0; i < n; i++) {
    const center = Math.round(i * ratio)
    const jStart = Math.max(0, center - band)
    const jEnd = Math.min(m - 1, center + band)
    for (let j = jStart; j <= jEnd; j++) {
      const c = frameCost(ref, user, i, j)
      if (i === 0 && j === 0) {
        dp[idx(i, j)] = c
        continue
      }
      const diag = i > 0 && j > 0 ? dp[idx(i - 1, j - 1)] : INF
      const up = i > 0 ? dp[idx(i - 1, j)] + 0.05 : INF // small bias toward diagonal
      const left = j > 0 ? dp[idx(i, j - 1)] + 0.05 : INF
      const best = Math.min(diag, up, left)
      if (best === INF) continue
      dp[idx(i, j)] = best + c
      from[idx(i, j)] = best === diag ? 0 : best === up ? 1 : 2
    }
  }

  // Backtrack
  const path: Array<[number, number]> = []
  let i = n - 1
  let j = m - 1
  // If the corner was outside the band (extreme length mismatch), walk in
  while (dp[idx(i, j)] === INF && j > 0) j--
  const totalCost = dp[idx(i, j)]
  while (i > 0 || j > 0) {
    path.push([i, j])
    const dir = from[idx(i, j)]
    if (dir === 0 && i > 0 && j > 0) {
      i--
      j--
    } else if (dir === 1 && i > 0) {
      i--
    } else if (j > 0) {
      j--
    } else {
      i--
    }
  }
  path.push([0, 0])
  path.reverse()

  return { path, cost: Number.isFinite(totalCost) ? totalCost / path.length : 1 }
}
