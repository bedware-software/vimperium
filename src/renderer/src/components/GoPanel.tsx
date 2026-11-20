// Go: a panel at the bottom centre of the page area for picking a link or
// a control by typing what it says. The matching and the highlights are
// the page's (preload/go-page.ts), reached through main ('go:send', the
// 'go-result' tab event). One mode only — the box always types; the keys
// that aren't text (arrows, Enter, Tab, Space) are the panel's.

import { useEffect, useRef, useState } from 'react'
import { Navigation } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { DetachedWindow, type PopupPlacement } from './DetachedWindow'
import { InputField } from './InputField'
import { Hint, HintBar } from './KeyHints'
import { cyrillicReadings } from '../lib/translit'
import { cn } from '../lib/utils'

const WIDTH = 660
// Header (h-7), the field's row (h-11), the hint bar (h-10), the border.
const HEIGHT = 114
// Keep in step with PANEL_ROOM in preload/go-page.ts (HEIGHT + this).
const INSET_BOTTOM = 16
const ATTRS_KEY = 'go-by-title'

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

/** Hazard stripes running out from the word to one side, fading. */
function Stripes({ side }: { side: 'left' | 'right' }) {
  const away = side === 'left' ? 'to left' : 'to right'
  return (
    <span
      aria-hidden="true"
      className="h-2 flex-1"
      style={{
        backgroundImage: `repeating-linear-gradient(${side === 'left' ? '-60deg' : '60deg'}, var(--color-primary) 0 5px, transparent 5px 11px)`,
        maskImage: `linear-gradient(${away}, black, transparent)`,
        WebkitMaskImage: `linear-gradient(${away}, black, transparent)`,
      }}
    />
  )
}

export function GoPanel({ open, onClose, anchorRef }: {
  open: boolean
  onClose: () => void
  /** The page area: the panel sits at its bottom centre. */
  anchorRef: React.RefObject<HTMLElement | null>
}) {
  const [query, setQuery] = useState('')
  const [attrs, setAttrs] = useState(readAttrs)
  const [result, setResult] = useState<GoResult | null>(null)
  const [popupWindow, setPopupWindow] = useState<Window | null>(null)
  const [box, setBox] = useState<{ placement: PopupPlacement; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeTabId = useAppStore((s) => s.activeTabId)
  // The tab whose page has Go's highlights up, to take them down.
  const askedTabRef = useRef<string | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    const el = anchorRef.current
    if (!open || !el) return
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      const width = Math.max(320, Math.min(WIDTH, Math.round(r.width) - 32))
      const next = {
        placement: { left: Math.round(r.left + (r.width - width) / 2), top: Math.round(r.bottom - HEIGHT - INSET_BOTTOM) },
        width,
      }
      setBox((prev) => (prev && prev.width === next.width && prev.placement.left === next.placement.left && prev.placement.top === next.placement.top ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open || !popupWindow) return
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, popupWindow])

  const send = (tabId: string, msg: Record<string, unknown>): void => window.electronAPI?.goSend?.(tabId, msg)

  const ask = (tabId: string, text: string, byTitle: boolean): void => {
    seqRef.current += 1
    // As typed, then its Cyrillic readings: the page matches any of them.
    send(tabId, { op: 'query', seq: seqRef.current, texts: text ? [text, ...cyrillicReadings(text)] : [], attrs: byTitle })
    askedTabRef.current = text ? tabId : null
  }
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

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.key) {
      case ' ':
        // Space closes, as it opened; with Shift it's a space in the box.
        if (e.shiftKey) return
        e.preventDefault()
        // The press that opened it, still held, isn't one to close it.
        if (!e.repeat) onClose()
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
      onClose={onClose}
      onWindowChange={setPopupWindow}
    >
      <div className="h-full bg-popover text-popover-foreground border border-border overflow-hidden flex flex-col">
        <div className="flex h-7 shrink-0 items-center gap-3 px-3 pt-1 select-none">
          <Stripes side="left" />
          <span className="text-[13px] font-bold uppercase leading-none tracking-[0.45em] pl-[0.45em] text-primary">Go</span>
          <Stripes side="right" />
        </div>
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
          <Hint label="A space" keys={[shift, 'Space']} />
          <Hint label="Close" keys={['Space']} />
        </HintBar>
      </div>
    </DetachedWindow>
  )
}
