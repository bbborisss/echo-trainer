// UI smoke test: intro screen renders, daily game screen shows hero/occasion/
// quote/audio player, mic gate works, no console errors. Drives Edge headlessly.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

// Intro screen: title + the two doors
await page.waitForSelector('text=Echo Chamber', { timeout: 20000 })
await page.waitForSelector('text=Speech of the Day', { timeout: 5000 })
await page.waitForSelector('text=Practice', { timeout: 5000 })
console.log('OK intro screen rendered with daily + practice doors')
await page.screenshot({ path: 'scripts/smoke_intro.png', fullPage: true })

// Enter the daily game
await page.click('text=Speech of the Day')
await page.waitForSelector('text=The occasion', { timeout: 10000 })
await page.waitForSelector('blockquote', { timeout: 5000 })
await page.waitForSelector('button[aria-label="Play"]', { timeout: 5000 })
await page.waitForSelector('img[alt^="Portrait"]', { timeout: 5000 })
console.log('OK game screen: portrait, occasion, quote, audio player')

// Mic should be locked before the clip has been heard
await page.waitForSelector('text=Play the clip all the way through', { timeout: 10000 })
const micDisabled = await page.$eval(
  'button[aria-label="Start recording"]',
  (el) => el.disabled,
)
console.log(micDisabled ? 'OK mic gated until clip heard' : 'FAIL mic should be disabled')

// Reference clip should be fetchable
const clipStatus = await page.evaluate(() =>
  fetch('/clips/armstrong-step.mp3').then((r) => r.status),
)
console.log(clipStatus === 200 ? 'OK clip audio served' : `FAIL clip fetch ${clipStatus}`)

await page.screenshot({ path: 'scripts/smoke.png', fullPage: true })
console.log('screenshots saved to scripts/smoke_intro.png + scripts/smoke.png')

if (errors.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of errors) console.log('  ' + e)
} else {
  console.log('OK no console errors')
}

await browser.close()
if (errors.length || micDisabled === false) process.exit(1)
