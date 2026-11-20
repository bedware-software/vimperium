// Go: a panel low in the middle of the window for picking a link or a
// control by typing what it says. The matching and the highlights are the
// page's (preload/go-page.ts), reached through main ('go:send', the
// 'go-result' tab event). One mode only — the box always types.

import { useEffect, useRef, useState } from 'react'
import { Navigation } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { DetachedWindow, type PopupPlacement } from './DetachedWindow'
import { InputField } from './InputField'
import { Hint, HintBar, LEAVE_INSERT_CAP } from './KeyHints'
import { cyrillicReadings } from '../lib/translit'
import { cn } from '../lib/utils'
import { isCopyKey, isLeaveInsertKey } from '../lib/vim-mode'
import { displayKeySequence } from '../lib/vim-keymap'

const WIDTH = 660
// Header (h-9), the field's row (h-11), the hint bar (h-10), the border.
const HEIGHT = 122
// How far up the window its bottom edge sits, as a share of the height.
const LIFT = 0.16
const ATTRS_KEY = 'go-by-title'
// Where a drag left it, as an offset from its own spot: it follows the
// window's size like the spot does.
const OFFSET_KEY = 'go-offset'
// After a press the page had the focus for (main's 'go-clicked'): how long
// the page keeps it — its click handlers run, a copy lands — before the
// panel takes the keyboard back.
const REFOCUS_MS = 250

const isMac = navigator.platform.toLowerCase().includes('mac')

interface GoResult {
  type: 'go-result'
  tabId: string
  seq: number
  total: number
  index: number
  label: string
  byAttr: boolean
  href: string
}

function readAttrs(): boolean {
  try {
    return window.localStorage.getItem(ATTRS_KEY) !== 'off'
  } catch {
    return true
  }
}

function readOffset(): { dx: number; dy: number } {
  try {
    const v = JSON.parse(window.localStorage.getItem(OFFSET_KEY) ?? 'null') as { dx?: unknown; dy?: unknown } | null
    if (typeof v?.dx === 'number' && typeof v.dy === 'number') return { dx: v.dx, dy: v.dy }
  } catch { /* the default spot */ }
  return { dx: 0, dy: 0 }
}

function writeOffset(offset: { dx: number; dy: number }): void {
  try {
    window.localStorage.setItem(OFFSET_KEY, JSON.stringify(offset))
  } catch { /* not remembered */ }
}

// The header's whole look is GoHeader and HeaderLines: the owner is trying
// variants, so nothing else knows how it's drawn (HEIGHT counts its h-9).

/** A side's two lines, a ladder's steps: the lower one to the panel's
 *  edge, the one at mid-height half as far. */
function HeaderLines({ side }: { side: 'left' | 'right' }) {
  const fromWord = side === 'left' ? 'right-0' : 'left-0'
  return (
    <span aria-hidden="true" className="relative h-full flex-1">
      <span className={cn('absolute top-1/2 h-px w-1/2 bg-primary/70', fromWord)} />
      <span className="absolute inset-x-0 bottom-1.5 h-px bg-primary/70" />
    </span>
  )
}

/** Also the handle the panel is dragged by; a double click puts it back. */
function GoHeader({ onReset }: { onReset: () => void }) {
  return (
    <div data-detached-drag-handle onDoubleClick={onReset} className="flex h-9 shrink-0 cursor-move items-center gap-3 px-3 select-none">
      <HeaderLines side="left" />
      <span className="text-xl font-semibold leading-none text-primary">Go</span>
      <HeaderLines side="right" />
    </div>
  )
}

export function GoPanel({ open, focusTick, onClose, anchorRef }: {
  open: boolean
  /** Bumped by Go's key while the panel is up: the box takes the keyboard
   *  back (a click on the page had it). */
  focusTick: number
  onClose: () => void
  /** The page area: how much of its bottom the panel covers is told to
   *  the page, which keeps its pick clear of it. */
  anchorRef: React.RefObject<HTMLElement | null>
}) {
  const [query, setQuery] = useState('')
  const [attrs, setAttrs] = useState(readAttrs)
  const [result, setResult] = useState<GoResult | null>(null)
  const [popupWindow, setPopupWindow] = useState<Window | null>(null)
  const [box, setBox] = useState<{ placement: PopupPlacement; width: number; room: number } | null>(null)
  const [offset, setOffset] = useState(readOffset)
  // Bumped to have the popup's window take the keyboard (DetachedWindow).
  const [refocus, setRefocus] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeTabId = useAppStore((s) => s.activeTabId)
  // The tab whose page has Go's highlights up, to take them down.
  const askedTabRef = useRef<string | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const measure = (): void => {
      const width = Math.max(320, Math.min(WIDTH, window.innerWidth - 32))
      const clamp = (v: number, max: number): number => Math.max(0, Math.min(Math.max(0, max), v))
      const left = clamp(Math.round((window.innerWidth - width) / 2 + offset.dx), window.innerWidth - width)
      const top = clamp(Math.round(window.innerHeight * (1 - LIFT) - HEIGHT + offset.dy), window.innerHeight - HEIGHT)
      const pageBottom = anchorRef.current?.getBoundingClientRect().bottom ?? window.innerHeight
      const next = { placement: { left, top }, width, room: Math.max(0, Math.round(pageBottom - top)) }
      setBox((prev) => (prev && prev.width === next.width && prev.room === next.room && prev.placement.left === left && prev.placement.top === top ? prev : next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, anchorRef, offset])

  useEffect(() => {
    if (!open || !popupWindow) return
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, popupWindow, focusTick, refocus])

  const send = (tabId: string, msg: Record<string, unknown>): void => window.electronAPI?.goSend?.(tabId, msg)

  const ask = (tabId: string, text: string, byTitle: boolean): void => {
    seqRef.current += 1
    // As typed, then its Cyrillic readings: the page matches any of them.
    send(tabId, { op: 'query', seq: seqRef.current, texts: text ? [text, ...cyrillicReadings(text)] : [], attrs: byTitle, room: roomRef.current })
    askedTabRef.current = text ? tabId : null
  }
  const roomRef = useRef(0)
  roomRef.current = box?.room ?? 0
  const askRef = useRef({ query, attrs })
  askRef.current = { query, attrs }

  useEffect(() => {
    if (!open) return
    if (askedTabRef.current && askedTabRef.current !== activeTabId) {
      send(askedTabRef.current, { op: 'close' })
      askedTabRef.current = null
    }
    if (!activeTabId) return
    if (!query) {
      setResult(null)
      if (askedTabRef.current) ask(activeTabId, '', attrs)
      return
    }
    const t = setTimeout(() => ask(activeTabId, query, attrs), 40)
    return () => clearTimeout(t)
  }, [query, attrs, activeTabId, open])

  useEffect(() => {
    if (!open) return
    return window.electronAPI?.onTabEvent?.((raw) => {
      const evt = raw as { type?: string; tabId?: string }
      if (!activeTabId || evt?.tabId !== activeTabId) return
      if (evt.type === 'go-result') {
        const found = raw as GoResult
        if (found.seq === seqRef.current) setResult(found)
      } else if (evt.type === 'go-clicked') {
        setTimeout(() => setRefocus((n) => n + 1), REFOCUS_MS)
      } else if (evt.type === 'dom-ready' && askRef.current.query) {
        // A new document knows nothing of what was asked of the last one.
        ask(activeTabId, askRef.current.query, askRef.current.attrs)
      }
    })
  }, [activeTabId, open])

  useEffect(() => {
    if (open) return
    if (askedTabRef.current) send(askedTabRef.current, { op: 'close' })
    askedTabRef.current = null
    setResult(null)
    setQuery('')
  }, [open])

  if (!open || !box) return null

  const toggleAttrs = (): void => {
    setAttrs((on) => {
      try {
        window.localStorage.setItem(ATTRS_KEY, on ? 'off' : 'on')
      } catch { /* not remembered */ }
      return !on
    })
  }

  const move = (dx: number, dy: number): void => {
    if (askedTabRef.current) send(askedTabRef.current, { op: 'move', dx, dy })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // Ctrl+C (Ctrl+[) closes, as it leaves any popup's box — unless it copies.
    if (isLeaveInsertKey(e.nativeEvent) && !isCopyKey(e.nativeEvent, e.currentTarget)) {
      e.preventDefault()
      onClose()
      return
    }
    // By its place on the keyboard: the Russian layout's Ctrl+Л too.
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyK') {
      e.preventDefault()
      setQuery('')
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.key) {
      case ' ':
        // Nothing to find by a space alone — and the Space that opened the
        // panel, still held, repeats into the box.
        if (!query.trim()) e.preventDefault()
        return
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      case 'ArrowLeft': e.preventDefault(); move(-1, 0); return
      case 'ArrowRight': e.preventDefault(); move(1, 0); return
      case 'ArrowUp': e.preventDefault(); move(0, -1); return
      case 'ArrowDown': e.preventDefault(); move(0, 1); return
      case 'Tab':
        e.preventDefault()
        toggleAttrs()
        return
      case 'Enter': {
        e.preventDefault()
        if (e.repeat || !askedTabRef.current || !result || result.total === 0) return
        send(askedTabRef.current, { op: 'follow', newTab: e.shiftKey })
        // Followed: the box is empty for the next thing to go to. A link
        // sent to a new tab leaves it, for the next of the same matches.
        if (!e.shiftKey) setQuery('')
        return
      }
    }
  }

  const counter = result && query ? (result.total > 0 ? `${result.index}/${result.total}` : 'Nothing') : ''
  const shift = isMac ? '⇧' : 'Shift'

  return (
    <DetachedWindow
      open={open}
      title="Go - Vimperium"
      width={box.width}
      height={HEIGHT}
      resizable={false}
      placement={box.placement}
      focusTick={focusTick + refocus}
      onMoved={(spot) => {
        const next = { dx: offset.dx + spot.left - box.placement.left, dy: offset.dy + spot.top - box.placement.top }
        setOffset(next)
        writeOffset(next)
      }}
      onClose={onClose}
      onWindowChange={setPopupWindow}
    >
      <div className="h-full bg-popover text-popover-foreground border border-border overflow-hidden flex flex-col">
        <GoHeader onReset={() => { setOffset({ dx: 0, dy: 0 }); writeOffset({ dx: 0, dy: 0 }) }} />
        <div className="flex h-11 items-center gap-1.5 px-2">
          <InputField inputRef={inputRef} mode={null} className="flex-1 h-8 rounded-lg">
            <Navigation size={14} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="A link or a button, by what it says"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
            {result && result.total > 0 && query && (
              <span className="max-w-[16rem] shrink-0 truncate text-xs text-muted-foreground select-none" title={result.href || result.label}>
                {result.byAttr ? 'title: ' : ''}{result.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap select-none">{counter}</span>
          </InputField>
          <button
            type="button"
            // The box keeps the keyboard.
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleAttrs}
            title="Whether a control is found by its title too — an icon with no text (Tab)"
            className={cn(
              'h-8 shrink-0 rounded-lg border px-2 text-[11px] font-medium whitespace-nowrap select-none',
              attrs ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border text-muted-foreground',
            )}
          >
            Icons: {attrs ? 'on' : 'off'}
          </button>
        </div>
        <HintBar>
          <Hint label="Pick" keys={['←', '↑', '↓', '→']} />
          <Hint label="Go" keys={['Enter']} />
          <Hint label="New tab" keys={[shift, 'Enter']} />
          <Hint label={attrs ? 'Icons off' : 'Icons on'} keys={['Tab']} />
          <Hint label="Clear" keys={[displayKeySequence('<C-k>')]} />
          <Hint label="Close" keys={['Esc', LEAVE_INSERT_CAP]} />
        </HintBar>
      </div>
    </DetachedWindow>
  )
}
