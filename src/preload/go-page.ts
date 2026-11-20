// Go's page half: finds the page's links and controls by what they say and
// draws the matches. The panel is renderer components/GoPanel.tsx; main
// relays 'vimperium-go' / 'vimperium-go-result' (main/tab-views.ts).
// Drawn with DOM and CSSOM calls only: pages with Trusted Types or a strict
// style-src CSP reject markup strings and <style> text.

import { ipcRenderer } from 'electron'

const SEMANTIC = [
  'a[href]', 'area[href]', 'button', 'summary',
  'input[type="submit"]', 'input[type="button"]', 'input[type="reset"]', 'input[type="image"]',
  '[role="link"]', '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]', '[role="option"]', '[role="switch"]', '[role="checkbox"]', '[role="treeitem"]',
].join(', ')
// Clickable by a guess only: a whole panel can carry a tabindex, so these
// count only while they say little.
const GENERIC = '[onclick], [tabindex]:not([tabindex="-1"])'
const GENERIC_MAX_TEXT = 120
const LABEL_MAX = 80
const COLOR = '#f97316'
const MAX_BOXES = 400
// How much of the page's bottom the panel covers, until it says (a query's
// `room`): a pick under it isn't in view.
let panelRoom = 130
const REFRESH_MS = 300

interface Match {
  el: HTMLElement
  /** What matched, for the panel. */
  label: string
  /** Matched by a title / aria-label / alt, not by text on screen. */
  byAttr: boolean
}

const norm = (text: string): string => text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

function collect(root: Document | ShadowRoot, out: HTMLElement[]): void {
  for (const el of root.querySelectorAll<HTMLElement>(`${SEMANTIC}, ${GENERIC}`)) out.push(el)
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot, out)
}

function visibleText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.value
  return el.innerText ?? ''
}

/** What an icon-only control says of itself: its own title and label, and
 *  those of what's inside it (an image's alt, an SVG's <title>). */
function attrTexts(el: HTMLElement): string[] {
  const out: string[] = []
  const add = (text: string | null | undefined): void => {
    if (text && text.trim()) out.push(text)
  }
  add(el.getAttribute('title'))
  add(el.getAttribute('aria-label'))
  add(el.getAttribute('alt'))
  for (const inner of el.querySelectorAll('[title], [aria-label], img[alt], svg title')) {
    if (inner.localName === 'title') add(inner.textContent)
    else {
      add(inner.getAttribute('title'))
      add(inner.getAttribute('aria-label'))
      add(inner.getAttribute('alt'))
    }
  }
  return out
}

function isShown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

function findMatches(texts: string[], attrs: boolean): Match[] {
  const wanted = texts.map(norm).filter(Boolean)
  if (wanted.length === 0) return []
  const candidates: HTMLElement[] = []
  collect(document, candidates)
  const found: Match[] = []
  for (const el of candidates) {
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue
    const text = norm(visibleText(el))
    if (!el.matches(SEMANTIC) && text.length > GENERIC_MAX_TEXT) continue
    let match: Match | null = null
    if (text && wanted.some((w) => text.includes(w))) match = { el, label: text, byAttr: false }
    else if (attrs) {
      const said = attrTexts(el).find((t) => {
        const n = norm(t)
        return wanted.some((w) => n.includes(w))
      })
      if (said) match = { el, label: said.replace(/\s+/g, ' ').trim(), byAttr: true }
    }
    if (match && isShown(el)) found.push(match)
  }
  // A match holding another match (a row and the link in it) is the outer
  // of two boxes on one thing: the inner one stays.
  const outer = new Set<Element>()
  const matched = new Set<Element>(found.map((m) => m.el))
  for (const { el } of found) {
    for (let up = el.parentElement; up; up = up.parentElement) {
      if (matched.has(up)) outer.add(up)
    }
  }
  return found.filter((m) => !outer.has(m.el))
}

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < innerHeight - panelRoom && r.right > 0 && r.left < innerWidth
}

function reveal(el: Element): void {
  const r = el.getBoundingClientRect()
  if (r.top >= 0 && r.bottom <= innerHeight - panelRoom && r.left >= 0 && r.right <= innerWidth) return
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
}

/** Where a mouse would press `el`: the middle of its first box (a link
 *  wrapped over two lines has its bounding box's middle off the text).
 *  Null when that spot is off screen or something else lies over it. */
function pressPoint(el: HTMLElement): { x: number; y: number } | null {
  reveal(el)
  const r = el.getClientRects()[0] ?? el.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
  const hit = document.elementFromPoint(x, y)
  if (!hit) return null
  if (hit === el || el.contains(hit)) return { x, y }
  // elementFromPoint stops at a shadow host: el inside it is under the spot.
  for (let up: Node | null = el; up; up = up.parentNode ?? (up instanceof ShadowRoot ? up.host : null)) {
    if (up === hit) return { x, y }
  }
  return null
}

/** `click`: presses `el` with made-up events (webview-stealth's
 *  clickLikeMouse) — the fallback where a real press can't land. */
export function installGoPage(click: (el: HTMLElement) => void): void {
  // The preload can run twice in a page (session preload and the view's own).
  const flag = '__vimperiumGoPage'
  const scope = globalThis as unknown as Record<string, boolean>
  if (scope[flag]) return
  scope[flag] = true

  let host: HTMLElement | null = null
  let root: ShadowRoot | null = null
  let matches: Match[] = []
  let index = 0
  let texts: string[] = []
  let attrs = true
  let seq = 0
  let dirty = false
  let frame = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let observer: MutationObserver | null = null

  const report = (): void => {
    const pick = matches[index]
    const link = pick?.el.closest('a[href]')
    ipcRenderer.send('vimperium-go-result', {
      seq,
      total: matches.length,
      index: matches.length > 0 ? index + 1 : 0,
      label: pick ? pick.label.slice(0, LABEL_MAX) : '',
      byAttr: pick?.byAttr === true,
      href: link instanceof HTMLAnchorElement ? link.href : '',
    })
  }

  const render = (): void => {
    if (!root) return
    while (root.firstChild) root.removeChild(root.firstChild)
    let drawn = 0
    matches.forEach(({ el }, i) => {
      if (drawn >= MAX_BOXES && i !== index) return
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return
      drawn++
      const picked = i === index
      const box = document.createElement('div')
      Object.assign(box.style, {
        position: 'fixed',
        left: `${r.left - 3}px`,
        top: `${r.top - 3}px`,
        width: `${r.width + 6}px`,
        height: `${r.height + 6}px`,
        boxSizing: 'border-box',
        border: picked ? `3px solid ${COLOR}` : `2px dashed ${COLOR}`,
        borderRadius: '4px',
        background: picked ? 'rgba(249, 115, 22, 0.22)' : 'rgba(249, 115, 22, 0.07)',
        boxShadow: picked ? '0 0 0 2px rgba(0, 0, 0, 0.35), 0 0 12px 2px rgba(249, 115, 22, 0.6)' : 'none',
      })
      root!.appendChild(box)
    })
  }
  const renderSoon = (): void => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      render()
    })
  }

  const open = (): void => {
    if (host) return
    host = document.createElement('div')
    root = host.attachShadow({ mode: 'closed' })
    Object.assign(host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' })
    document.documentElement.appendChild(host)
    window.addEventListener('scroll', renderSoon, true)
    window.addEventListener('resize', renderSoon)
    observer = new MutationObserver(() => { dirty = true })
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    // The page moves under the boxes (a menu opening, rows loading): they
    // follow, and what matches is looked for again once the page changed.
    timer = setInterval(() => {
      if (dirty) search(false)
      else render()
    }, REFRESH_MS)
  }

  const close = (): void => {
    if (!host) return
    window.removeEventListener('scroll', renderSoon, true)
    window.removeEventListener('resize', renderSoon)
    observer?.disconnect()
    observer = null
    if (timer) clearInterval(timer)
    timer = null
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    host.remove()
    host = null
    root = null
    matches = []
    texts = []
  }

  /** `asked`: the panel's own query, which shows its pick; the page
   *  changing by itself doesn't scroll it. */
  function search(asked: boolean): void {
    const before = matches[index]?.el
    const count = matches.length
    matches = findMatches(texts, attrs)
    dirty = false
    observer?.takeRecords()
    const kept = before ? matches.findIndex((m) => m.el === before) : -1
    if (kept !== -1) index = kept
    else {
      const visible = matches.findIndex((m) => inView(m.el))
      index = visible === -1 ? 0 : visible
    }
    if (asked && matches[index]) reveal(matches[index].el)
    render()
    if (asked || matches[index]?.el !== before || matches.length !== count) report()
  }

  // The nearest match whose centre lies that way, distance along it
  // counting less than drift across it; none that way steps in page order.
  const move = (dx: number, dy: number): void => {
    if (matches.length === 0) return
    const from = matches[index].el.getBoundingClientRect()
    const cx = from.left + from.width / 2
    const cy = from.top + from.height / 2
    let best = -1
    let bestScore = Infinity
    matches.forEach(({ el }, i) => {
      if (i === index) return
      const r = el.getBoundingClientRect()
      const vx = r.left + r.width / 2 - cx
      const vy = r.top + r.height / 2 - cy
      const along = vx * dx + vy * dy
      if (along <= 1) return
      const score = along + Math.abs(vx * dy - vy * dx) * 2
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    })
    index = best !== -1 ? best : (index + (dx + dy > 0 ? 1 : -1) + matches.length) % matches.length
    reveal(matches[index].el)
    render()
    report()
  }

  const follow = (newTab: boolean): void => {
    const pick = matches[index]
    if (!pick || !pick.el.isConnected) {
      search(true)
      return
    }
    const link = pick.el.closest('a[href]')
    if (newTab && link instanceof HTMLAnchorElement) ipcRenderer.send('vimperium-open-in-new-tab', link.href)
    else {
      // A real press, sent by main (webContents.sendInputEvent) with the
      // page focused: made-up events carry no user activation and the
      // panel holds the focus, so a page's clipboard write (a copy icon)
      // was refused.
      const at = pressPoint(pick.el)
      if (at) ipcRenderer.send('vimperium-go-click', at)
      else click(pick.el)
    }
  }

  ipcRenderer.on('vimperium-go', (_e, raw: unknown) => {
    const msg = raw as { op?: unknown; seq?: unknown; texts?: unknown; attrs?: unknown; room?: unknown; dx?: unknown; dy?: unknown; newTab?: unknown } | null
    switch (msg?.op) {
      case 'query':
        seq = typeof msg.seq === 'number' ? msg.seq : 0
        texts = Array.isArray(msg.texts) ? msg.texts.filter((t): t is string => typeof t === 'string') : []
        attrs = msg.attrs !== false
        if (typeof msg.room === 'number' && Number.isFinite(msg.room)) panelRoom = Math.max(0, Math.min(innerHeight / 2, msg.room))
        if (texts.length === 0) {
          close()
          report()
          break
        }
        open()
        search(true)
        break
      case 'move':
        if (typeof msg.dx === 'number' && typeof msg.dy === 'number') move(Math.sign(msg.dx), Math.sign(msg.dy))
        break
      case 'follow':
        follow(msg.newTab === true)
        break
      case 'close':
        close()
        break
    }
  })
}
