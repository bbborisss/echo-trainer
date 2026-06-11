// Full-loop smoke test: play the clip, record with a fake mic, and verify a
// scorecard comes back. Uses Chromium fake-media flags so getUserMedia yields
// a synthetic audio stream without prompting.
import { chromium } from 'playwright'

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

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button[aria-label="Play"]', { timeout: 20000 })

// Play the reference clip all the way through to unlock the mic
await page.click('button[aria-label="Play"]')
console.log('clip playing…')
await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', {
  timeout: 30000,
})
console.log('OK mic unlocked after clip finished')

// Record ~4 s of fake-mic audio
await page.click('button[aria-label="Start recording"]')
await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 10000 })
console.log('recording…')
await page.waitForTimeout(4000)
await page.click('button[aria-label="Stop recording"]')

// Scorecard should appear after analysis
await page.waitForSelector('text=Coach’s notes', { timeout: 30000 })
console.log('OK scorecard rendered')

// Tries counter should now show 2 left
await page.waitForSelector('text=Try again (2 left)', { timeout: 15000 })
console.log('OK attempt counted, 2 tries left')

await page.screenshot({ path: 'scripts/smoke_full.png', fullPage: true })
console.log('screenshot saved to scripts/smoke_full.png')

const benign = (e) =>
  e.includes('speech') || e.includes('network') // SpeechRecognition often can't reach its service headless
const real = errors.filter((e) => !benign(e))
if (real.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of real) console.log('  ' + e)
}
await browser.close()
process.exit(real.length ? 1 : 0)
