/**
 * Renders a vertical (1080×1920) share card for a scored attempt: speaker
 * portrait, the quote, an overall-score ring, per-dimension chips, and the two
 * waveforms (original vs. you). Suitable for IG/TikTok stories.
 *
 * Everything is composited on a single canvas so the result is one PNG blob.
 * Reuses `drawBars()` so the exported waveforms match the in-app ones.
 */
import type { ScoreReport } from '../types'
import { drawBars } from './waveform'

export interface ShareCardInput {
  speaker: string
  title: string
  year: number
  emoji: string
  quote: string
  /** portrait URL (same-origin so the canvas stays untainted) */
  image: string
  report: ScoreReport
  /** silence-trimmed envelope peaks (0..1) */
  refPeaks: ArrayLike<number>
  userPeaks: ArrayLike<number>
}

const W = 1080
const H = 1920

function scoreColor(score: number): string {
  if (score >= 70) return '#34d399'
  if (score >= 45) return '#38bdf8'
  return '#fb7185'
}

function grade(score: number): string {
  if (score >= 90) return 'Legendary'
  if (score >= 80) return 'Excellent'
  if (score >= 70) return 'Strong'
  if (score >= 55) return 'Getting there'
  if (score >= 40) return 'Rough draft'
  return 'Keep at it'
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/** Word-wrap `text` to `maxWidth`, returning the lines. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, score: number) {
  const color = scoreColor(score)
  const thickness = 26
  // Track
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.lineWidth = thickness
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.stroke()
  // Progress arc
  const start = -Math.PI / 2
  ctx.beginPath()
  ctx.arc(cx, cy, radius, start, start + (score / 100) * Math.PI * 2)
  ctx.lineWidth = thickness
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.lineCap = 'butt'
  // Number
  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 130px system-ui, sans-serif'
  ctx.fillText(String(score), cx, cy + 6)
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  label: string,
  peaks: ArrayLike<number>,
  y: number,
  color: string,
) {
  const x = 96
  const width = W - x * 2
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.fillText(label, x, y)
  drawBars(ctx, peaks, { x, y: y + 18, width, height: 104 }, { color, minHalf: 2, fill: 0.7 })
}

function drawDimensions(ctx: CanvasRenderingContext2D, report: ScoreReport, y: number) {
  const dims: Array<[string, ScoreReport['pronunciation']]> = [
    ['Pron.', report.pronunciation],
    ['Inton.', report.intonation],
    ['Rhythm', report.rhythm],
    ['Tone', report.tone],
  ]
  const gap = 24
  const total = W - 96 * 2
  const cw = (total - gap * (dims.length - 1)) / dims.length
  const ch = 130
  const x0 = 96
  dims.forEach(([name, dim], i) => {
    const x = x0 + i * (cw + gap)
    roundRect(ctx, x, y, cw, ch, 24)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '600 28px system-ui, sans-serif'
    ctx.fillText(name, x + cw / 2, y + 44)
    ctx.fillStyle = dim.score === null ? 'rgba(255,255,255,0.35)' : scoreColor(dim.score)
    ctx.font = '800 54px system-ui, sans-serif'
    ctx.fillText(dim.score === null ? '—' : String(dim.score), x + cw / 2, y + 104)
  })
}

/** Composite the share card and return it as a PNG blob. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#27272a')
  bg.addColorStop(1, '#09090b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Brand header
  ctx.fillStyle = '#fb923c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '800 40px system-ui, sans-serif'
  ctx.fillText('🎙️  ECHO CHAMBER', W / 2, 110)

  // Portrait (rounded square, cover-fit)
  const size = 380
  const px = (W - size) / 2
  const py = 170
  try {
    const img = await loadImage(input.image)
    ctx.save()
    roundRect(ctx, px, py, size, size, 40)
    ctx.clip()
    const scale = Math.max(size / img.width, size / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, px + (size - dw) / 2, py, dw, dh)
    ctx.restore()
  } catch {
    // Portrait is decorative; leave a subtle placeholder if it fails.
    ctx.save()
    roundRect(ctx, px, py, size, size, 40)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
    ctx.restore()
  }

  // Speaker + subtitle
  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'center'
  ctx.font = '800 64px system-ui, sans-serif'
  ctx.fillText(input.speaker, W / 2, py + size + 96)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '500 36px system-ui, sans-serif'
  ctx.fillText(`${input.emoji}  ${input.title} · ${input.year}`, W / 2, py + size + 150)

  // Quote (italic, wrapped, max 3 lines)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = 'italic 500 42px Georgia, serif'
  const quoteLines = wrapLines(ctx, `“${input.quote}”`, W - 200).slice(0, 3)
  let qy = py + size + 232
  for (const line of quoteLines) {
    ctx.fillText(line, W / 2, qy)
    qy += 56
  }

  // Score ring
  const ringY = qy + 190
  drawRing(ctx, W / 2, ringY, 160, input.report.overall)
  ctx.fillStyle = scoreColor(input.report.overall)
  ctx.textAlign = 'center'
  ctx.font = '700 46px system-ui, sans-serif'
  ctx.fillText(grade(input.report.overall), W / 2, ringY + 240)

  // Dimension chips
  drawDimensions(ctx, input.report, ringY + 296)

  // Waveforms
  drawWaveform(ctx, 'Original', input.refPeaks, 1570, '#71717a')
  drawWaveform(ctx, 'You', input.userPeaks, 1720, '#fb923c')

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.textAlign = 'center'
  ctx.font = '500 30px system-ui, sans-serif'
  ctx.fillText('Can you out-speak history? · Echo Chamber', W / 2, 1892)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode share card'))),
      'image/png',
    )
  })
}
