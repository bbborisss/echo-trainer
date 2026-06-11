// Probe script: edge cases around the play→record→score loop.
// 1. Mic must be gated before the clip is heard.
// 2. A ~300ms recording must be handled gracefully (scorecard or coach apology, no crash).
// 3. Exhausting all 3 tries must lock the clip and advance to the next speech.
// 4. Reloading must persist the lock (locked clip skipped on fresh load).
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

const firstQuote = (await page.textContent('blockquote')).trim()
console.log('first clip quote:', firstQuote.slice(0, 50))

// PROBE 1: mic gated before the clip is heard
const recBtn = page.locator('button[aria-label="Start recording"]')
if (await recBtn.isDisabled()) console.log('PROBE1 OK: record button disabled before clip heard')
else console.log('PROBE1 FAIL: record button enabled before clip heard')

// Hear the clip to unlock
await page.click('button[aria-label="Play"]')
await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', { timeout: 30000 })

// PROBE 2: near-instant recording (~300 ms)
await page.click('button[aria-label="Start recording"]')
await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 10000 })
await page.waitForTimeout(300)
await page.click('button[aria-label="Stop recording"]')
const outcome = await Promise.race([
  page.waitForSelector('text=Coach’s notes', { timeout: 30000 }).then(() => 'scorecard'),
  page.waitForSelector('text=couldn’t analyze', { timeout: 30000 }).then(() => 'apology'),
])
console.log(`PROBE2 OK: 300ms take handled gracefully → ${outcome}`)

// Helper: do one full retry+record cycle
async function takeAnother(ms) {
  await page.click('text=🎤 Try again')
  await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', { timeout: 20000 })
  await page.click('button[aria-label="Start recording"]')
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 10000 })
  await page.waitForTimeout(ms)
  await page.click('button[aria-label="Stop recording"]')
}

// PROBE 3: burn the remaining tries (the 300ms take counted as #1 only if it scored)
if (outcome === 'apology') {
  // didn't count as an attempt; need a real first take
  await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', { timeout: 20000 })
  await page.click('button[aria-label="Start recording"]')
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 10000 })
  await page.waitForTimeout(3000)
  await page.click('button[aria-label="Stop recording"]')
  await page.waitForSelector('text=Coach’s notes', { timeout: 30000 })
}
await page.waitForSelector('text=🎤 Try again (2 left)', { timeout: 20000 })
await takeAnother(3000)
await page.waitForSelector('text=🎤 Try again (1 left)', { timeout: 30000 })
await takeAnother(3000)
await page.waitForSelector('text=locks until tomorrow', { timeout: 30000 })
console.log('PROBE3 OK: third take locked the clip')

// Next speech should auto-appear (a new clip bubble with a different quote)
await page.waitForFunction(
  (q) => {
    const quotes = [...document.querySelectorAll('blockquote')].map((b) => b.textContent.trim())
    return quotes.some((t) => t !== q)
  },
  firstQuote,
  { timeout: 30000 },
)
console.log('PROBE3 OK: auto-advanced to a different speech')

// PROBE 4: reload — locked clip must be skipped
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('blockquote', { timeout: 20000 })
const reloadQuote = (await page.textContent('blockquote')).trim()
if (reloadQuote !== firstQuote) console.log('PROBE4 OK: locked clip skipped after reload →', reloadQuote.slice(0, 50))
else console.log('PROBE4 FAIL: reload served the locked clip again')

await page.screenshot({ path: 'scripts/probe_smoke.png', fullPage: true })
console.log('screenshot saved to scripts/probe_smoke.png')

const benign = (e) => e.includes('speech') || e.includes('network')
const real = errors.filter((e) => !benign(e))
if (real.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of real) console.log('  ' + e)
}
await browser.close()
process.exit(real.length ? 1 : 0)
