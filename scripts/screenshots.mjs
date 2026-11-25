// Takes pictures of Vimperium's windows without starting Vimperium.
//
//   npm run screenshots        (builds the renderer first)
//
// The built renderer (out/renderer) is opened in headless Chromium through
// Playwright. In place of the preload script the page gets a stand-in API
// (scripts/screenshots/stub.mjs) that answers with invented sample data
// (fixtures.mjs). No Electron, no main process, nothing read from the
// user's profile, and no window on the screen — the browser is headless.
//
// A web page is a native view main lays over the window, so there is none
// here: the page area of a web tab shows a neutral stand-in drawn by this
// script (PLACEHOLDER below). Pages the app draws itself are the real ones.
//
// Output: release/screenshots-preview/*.png (the folder is git-ignored).
// Every frame the README's Feature tour links is taken in both themes: the
// dark one as <frame>.png, the light one as <frame>-light.png. The README
// shows the dark one from docs/screenshots/<frame>.png; bedware.software
// shows the light one from docs/screenshots/light/<frame>.png in its light
// theme.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { fixtures, settingsFor, stateFor } from './screenshots/fixtures.mjs'
import { installStub } from './screenshots/stub.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rendererDir = join(root, 'out', 'renderer')
const site = process.argv.includes('--site')
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const siteFrames = new Set(Array.from(readme.matchAll(/!\[[^\]]*\]\(docs\/screenshots\/([\w-]+)\.png\)/g), (match) => match[1]))
if (!siteFrames.size && (site || !process.argv[2])) throw new Error('README has no docs/screenshots frames')
const outDir = site ? mkdtempSync(join(tmpdir(), 'vimperium-frames-')) : join(root, 'release', 'screenshots-preview')

// main/index.ts DEFAULT_WINDOW_WIDTH / DEFAULT_WINDOW_HEIGHT. A popup's size
// is the one the renderer asks window.open for (DetachedWindow.tsx).
const WINDOW = { width: 1400, height: 900 }
const SCALE = 2
// The Sidebar half as wide again as it opens (Sidebar.tsx DEFAULT_WIDTH, 256):
// the rows' titles read in full.
const SIDEBAR_WIDTH = 384

if (!existsSync(join(rendererDir, 'index.html'))) {
  console.error('out/renderer is missing — run `npx electron-vite build` first (npm run screenshots does).')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

// The page lives at an address that does not exist: every request is answered
// from out/renderer by the script itself, so nothing goes over the network —
// no port is opened, and software that filters local traffic cannot touch it.
const origin = 'http://vimperium.invalid'

function rendererFile(url) {
  const path = decodeURIComponent(new URL(url).pathname)
  const file = normalize(join(rendererDir, path === '/' ? 'index.html' : path))
  if (!file.startsWith(rendererDir) || !existsSync(file) || !statSync(file).isFile()) return null
  return file
}

// What stands where the web page's own view would be.
const PLACEHOLDER = (b) => {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;z-index:5;overflow:hidden;` +
    'background:var(--bw-surface-1, #111);display:flex;justify-content:center;pointer-events:none'
  const bar = (w, h = 12, mt = 14, strong = false) =>
    `<div style="width:${w};height:${h}px;margin-top:${mt}px;border-radius:3px;background:var(${strong ? '--bw-border-hover' : '--bw-border-strong'})"></div>`
  el.innerHTML = `<div style="width:min(680px,80%);padding-top:72px">${bar('46%', 30, 0, true)}${bar('72%', 12, 22)}` +
    `${[96, 100, 91, 97, 64].map((w) => bar(`${w}%`)).join('')}${bar('30%', 18, 44, true)}${[99, 93, 100, 88, 95, 52].map((w) => bar(`${w}%`)).join('')}` +
    `${bar('100%', 180, 36)}${[97, 100, 71].map((w) => bar(`${w}%`)).join('')}</div>`
  document.body.appendChild(el)
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const browser = await chromium.launch({ headless: true })
const taken = []
// `node scripts/screenshots.mjs settings` takes only the frames named so.
const only = site ? null : process.argv[2]

/**
 * One frame: a fresh main window with the stand-in API installed; `drive`
 * brings it to the state to capture and returns the page to shoot — the
 * window itself, or a popup it opened.
 */
async function frame(name, options, drive = async () => {}) {
  if (site && !siteFrames.has(name)) return
  await shoot(name, options, drive)
  // A tour frame: the same picture in the light theme, as the site shows it.
  if (siteFrames.has(name) && (options.theme ?? 'dark') === 'dark') {
    await shoot(`${name}-light`, { ...options, theme: 'light' }, drive)
  }
}

async function shoot(name, { url, theme = 'dark', settings = {}, placeholder = !url }, drive) {
  if (only && !name.includes(only)) return
  const context = await browser.newContext({
    viewport: WINDOW,
    deviceScaleFactor: SCALE,
    colorScheme: theme,
    // Entrance animations would be caught half-way.
    reducedMotion: 'reduce',
  })
  const problems = []
  // Nothing but the local renderer: any other request is refused.
  await context.route('**/*', (route) => {
    const req = route.request().url()
    if (req.startsWith('data:') || req.startsWith('about:')) return route.continue()
    const file = req.startsWith(`${origin}/`) ? rendererFile(req) : null
    if (file) {
      return route.fulfill({ body: readFileSync(file), contentType: MIME[extname(file)] ?? 'application/octet-stream' })
    }
    // Nothing else is ever fetched; a request for anything else is a finding.
    if (!req.endsWith('/favicon.ico')) problems.push(`refused request: ${req.slice(0, 120)}`)
    return route.abort()
  })
  await context.addInitScript(installStub, {
    ...fixtures({ version }),
    sidebarWidth: SIDEBAR_WIDTH,
    state: stateFor(url),
    settings: settingsFor({ theme, ...settings }),
  })
  const page = await context.newPage()
  const watch = (p) => {
    p.on('pageerror', (err) => problems.push(String(err)))
    p.on('console', (msg) => { if (msg.type() === 'error') problems.push(msg.text().slice(0, 300)) })
  }
  watch(page)
  await page.goto(`${origin}/index.html?profileId=p1&workspaceId=w1`)
  await page.waitForSelector('#url-bar')
  await page.waitForTimeout(500)

  /** Waits for the popup the window opens while `open` runs (a frame in
   *  the window, stub.mjs); the frame is then what gets shot. */
  let clipTo = null
  const popup = async (open) => {
    const asked = await page.evaluate(() => window.__shots.popups.length)
    await open()
    await page.waitForFunction((n) => window.__shots.popups.length > n, asked)
    // The last one: a popup that changes size is opened anew.
    clipTo = page.locator('iframe[data-shots-popup]').last()
    await page.waitForTimeout(500)
  }

  await drive(page, popup)
  // Last: the page area changes size as strips come and go.
  if (placeholder) {
    const bounds = await page.evaluate(() => window.__shots.pageBounds)
    if (bounds) await page.evaluate(PLACEHOLDER, bounds)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(350)
  const file = join(outDir, `${name}.png`)
  // A popup alone, as its own window shows it; else the whole window.
  if (clipTo && (await clipTo.count()) === 0) problems.push('the popup closed before it could be shot — no picture')
  else if (clipTo) await clipTo.screenshot({ path: file })
  else await page.screenshot({ path: file })
  await context.close()
  taken.push({ name, problems })
  console.log(`  ${name}.png${problems.length ? `  (${problems.length} page error(s))` : ''}`)
  for (const p of [...new Set(problems)]) console.log(`      ${p}`)
}

/** Keys typed in the window, as a user would. */
const keys = (...list) => async (page) => {
  for (const key of list) {
    await page.keyboard.press(key)
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(300)
}

/** The popup `open` brings up, then keys typed in it. */
const inPopup = (open, ...then) => async (page, popup) => {
  await popup(() => keys(...open)(page))
  await keys(...then)(page)
}

if (!site && !only) rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
console.log(`Vimperium ${version} → ${outDir}`)

// The main window on a web page.
await frame('window-command', {})
await frame('window-insert', {}, keys('e'))
await frame('window-command-light', { theme: 'light' })
await frame('window-insert-light', { theme: 'light' }, keys('e'))
// The pointer on the moon in the yellow bar: its outline alone.
await frame('window-insert-light-hover', { theme: 'light' }, async (page) => {
  await keys('e')(page)
  await page.hover('.url-line .bw-iconbtn:not(.url-lock)')
})
await frame('window-label-typed-light', { theme: 'light' }, keys('l'))
await frame('window-command-light-stone', { theme: 'light', settings: { lightVariant: 'light-stone' } })
await frame('window-which-key', {}, keys('o'))
// The pointer on a row's buttons: a tab's close, a group's add.
await frame('window-sidebar-row-buttons', {}, async (page) => {
  await page.hover('[data-vim-row="t2"]')
  await page.hover('[data-vim-row="t2"] .bw-iconbtn[aria-label="Close tab"]')
})
await frame('window-sidebar-row-buttons-light', { theme: 'light' }, async (page) => {
  await page.hover('[data-sidebar-group-row]')
  await page.hover('[data-sidebar-group-row] .bw-iconbtn[aria-label="Add tab"]')
})
// The Sidebar's cursor two rows below the one shown, then two more picked.
await frame('window-sidebar-cursor', {}, keys('ArrowDown', 'ArrowDown', 'Shift+ArrowDown'))
await frame('window-sidebar-cursor-light', { theme: 'light' }, keys('ArrowDown', 'ArrowDown', 'Shift+ArrowDown'))
// A row's label half typed (l of la), then the group it names: its page.
await frame('window-label-typed', {}, keys('l'))
await frame('page-group', { placeholder: false }, keys('l', 'a'))
await frame('window-outline-indicator', { settings: { vimIndicator: 'outline' } })

// Pages the app draws itself.
await frame('page-blank', { url: 'about:blank', placeholder: false })
await frame('page-search', { url: 'vimperium://search' }, keys('f', 'l', 'u'))
await frame('page-downloads', { url: 'vimperium://downloads' })
await frame('page-downloads-light', { url: 'vimperium://downloads', theme: 'light' })
await frame('page-bangs', { url: 'vimperium://bangs' })
await frame('page-keys', { url: 'vimperium://keys' })
await frame('page-bookshelf', { url: 'vimperium://bookshelf' })

// Popups: each a window of its own.
await frame('popup-command-palette', {}, inPopup(['Control+p'], 'g', 'r'))
await frame('popup-command-palette-labels', {}, inPopup(['Control+p'], 'Control+c'))
await frame('popup-go', {}, inPopup(['Space']))
await frame('popup-go-query', {}, inPopup(['Space'], 'd', 'o', 'c', 's'))
await frame('popup-address-editor', {}, inPopup(['Shift+E']))
// Settings: a frame a page, in the navigation's order (J steps on to the next).
const SETTINGS_PAGES = ['general', 'search', 'appearance', 'dark-pages', 'passwords', 'network', 'enterprise', 'shortcuts', 'extensions', 'permissions', 'sync', 'about']
const settingsPage = (name) => inPopup([','], ...Array(SETTINGS_PAGES.indexOf(name)).fill('Shift+J'))
for (const name of SETTINGS_PAGES) await frame(`popup-settings-${name}`, {}, settingsPage(name))
for (const name of ['general', 'appearance']) await frame(`popup-settings-${name}-light`, { theme: 'light' }, settingsPage(name))
await frame('popup-settings-keys-table', {}, inPopup([','], 'Shift+Slash'))

await browser.close()

const failed = taken.filter((t) => t.problems.length)
console.log(`${taken.length} frames, ${failed.length} with page errors`)
if (!only) {
  try {
    if (failed.length) throw new Error('Renderer errors while capturing README screenshots')
    for (const name of siteFrames) {
      for (const file of [name, name + '-light']) {
        if (!existsSync(join(outDir, file + '.png'))) throw new Error('Unknown README frame: ' + file)
      }
    }
    // The dark frame where the README links it, the light one under light/.
    const destination = join(root, 'docs', 'screenshots')
    const light = join(destination, 'light')
    mkdirSync(light, { recursive: true })
    // A frame the tour no longer links goes, so a rename leaves nothing behind.
    for (const dir of [destination, light]) {
      for (const file of readdirSync(dir)) {
        if (file.endsWith('.png') && !siteFrames.has(file.slice(0, -4))) rmSync(join(dir, file))
      }
    }
    for (const name of siteFrames) {
      copyFileSync(join(outDir, name + '.png'), join(destination, name + '.png'))
      copyFileSync(join(outDir, name + '-light.png'), join(light, name + '.png'))
    }
  } finally {
    if (site) rmSync(outDir, { recursive: true, force: true })
  }
}
process.exitCode = failed.length ? 1 : 0
