// Probe script: edge cases around the daily/practice game rules.
// 1. Mic must be gated before the clip is heard.
// 2. A ~300ms recording must be handled gracefully (results or apology, no crash).
// 3. Exhausting the daily's 3 takes must lock it ("Keep practicing", no retry).
// 4. Reloading must persist the lock (intro shows "Done for today").
// 5. Practice must be unlimited (retry offered with no counter) and must not
//    list today's daily clip.
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

// Intro → daily game
await page.waitForSelector('text=Speech of the Day', { timeout: 20000 })
await page.click('text=Speech of the Day')
await page.waitForSelector('button[aria-label="Play"]', { timeout: 10000 })

const dailySpeaker = (await page.textContent('main img[alt^="Portrait"] + div div')).trim()
console.log('daily speaker:', dailySpeaker)

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
  page.waitForSelector('text=Coach’s notes', { timeout: 30000 }).then(() => 'results'),
  page.waitForSelector('text=Couldn’t analyze', { timeout: 30000 }).then(() => 'apology'),
])
console.log(`PROBE2 OK: 300ms take handled gracefully → ${outcome}`)

// Helper: record one take (assumes we're on the listen phase, mic unlocked)
async function recordTake(ms) {
  await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', { timeout: 20000 })
  await page.click('button[aria-label="Start recording"]')
  await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 10000 })
  await page.waitForTimeout(ms)
  await page.click('button[aria-label="Stop recording"]')
  await page.waitForSelector('text=Coach’s notes', { timeout: 30000 })
}

// PROBE 3: burn the remaining daily takes (the 300ms take counted only if it scored)
if (outcome === 'apology') {
  await recordTake(3000)
}
await page.waitForSelector('text=Try again (2 left)', { timeout: 20000 })
await page.click('text=Try again (2 left)')
await recordTake(3000)
await page.waitForSelector('text=Try again (1 left)', { timeout: 20000 })
await page.click('text=Try again (1 left)')
await recordTake(3000)
await page.waitForSelector('text=Keep practicing', { timeout: 20000 })
await page.waitForSelector('text=last take on today’s speech', { timeout: 5000 })
console.log('PROBE3 OK: third take locked the daily (no retry, practice CTA)')

// PROBE 4: reload — intro must show the daily as done
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Done for today', { timeout: 20000 })
const dailyBtnDisabled = await page.$eval(
  'button:has-text("Speech of the Day")',
  (el) => el.disabled,
)
console.log(
  dailyBtnDisabled
    ? 'PROBE4 OK: reload kept the daily locked'
    : 'PROBE4 FAIL: daily playable again after reload',
)

// PROBE 5: practice is unlimited and hides the daily clip
await page.click('text=🎯 Practice')
await page.waitForSelector('img[alt^="Portrait"]', { timeout: 10000 })
const practiceSpeakers = await page.$$eval('main img[alt^="Portrait"]', (imgs) =>
  imgs.map((i) => i.alt.replace('Portrait of ', '')),
)
if (practiceSpeakers.includes(dailySpeaker)) {
  console.log('PROBE5 FAIL: daily clip listed in practice:', practiceSpeakers.join(', '))
} else {
  console.log('PROBE5 OK: daily clip hidden from practice grid')
}
await page.click('main button') // first practice card
await page.waitForSelector('text=unlimited takes', { timeout: 10000 })
await page.click('button[aria-label="Play"]')
await page.waitForSelector('button[aria-label="Start recording"]:not([disabled])', { timeout: 30000 })
await recordTake(2000)
const retryText = (await page.textContent('button:has-text("Try again")')).trim()
if (/\(\d+ left\)/.test(retryText)) {
  console.log('PROBE5 FAIL: practice retry shows a counter:', retryText)
} else {
  console.log('PROBE5 OK: practice retry is unlimited (no counter)')
}

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
