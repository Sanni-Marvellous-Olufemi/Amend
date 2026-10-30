// Opens a Chrome window with the built extension installed (Chrome 137+ ignores --load-extension).
// Usage: npm run chrome [-- url]     Close the window or press Ctrl+C to quit.
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const url = process.argv[2] || 'http://127.0.0.1:47616/'
const executablePath =
  process.env.CHROME ||
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome')

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  enableExtensions: [dist],
  pipe: true,
  defaultViewport: null,
  userDataDir: process.env.AMEND_PROFILE || join(tmpdir(), 'amend-chrome-profile'),
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1400,900'],
})
const [page] = await browser.pages()
await page.goto(url)
console.log(`Chrome is open with AMEND from ${dist}. Close the window to exit.`)
browser.on('disconnected', () => process.exit(0))
