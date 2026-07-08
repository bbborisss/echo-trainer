// Export smoke test: drive the full record→score loop, then exercise the
// Stage 1c export buttons on the scorecard and verify the actual bytes.
//   - "Download take" must yield a valid 16-bit PCM WAV (RIFF/WAVE header).
//   - "Share card"  must yield a valid PNG (signature + IHDR 1080×1920).
// Falls back to a plain download when the native share sheet is unavailable
// (headless Chromium has no navigator.canShare({files}), so we get downloads).
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const errors = []
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const context = await browser.newContext({ permissions: ['microphone'] })
const page = await context.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

// Headless has no share sheet, so navigator.share() would hang. Disable the
// Web Share API to force the download fallback — the path that runs our own
// PNG-generation code, which is what this test verifies.
await page.addInitScript(() => {
  try {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  } catch {
    /* ignore */
  }
})

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

// Intro → daily game
await page.waitForSelector('text=Speech of the Day', { timeout: 20000 })
await page.click('text=Speech of the Day')
await page.waitForSelector('button[aria-label="Play"]', { timeout: 10000 })

await page.click('button[aria-label="Play"]')
await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', { timeout: 30000 })
await page.click('button[aria-label="Start recording"]')
await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 10000 })
await page.waitForTimeout(4000)
await page.click('button[aria-label="Stop recording"]')
await page.waitForSelector('text=Coach’s notes', { timeout: 30000 })
console.log('OK scorecard rendered')

const fail = (msg) => {
  console.log('FAIL: ' + msg)
  browser.close().then(() => process.exit(1))
}

// --- Download take (WAV) ---
await page.waitForSelector('text=Download take', { timeout: 10000 })
const [wavDl] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('text=Download take'),
])
const wavPath = await wavDl.path()
const wav = await readFile(wavPath)
if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
  fail(`WAV header wrong: ${wav.toString('ascii', 0, 12)}`)
} else if (wav.readUInt16LE(34) !== 16) {
  fail(`WAV not 16-bit PCM (bits=${wav.readUInt16LE(34)})`)
} else {
  console.log(`OK WAV downloaded (${wav.length} bytes, ${wavDl.suggestedFilename()})`)
}

// --- Share card (PNG) ---
await page.waitForSelector('text=Share card', { timeout: 10000 })
const [pngDl] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('text=Share card'),
])
const pngPath = await pngDl.path()
const png = await readFile(pngPath)
const sigOk = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
const width = png.readUInt32BE(16)
const height = png.readUInt32BE(20)
if (!sigOk) {
  fail('PNG signature missing')
} else if (width !== 1080 || height !== 1920) {
  fail(`PNG dimensions ${width}×${height}, expected 1080×1920`)
} else {
  console.log(`OK share card downloaded (${png.length} bytes, ${width}×${height}, ${pngDl.suggestedFilename()})`)
}
await pngDl.saveAs('scripts/smoke_export_card.png')
console.log('saved rendered card to scripts/smoke_export_card.png')

const benign = (e) => e.includes('speech') || e.includes('network')
const real = errors.filter((e) => !benign(e))
if (real.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of real) console.log('  ' + e)
}
await browser.close()
process.exit(real.length ? 1 : 0)
