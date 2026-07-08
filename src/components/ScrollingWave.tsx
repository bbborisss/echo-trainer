import { useEffect, useMemo, useRef } from 'react'
import { findMilestones, type GhostWave } from '../audio/waveform'

interface Props {
  analyser: AnalyserNode | null
  /** envelope of the original clip, scrolling under the playhead */
  ghost: GhostWave | null
}

/** Horizontal scale — fixed, so long clips genuinely run off-screen. */
const PX_PER_SEC = 140
/** Playhead position as a fraction of the visible width. */
const PLAYHEAD_FRAC = 0.3
/** One user-envelope bar per this many seconds of speech. */
const BAR_SECONDS = 0.05
/** Half-width of the timing window (seconds) for hitting a milestone. */
const HIT_WINDOW = 0.22
/** How loud (vs. the milestone's own ghost height) the player must be to hit it. */
const HIT_LEVEL = 0.5

type MilestoneState = 'pending' | 'hit' | 'missed'

/**
 * Note-highway recording view: time moves at a fixed px/sec, so the ghost
 * envelope starts off-screen right and scrolls left under a fixed playhead.
 * The player's live envelope paints over the ghost as it crosses. Milestone
 * ◆s ride the scroll and light up when hit loud enough, on time. The parent
 * wraps this in gradient edge-fades.
 */
export function ScrollingWave({ analyser, ghost }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const milestones = useMemo(() => (ghost ? findMilestones(ghost.peaks) : []), [ghost])

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

    const states: MilestoneState[] = milestones.map(() => 'pending')
    const hitAt: number[] = milestones.map(() => 0) // for the pop animation

    /** Draw one mirrored rounded bar centered at world-x. */
    const bar = (x: number, half: number, bw: number, midY: number, color: string) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(x - bw / 2, midY - half, bw, half * 2, bw / 2)
      ctx.fill()
    }

    const draw = () => {
      const t = (performance.now() - startedAt) / 1000
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      const idx = Math.floor(t / BAR_SECONDS)
      while (levels.length <= idx) levels.push(0)
      if (rms > levels[idx]) levels[idx] = rms
      if (rms > peakLevel) peakLevel = rms

      // Milestone hit/miss resolution (time-based; independent of drawing)
      if (ghost) {
        const userNorm = rms / peakLevel
        milestones.forEach((mIdx, i) => {
          if (states[i] !== 'pending') return
          const mTime = ((mIdx + 0.5) / ghost.peaks.length) * ghost.duration
          if (Math.abs(t - mTime) <= HIT_WINDOW) {
            if (userNorm >= ghost.peaks[mIdx] * HIT_LEVEL) {
              states[i] = 'hit'
              hitAt[i] = t
            }
          } else if (t > mTime + HIT_WINDOW) {
            states[i] = 'missed'
          }
        })
      }

      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const playheadX = w * PLAYHEAD_FRAC
      const midY = h / 2
      const maxHalf = h / 2 - 14 // headroom for milestone diamonds
      /** world-x of a moment in the clip, given the current scroll */
      const xOf = (time: number) => playheadX + (time - t) * PX_PER_SEC

      // Ghost envelope (only the visible slice)
      if (ghost) {
        const n = ghost.peaks.length
        const slot = (ghost.duration / n) * PX_PER_SEC
        const bw = Math.max(1.5, slot * 0.6)
        const lo = Math.max(0, Math.floor(((t - playheadX / PX_PER_SEC) / ghost.duration) * n) - 1)
        const hi = Math.min(n, Math.ceil(((t + (w - playheadX) / PX_PER_SEC) / ghost.duration) * n) + 1)
        for (let i = lo; i < hi; i++) {
          const x = xOf(((i + 0.5) / n) * ghost.duration)
          const past = x <= playheadX
          bar(
            x,
            Math.max(1.5, ghost.peaks[i] * maxHalf),
            bw,
            midY,
            past ? 'rgba(113,113,122,0.18)' : 'rgba(113,113,122,0.4)',
          )
        }
      }

      // Player envelope (everything already sung sits left of the playhead)
      {
        const slot = BAR_SECONDS * PX_PER_SEC
        const bw = Math.max(1.5, slot * 0.6)
        const lo = Math.max(0, Math.floor((t - playheadX / PX_PER_SEC) / BAR_SECONDS) - 1)
        for (let j = lo; j < levels.length; j++) {
          const x = xOf((j + 0.5) * BAR_SECONDS)
          bar(x, Math.max(1.5, (levels[j] / peakLevel) * maxHalf), bw, midY, 'rgba(249,115,22,0.9)')
        }
      }

      // Milestone diamonds ride the scroll near the top edge
      if (ghost) {
        milestones.forEach((mIdx, i) => {
          const x = xOf(((mIdx + 0.5) / ghost.peaks.length) * ghost.duration)
          if (x < -12 || x > w + 12) return
          const state = states[i]
          const pop = state === 'hit' ? Math.max(0, 1 - (t - hitAt[i]) / 0.3) : 0
          const r = 5 + pop * 4
          const y = 10
          ctx.beginPath()
          ctx.moveTo(x, y - r)
          ctx.lineTo(x + r, y)
          ctx.lineTo(x, y + r)
          ctx.lineTo(x - r, y)
          ctx.closePath()
          if (state === 'hit') {
            ctx.fillStyle = '#fb923c'
            ctx.shadowColor = 'rgba(251,146,60,0.9)'
            ctx.shadowBlur = 8 + pop * 10
            ctx.fill()
            ctx.shadowBlur = 0
          } else if (state === 'missed') {
            ctx.fillStyle = 'rgba(113,113,122,0.35)'
            ctx.fill()
          } else {
            ctx.strokeStyle = 'rgba(251,146,60,0.8)'
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
        })

        // Hit tally, pinned top-right
        const hits = states.filter((s) => s === 'hit').length
        ctx.fillStyle = 'rgba(251,146,60,0.9)'
        ctx.font = '600 12px system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        ctx.fillText(`◆ ${hits}/${milestones.length}`, w - 6, 4)
      }

      // Playhead — fixed; the world moves past it
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(251,146,60,0.15)')
      grad.addColorStop(0.5, 'rgba(251,146,60,0.9)')
      grad.addColorStop(1, 'rgba(251,146,60,0.15)')
      ctx.fillStyle = grad
      ctx.fillRect(playheadX - 1, 0, 2, h)

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [analyser, ghost, milestones])

  return (
    <div className="relative w-full">
      <canvas ref={canvasRef} className="h-28 w-full" />
      {/* edge fades: the wave dissolves off both sides of the screen */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-zinc-950 to-transparent" />
    </div>
  )
}
