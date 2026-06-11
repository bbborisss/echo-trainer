// UI smoke test: greeting renders, clip bubble with audio player appears,
// mic gate works, no console errors. Drives system Edge headlessly.
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

// Coach greeting (typed out with delays)
await page.waitForSelector('text=Welcome to Echo Chamber', { timeout: 20000 })
console.log('OK greeting rendered')

// First clip bubble: speaker label + quoted phrase + play button
await page.waitForSelector('text=Neil Armstrong, 1969', { timeout: 20000 })
await page.waitForSelector('text=one small step', { timeout: 5000 })
await page.waitForSelector('button[aria-label="Play"]', { timeout: 5000 })
console.log('OK clip bubble with audio player rendered')

// Mic should be locked before the clip has been heard
await page.waitForSelector('text=Play the clip all the way through', { timeout: 10000 })
const micDisabled = await page.$eval(
  'button[aria-label="Start recording"]',
  (el) => el.disabled,
)
console.log(micDisabled ? 'OK mic gated until clip heard' : 'FAIL mic should be disabled')

// Header chrome
await page.waitForSelector('text=Speak like history', { timeout: 5000 })

// Reference clip should be fetchable
const clipStatus = await page.evaluate(() =>
  fetch('/clips/armstrong-step.mp3').then((r) => r.status),
)
console.log(clipStatus === 200 ? 'OK clip audio served' : `FAIL clip fetch ${clipStatus}`)

await page.screenshot({ path: 'scripts/smoke.png', fullPage: true })
console.log('screenshot saved to scripts/smoke.png')

if (errors.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of errors) console.log('  ' + e)
} else {
  console.log('OK no console errors')
}

await browser.close()
if (errors.length || micDisabled === false) process.exit(1)
