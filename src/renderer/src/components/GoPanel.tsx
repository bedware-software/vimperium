// Go: a panel low (or high) in the middle of the window for picking a link
// or a control by typing what it says. The matching and the highlights are
// the page's (preload/go-page.ts), reached through main ('go:send', the
// 'go-result' tab event). One mode only — the box always types.

import { useEffect, useRef, useState } from 'react'
import { Image, Navigation } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { DetachedWindow, type PopupPlacement } from './DetachedWindow'
import { InputField } from './InputField'
import { Hint, HintBar, KeyCap, LEAVE_INSERT_CAP } from './KeyHints'
import { ModeEdge } from './ModeEdge'
import { cyrillicReadings } from '../lib/translit'
import { cn } from '../lib/utils'
import { isCopyKey } from '../lib/vim-mode'
import { displayKeySequence } from '../lib/vim-keymap'
import { useVimEdge, type VimEdge } from '../lib/vim-edge'

const WIDTH = 660
// The field's row (h-11), the hint bar (h-10), the border.
const HEIGHT = 86
// Small: the field (h-8) and, all round it, room for its edge's glow —
// the window cuts off what spills past it.
const SMALL_WIDTH = 340
const SMALL_HEIGHT = 56
// How far from the window's bottom its bottom edge sits (low), or from the
// top its top edge (high), as a share of the height.
const LIFT = 0.16
const ATTRS_KEY = 'go-by-title'
const SPOT_KEY = 'go-spot'
const SMALL_KEY = 'go-small'
// The small box's edge: quick, all but no rest in the ends. Below Settings'
// own range on purpose.
const SMALL_PACE = { speed: 2.4, rest: 0.1 } as const
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

function readFlag(key: string, on: string): boolean {
  try {
    return window.localStorage.getItem(key) === on
  } catch {
    return false
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch { /* not remembered */ }
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

export function GoPanel({ open, focusTick, onClose, anchorRef }: {
  open: boolean
  /** Bumped by Go's key while the panel is up: the box takes the keyboard
   *  back (a click on the page had it). */
  focusTick: number
  onClose: () => void
  /** The page area: how much of its bottom or its top the panel covers is
   *  told to the page, which keeps its pick clear of it. */
  anchorRef: React.RefObject<HTMLElement | null>
}) {
  const [query, setQuery] = useState('')
  const [attrs, setAttrs] = useState(readAttrs)
  const [result, setResult] = useState<GoResult | null>(null)
  const [popupWindow, setPopupWindow] = useState<Window | null>(null)
  const [box, setBox] = useState<{ placement: PopupPlacement; width: number; room: number; roomTop: number } | null>(null)
  const [offset, setOffset] = useState(readOffset)
  const [high, setHigh] = useState(() => readFlag(SPOT_KEY, 'high'))
  const [small, setSmall] = useState(() => readFlag(SMALL_KEY, 'on'))
  const chosenEdge = useVimEdge()
  const height = small ? SMALL_HEIGHT : HEIGHT
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
      const width = small ? Math.min(SMALL_WIDTH, window.innerWidth - 32) : Math.max(320, Math.min(WIDTH, window.innerWidth - 32))
      const clamp = (v: number, max: number): number => Math.max(0, Math.min(Math.max(0, max), v))
      const left = clamp(Math.round((window.innerWidth - width) / 2 + offset.dx), window.innerWidth - width)
      const spot = high ? window.innerHeight * LIFT : window.innerHeight * (1 - LIFT) - height
      const top = clamp(Math.round(spot + offset.dy), window.innerHeight - height)
      const page = anchorRef.current?.getBoundingClientRect()
      const pageTop = page?.top ?? 0
      const pageBottom = page?.bottom ?? window.innerHeight
      // It covers the page's top or its bottom, whichever half it's in.
      const upper = top + height / 2 < (pageTop + pageBottom) / 2
      const next = {
        placement: { left, top },
        width,
        room: upper ? 0 : Math.max(0, Math.round(pageBottom - top)),
        roomTop: upper ? Math.max(0, Math.round(top + height - pageTop)) : 0,
      }
      setBox((prev) => (prev && prev.width === next.width && prev.room === next.room && prev.roomTop === next.roomTop && prev.placement.left === left && prev.placement.top === top ? prev : next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, anchorRef, offset, high, small, height])

  useEffect(() => {
    if (!open || !popupWindow) return
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, popupWindow, focusTick, refocus])

  const send = (tabId: string, msg: Record<string, unknown>): void => window.electronAPI?.goSend?.(tabId, msg)

  const ask = (tabId: string, text: string, byTitle: boolean): void => {
    seqRef.current += 1
    // As typed, then its Cyrillic readings: the page matches any of them.
    send(tabId, { op: 'query', seq: seqRef.current, texts: text ? [text, ...cyrillicReadings(text)] : [], attrs: byTitle, ...roomRef.current })
    askedTabRef.current = text ? tabId : null
  }
  const room = box?.room ?? 0
  const roomTop = box?.roomTop ?? 0
  const roomRef = useRef({ room, roomTop })
  roomRef.current = { room, roomTop }
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
  }, [query, attrs, activeTabId, open, room, roomTop])

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

  const resetOffset = (): void => {
    setOffset({ dx: 0, dy: 0 })
    writeOffset({ dx: 0, dy: 0 })
  }

  // To its high spot or its low one — from wherever a drag left it.
  const putAt = (up: boolean): void => {
    setHigh(up)
    writeFlag(SPOT_KEY, up ? 'high' : 'low')
    resetOffset()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // Ctrl+[, vim's other Esc; Esc itself is the switch's below.
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'BracketLeft') {
      e.preventDefault()
      onClose()
      return
    }
    // By their place on the keyboard: the Russian layout's Ctrl+Л too.
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      switch (e.code) {
        case 'KeyC':
          // Off the Mac, with text selected, it copies.
          if (isCopyKey(e.nativeEvent, e.currentTarget)) return
          e.preventDefault()
          setQuery('')
          return
        case 'KeyK': e.preventDefault(); putAt(true); return
        case 'KeyJ': e.preventDefault(); putAt(false); return
        case 'KeyM':
          e.preventDefault()
          writeFlag(SMALL_KEY, small ? 'off' : 'on')
          setSmall(!small)
          return
      }
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
  const iconsTitle = 'Whether a control is found by its title too — an icon with no text (Tab)'
  // The address bar's comet, whichever it is; a comet of its own otherwise.
  const smallEdge: VimEdge = chosenEdge.startsWith('comet') ? chosenEdge : 'comet-sides'

  const input = (
    <input
      ref={inputRef}
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={small ? 'Go' : 'A link or a button, by what it says'}
      spellCheck={false}
      className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
    />
  )
  const count = <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap select-none">{counter}</span>

  return (
    <DetachedWindow
      open={open}
      title="Go - Vimperium"
      // The opening size: a change of these would close and reopen the
      // window, so small and back go through fitHeight / fitWidth.
      width={WIDTH}
      height={HEIGHT}
      fitHeight={height}
      fitWidth={box.width}
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
      {small ? (
        // Dragged by the margin round the field; a double click puts it back.
        <div data-detached-drag-handle onDoubleClick={resetOffset} className="h-full bg-popover text-popover-foreground border border-border flex items-center px-3 cursor-move">
          <div
            data-detached-no-drag
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              if (e.target === inputRef.current) return
              e.preventDefault()
              inputRef.current?.focus()
            }}
            className="field relative flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg pl-3 pr-2.5 cursor-text"
          >
            <Navigation size={14} className="shrink-0 text-muted-foreground" />
            {input}
            {count}
            <button
              type="button"
              onClick={toggleAttrs}
              title={iconsTitle}
              className={cn('shrink-0', attrs ? 'text-primary' : 'text-muted-foreground/50')}
            >
              <Image size={14} />
            </button>
            <ModeEdge mode="command" edge={smallEdge} pace={SMALL_PACE} />
          </div>
        </div>
      ) : (
        <div className="h-full bg-popover text-popover-foreground border border-border overflow-hidden flex flex-col">
          <div className="flex h-11 items-center gap-1.5 px-2">
            <InputField inputRef={inputRef} mode={null} className="flex-1 h-8 rounded-lg">
              <Navigation size={14} className="shrink-0 text-muted-foreground" />
              {input}
              {result && result.total > 0 && query && (
                <span className="max-w-[16rem] shrink-0 truncate text-xs text-muted-foreground select-none" title={result.href || result.label}>
                  {result.byAttr ? 'title: ' : ''}{result.label}
                </span>
              )}
              {count}
            </InputField>
            <button
              type="button"
              // The box keeps the keyboard.
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleAttrs}
              title={iconsTitle}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium whitespace-nowrap select-none',
                attrs ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border text-muted-foreground',
              )}
            >
              Icons: {attrs ? 'on' : 'off'}
              <KeyCap>Tab</KeyCap>
            </button>
          </div>
          {/* Also the handle the panel is dragged by; a double click puts it back. */}
          <div data-detached-drag-handle onDoubleClick={resetOffset} className="cursor-move select-none">
            <HintBar>
              <Hint label="Pick" keys={['←↑↓→']} />
              <Hint label="Go" keys={['Enter']} />
              <Hint label="New tab" keys={[shift, 'Enter']} />
              <Hint label="Clear" keys={[LEAVE_INSERT_CAP]} />
              <Hint label="Move" keys={[displayKeySequence('<C-k>'), displayKeySequence('<C-j>')]} />
              <Hint label="Small" keys={[displayKeySequence('<C-m>')]} />
              <Hint label="Close" keys={['Esc']} />
            </HintBar>
          </div>
        </div>
      )}
    </DetachedWindow>
  )
}
