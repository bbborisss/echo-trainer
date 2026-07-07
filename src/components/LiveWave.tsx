import { useEffect, useRef } from 'react'
import { drawBars, type GhostWave } from '../audio/waveform'

interface Props {
  analyser: AnalyserNode | null
  /** envelope of the original clip, drawn as a faded shadow to chase */
  ghost: GhostWave | null
}

/** One user-envelope bar per this many seconds of speech. */
const BAR_SECONDS = 0.05

/**
 * Live recording visualization: the original clip's energy envelope sits in
 * the background as a gray "ghost"; the player's mic envelope paints over it
 * in real time. Purely a pacing guide — scoring still uses DTW alignment.
 */
export function LiveWave({ analyser, ghost }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const buf = new Float32Array(analyser.fftSize)
    const levels: number[] = []
    let peakLevel = 0.02 // running normalizer with a floor so room noise stays small
    let raf = 0
    const startedAt = performance.now()

    const draw = () => {
      const t = (performance.now() - startedAt) / 1000
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      const bar = Math.floor(t / BAR_SECONDS)
      while (levels.length <= bar) levels.push(0)
      if (rms > levels[bar]) levels[bar] = rms
      if (rms > peakLevel) peakLevel = rms

      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Timeline covers the reference plus headroom if the player runs long.
      const timeline = Math.max(ghost?.duration ?? 1, t + 0.4)

      if (ghost) {
        const gw = (ghost.duration / timeline) * w
        drawBars(
          ctx,
          ghost.peaks,
          { x: 0, y: 3, width: gw, height: h - 6 },
          { color: 'rgba(100,116,139,0.30)' },
        )
      }

      const userPeaks = levels.map((v) => v / peakLevel)
      const uw = ((levels.length * BAR_SECONDS) / timeline) * w
      drawBars(
        ctx,
        userPeaks,
        { x: 0, y: 3, width: uw, height: h - 6 },
        { color: 'rgba(99,102,241,0.9)' },
      )

      // Playhead
      ctx.fillStyle = 'rgba(99,102,241,0.6)'
      ctx.fillRect((t / timeline) * w, 0, 1.5, h)

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [analyser, ghost])

  return <canvas ref={canvasRef} className="h-20 w-full" />
}
