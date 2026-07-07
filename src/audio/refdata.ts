import type { AudioFeatures, Clip } from '../types'
import { decodeToMono, extractFeatures, trimSilence } from './dsp'
import { computePeaks, type GhostWave } from './waveform'

export interface RefData {
  features: AudioFeatures
  wave: GhostWave
}

// Reference features are computed once per clip per session and cached.
const cache = new Map<string, Promise<RefData>>()

export function getRefData(clip: Clip): Promise<RefData> {
  let cached = cache.get(clip.id)
  if (!cached) {
    cached = fetch(clip.audio)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load clip: ${r.status}`)
        return r.arrayBuffer()
      })
      .then(decodeToMono)
      .then((samples) => {
        const features = extractFeatures(samples)
        const speech = trimSilence(samples)
        return { features, wave: { peaks: computePeaks(speech, 96), duration: features.duration } }
      })
    cached.catch(() => cache.delete(clip.id))
    cache.set(clip.id, cached)
  }
  return cached
}
