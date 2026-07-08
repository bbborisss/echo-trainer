export interface Clip {
  id: string
  speaker: string
  title: string
  year: number
  /** The exact phrase the user should repeat */
  text: string
  /** Path under /clips/ */
  audio: string
  /** Public-domain portrait of the speaker, under /speakers/ */
  image: string
  emoji: string
  context: string
}

export interface DimensionScore {
  /** 0-100, or null when the dimension could not be measured */
  score: number | null
  detail: string
}

export interface ScoreReport {
  overall: number
  pronunciation: DimensionScore
  intonation: DimensionScore
  rhythm: DimensionScore
  tone: DimensionScore
  tips: string[]
  transcript: string | null
  /**
   * DTW-aligned pitch contours (semitones relative to each speaker's median),
   * downsampled for drawing; null = unvoiced. Absent when nothing was heard.
   */
  melody: { ref: Array<number | null>; user: Array<number | null> } | null
}

export interface AudioFeatures {
  /** seconds */
  duration: number
  /** per-frame pitch in semitones relative to the speaker's median; NaN = unvoiced */
  pitch: Float32Array
  /** per-frame RMS energy, z-normalized */
  energy: Float32Array
  /** per-frame spectral centroid (Hz), z-normalized */
  centroid: Float32Array
  /** fraction of frames that are voiced */
  voicedRatio: number
  /** pitch range (5th..95th percentile of relative semitones) */
  pitchRange: number
  /** raw (non-normalized) energy std-dev / mean — dynamics measure */
  energyDynamics: number
}

