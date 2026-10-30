// End-to-end check of the side panel against the mock backend and the demo calendar.
// Prereqs: `make backend-mock` running, `npm run build` done (without OAuth client IDs).
// Usage: CHROME=/path/to/chrome node e2e/mock-flow.mjs [screenshotDir]
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(here, '../dist')
const demo = resolve(here, '../../demo')
const shots = process.argv[2] ? resolve(process.argv[2]) : null
const executablePath =
  process.env.CHROME ||
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome')

const step = (msg) => console.log(`• ${msg}`)
const fail = (msg) => {
  throw new Error(msg)
}

const browser = await puppeteer.launch({
  executablePath,
  headless: process.env.HEADFUL ? false : true,
  enableExtensions: [dist],
  pipe: true,
  env: { ...process.env, TZ: 'America/Chicago' },
  args: ['--no-first-run', '--no-default-browser-check'],
})

try {
  const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), {
    timeout: 15_000,
  })
  const extId = new URL(worker.url()).host
  step(`extension loaded: ${extId}`)

  const page = await browser.newPage()
  await page.setViewport({ width: 400, height: 860, deviceScaleFactor: 2 })
  page.on('pageerror', (err) => console.error('  page error:', err.message))
  await page.goto(`chrome-extension://${extId}/sidepanel.html`)
  if (shots) await mkdir(shots, { recursive: true })

  const text = (t) => page.waitForSelector(`::-p-text(${t})`, { timeout: 15_000 })
  const click = async (t) => (await text(t)).click()
  const shot = async (name) => {
    if (!shots) return
    await new Promise((r) => setTimeout(r, 450))
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
  }
  const feed = async (png, tabTitle) => {
    const image = `data:image/png;base64,${(await readFile(resolve(demo, png))).toString('base64')}`
    await page.evaluate(
      (image, tabTitle) =>
        chrome.storage.session.set({
          scan: { opId: crypto.randomUUID(), status: 'CAPTURED', image, tabTitle, capturedAt: new Date().toISOString(), source: 'shortcut' },
        }),
      image,
      tabTitle,
    )
  }
  const events = () => page.evaluate(async () => (await chrome.storage.local.get('mockCalendarEvents')).mockCalendarEvents ?? [])
  const primaryButton = (label) => page.waitForSelector(`button::-p-text(${label})`)

  // Fresh demo state
  await page.evaluate(() => chrome.storage.local.clear())
  await page.reload()

  step('welcome screen')
  await text('See a change.')
  await shot('1-welcome')
  await click('Connect demo calendar')
  await text('Calendar AMEND will change')
  await shot('2-connected')

  step('scene 1: create')
  await feed('create.png', 'Robotics Workshop flyer · AMEND demo (create)')
  await text('Reading the announcement')
  await shot('3-analyzing')
  await text('Add to calendar')
  const title = await page.$eval('#p0-title', (el) => el.value)
  if (title !== 'Robotics Workshop') fail(`unexpected title ${title}`)
  const [start, end] = await Promise.all([page.$eval('#p0-start', (el) => el.value), page.$eval('#p0-end', (el) => el.value)])
  if (start !== '15:00' || end !== '16:30') fail(`unexpected times ${start}-${end}`)
  await shot('4-create-review')
  // Double-click must not create two events.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Add to calendar'))
    btn.click()
    btn.click()
  })
  await text('Added to the demo calendar')
  await text("this wasn't sent to Google Calendar")
  if (await page.$('a::-p-text(Open in Google Calendar)')) fail('demo results must not link to Google Calendar')
  await shot('5-create-done')
  const workshops = (await events()).filter((e) => e.summary === 'Robotics Workshop')
  if (workshops.length !== 1) fail(`expected 1 workshop, found ${workshops.length}`)
  step('  created once (double-click guarded)')

  step('scene 2: update')
  await click('Scan something else')
  await feed('rescheduled.png', '#acm-general · Tech Night rescheduled · AMEND demo')
  await text('Approve update')
  await text('Change detected')
  await text('5:30 PM')
  await text('4:00 PM')
  await shot('6-update-review')
  await (await primaryButton('Approve update')).click()
  await text('Demo event updated')
  await shot('7-update-done')
  const techNight = (await events()).find((e) => e.id === 'mockacmtechnight')
  if (!techNight.start.dateTime.startsWith('2026-11-06T17:30') || !techNight.end.dateTime.startsWith('2026-11-06T19:30')) {
    fail(`tech night not moved with duration kept: ${JSON.stringify(techNight.start)} ${JSON.stringify(techNight.end)}`)
  }
  if (techNight.location !== 'ECEB 1002') fail('location should be untouched')
  step('  moved to 5:30–7:30 PM, location untouched')

  step('scene 3: delete')
  await click('Scan something else')
  await feed('cancelled.png', 'Inbox · Robotics Workshop cancelled · AMEND demo')
  await text('Will be removed')
  const disabled = await page.$eval('button::-p-text(Delete event)', (b) => b.disabled)
  if (!disabled) fail('delete must be disabled before confirmation')
  await shot('8-delete-review')
  await (await page.waitForSelector('[aria-label="Confirm deletion"]')).click()
  await (await primaryButton('Delete event')).click()
  await text('Demo event deleted')
  await shot('9-delete-done')
  if ((await events()).some((e) => e.summary === 'Robotics Workshop')) fail('workshop still present')
  if ((await events()).length !== 5) fail('other events must remain')
  step('  only the workshop was removed')

  step('scene 4: ambiguous')
  await click('Scan something else')
  await feed('ambiguous.png', 'ACM announcements · AMEND demo (ambiguous)')
  await text('Which event does this refer to?')
  const options = await page.$$('[role="radio"]')
  if (options.length < 2) fail(`expected multiple candidates, got ${options.length}`)
  const blocked = await page.$eval('button::-p-text(Approve update)', (b) => b.disabled).catch(() => true)
  if (!blocked) fail('approval must wait for a choice')
  await shot('10-ambiguous')
  await options[0].click()
  await text('Siebel Center 1404')
  await shot('11-ambiguous-chosen')
  step(`  ${options.length} candidates, user must choose`)

  console.log('\nAll mock end-to-end checks passed.')
} finally {
  await browser.close()
}
