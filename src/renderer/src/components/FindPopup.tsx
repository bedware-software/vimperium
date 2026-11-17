import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, Link, Search, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { DetachedWindow } from './DetachedWindow'
import { InputField } from './InputField'
import { Hint, HintBar, LEAVE_INSERT_CAP, vimKeyCaps, vimKeyCapsAll } from './KeyHints'
import { usePopupVimMode } from '../lib/vim-mode'
import { usePagePlacement } from '../lib/page-placement'
import type { VimKeymap } from '../lib/vim-keymap'
import { cyrillicReadings } from '../lib/translit'

const isMac = navigator.platform.toLowerCase().includes('mac')

const WIDTH = 460
// The search row (h-11, its field h-8), the hint bar under it (h-10) and the
// border.
const HEIGHT = 86

interface Props {
  open: boolean
  /** Increments on every find-in-page while the popup is open: hands the
   *  keyboard back to it and selects what's typed (Chrome / Firefox). The
   *  first press handles itself via `open`, so 0 is inert. */
  focusTick: number
  onClose: () => void
  /** The page area: the popup sits in its top-right corner. */
  anchorRef: React.RefObject<HTMLElement | null>
  /** Find's COMMAND keys; null while Vim mode is off. */
  vimKeymap: VimKeymap | null
}

interface FoundInPageEvent {
  type: 'found-in-page'
  tabId: string
  requestId: number
  activeMatchOrdinal: number
  matches: number
  finalUpdate: boolean
  /** What this is the result of searching for. */
  text?: string
  /** The active match is on a link or a button: its address ('' with none). */
  link?: string
}

/** First in the box: what follows is searched for as it's typed, and only
 *  so. == finds an = itself. */
const EXACT_PREFIX = '='

/** What to ask the page for, in turn, for what's typed: itself, then —
 *  while nothing matches — its Cyrillic readings (lib/translit.ts), so
 *  "rojdenie" finds "рождение" from an English keyboard. After = only
 *  itself. */
function findTexts(typed: string): string[] {
  if (typed.startsWith(EXACT_PREFIX)) {
    const text = typed.slice(EXACT_PREFIX.length)
    return text ? [text] : []
  }
  return typed ? [typed, ...cyrillicReadings(typed)] : []
}

interface MatchInfo {
  active: number
  total: number
  /** What a click on the active match opens: an address, '' for a button
   *  and the like, null when it's plain text. */
  link: string | null
}

/**
 * Find in page: a small popup pinned to the page's top-right corner, over
 * the page rather than pushing it down. Calls into webContents.findInPage /
 * stopFindInPage via IPC and listens for 'found-in-page' on the tab-event
 * stream. In Vim mode it opens in INSERT, only for typing what to find (the
 * first match lights up as you type); Enter or Ctrl+C goes to COMMAND, the
 * one place j/k (n/N) step through the matches, i types again; Esc closes
 * from either. What's typed in Latin letters and found nowhere is looked
 * for in Cyrillic too (lib/translit.ts), the field saying what it found;
 * = first looks for exactly what's typed. A match on a link (or a button) says so in the field, and
 * Enter in COMMAND — Ctrl+Enter anywhere — clicks it, closing Find.
 * Without Vim mode Enter / Shift+Enter step, as in any browser.
 */
export function FindPopup({ open, focusTick, onClose, anchorRef, vimKeymap }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<MatchInfo | null>(null)
  const [popupWindow, setPopupWindow] = useState<Window | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Tab we most recently asked main to search. Used so that switching tabs
  // (or closing the popup) can clear highlights on the previous tab even
  // after activeTabId has already moved on.
  const lastSearchedTabIdRef = useRef<string | null>(null)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const placement = usePagePlacement(open, anchorRef, 'right', WIDTH)

  // What the page is asked for: what's typed, then its other readings
  // while nothing matches. `tryRef` is the one being asked now; `found`
  // the one that matched (shown in the field when it isn't what's typed).
  const texts = useMemo(() => findTexts(query), [query])
  const textsRef = useRef(texts)
  textsRef.current = texts
  const tryRef = useRef(0)
  const [foundText, setFoundText] = useState('')

  const findNext = useCallback((forward: boolean): void => {
    const text = textsRef.current[tryRef.current]
    if (!text || !activeTabId) return
    // `findNext: false` = advance within the existing session (the typing
    // effect below seeded it with findNext: true). Pairing with `forward`
    // gives prev/next navigation over the same matches.
    window.electronAPI?.tabFindInPage?.(activeTabId, text, { findNext: false, forward })
    lastSearchedTabIdRef.current = activeTabId
  }, [activeTabId])

  /** Clicks what the active match is on, and closes: false when it's on
   *  nothing a click opens. */
  const clickMatch = (): boolean => {
    const tabId = lastSearchedTabIdRef.current
    if (!tabId || result?.link == null) return false
    // Chromium's own: ends the search, focuses the match's node and clicks it.
    window.electronAPI?.tabStopFindInPage?.(tabId, 'activateSelection')
    lastSearchedTabIdRef.current = null
    onClose()
    return true
  }
  const clickMatchRef = useRef(clickMatch)
  clickMatchRef.current = clickMatch

  const vim = usePopupVimMode({
    keymap: vimKeymap,
    popup: popupWindow,
    box: inputRef,
    initial: 'insert',
    open,
    onCommand: (command) => {
      switch (command) {
        case 'find-next': findNext(true); break
        case 'find-prev': findNext(false); break
        case 'insert-mode': inputRef.current?.focus(); break
      }
    },
    onEscape: onClose,
    // Enter in COMMAND clicks the link the match is on.
    intercept: (e) => e.key === 'Enter' && !e.shiftKey && !e.altKey && clickMatchRef.current(),
  })

  // Typing goes in the box on opening, and again (everything selected) on
  // every find-in-page while open — DetachedWindow hands the popup the
  // keyboard for the latter.
  useEffect(() => {
    if (!open || !popupWindow) return
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => clearTimeout(t)
  }, [open, focusTick, popupWindow])

  useEffect(() => {
    const cleanup = window.electronAPI?.onTabEvent?.((raw) => {
      const evt = raw as { type?: string }
      if (evt?.type !== 'found-in-page') return
      const found = raw as FoundInPageEvent
      if (!activeTabId || found.tabId !== activeTabId) return
      // An answer to a text no longer asked for (an earlier keystroke's, an
      // earlier reading's) says nothing about this one.
      const asked = textsRef.current[tryRef.current]
      if (found.text !== undefined && found.text !== asked) return
      // Nothing matches: its next reading, if there's one — and no "No
      // results" in between.
      if (found.matches === 0 && tryRef.current + 1 < textsRef.current.length) {
        if (!found.finalUpdate) return
        tryRef.current += 1
        window.electronAPI?.tabFindInPage?.(activeTabId, textsRef.current[tryRef.current], { findNext: true })
        return
      }
      setFoundText(found.matches > 0 ? asked ?? '' : '')
      // Only the final update knows about the link: until it comes, the
      // match isn't one.
      setResult({ active: found.activeMatchOrdinal, total: found.matches, link: found.matches > 0 ? found.link ?? null : null })
    })
    return cleanup
  }, [activeTabId])

  // Drive the search. Fires on open, query changes, and tab switches while
  // the popup is open. Switching tabs first clears highlights on the
  // previous tab so the user doesn't see two pages lit up at once.
  //
  // `findNext: true` is the counter-intuitive Electron flag for "begin a new
  // text finding session" — Chromium's underlying find API names it from the
  // session's perspective, not the request's. Each keystroke is a fresh
  // query so we always pass true here; prev/next use false to advance the
  // active match within the existing session.
  //
  // A short debounce collapses bursts of keystrokes into a single Chromium
  // request. Without it, each request cancels the previous one before
  // found-in-page settles, leaving the counter looking stuck.
  useEffect(() => {
    if (!open) return
    if (lastSearchedTabIdRef.current && lastSearchedTabIdRef.current !== activeTabId) {
      window.electronAPI?.tabStopFindInPage?.(lastSearchedTabIdRef.current, 'clearSelection')
      lastSearchedTabIdRef.current = null
    }
    if (!activeTabId) return
    tryRef.current = 0
    if (texts.length === 0) {
      setResult(null)
      setFoundText('')
      if (lastSearchedTabIdRef.current) {
        window.electronAPI?.tabStopFindInPage?.(lastSearchedTabIdRef.current, 'clearSelection')
        lastSearchedTabIdRef.current = null
      }
      return
    }
    const t = setTimeout(() => {
      window.electronAPI?.tabFindInPage?.(activeTabId, texts[0], { findNext: true })
      lastSearchedTabIdRef.current = activeTabId
    }, 40)
    return () => clearTimeout(t)
  }, [texts, activeTabId, open])

  // Closing drops the highlights on whichever tab we searched last.
  useEffect(() => {
    if (open) return
    const tabId = lastSearchedTabIdRef.current
    if (tabId) {
      window.electronAPI?.tabStopFindInPage?.(tabId, 'clearSelection')
      lastSearchedTabIdRef.current = null
    }
    setResult(null)
  }, [open])

  if (!open || !placement) return null

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      // In Vim mode Esc never gets here: the popup's Vim keys close it.
      onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Ctrl+Enter (⌘↵): the link the match is on, as in Chrome.
      if ((e.ctrlKey || e.metaKey) && clickMatch()) return
      // Vim: Enter ends the typing, as / does — the stepping is COMMAND's.
      if (vim.modeRef.current) inputRef.current?.blur()
      else findNext(!e.shiftKey)
    }
  }

  const counter = result
    ? result.total > 0
      ? `${result.active}/${result.total}`
      : 'No results'
    : ''
  // What matched, when it isn't what's typed (its Cyrillic reading).
  const reading = result && result.total > 0 && foundText && foundText !== texts[0] ? foundText : ''
  const onLink = result?.link != null
  const clickLabel = result?.link ? 'Open the link' : 'Click it'
  const shift = isMac ? '⇧' : 'Shift'
  // What steps through the matches, for the buttons' tooltips.
  const nextKeys = vimKeymap ? vimKeyCapsAll(vimKeymap, 'find-next').join(' / ') : 'Enter'
  const prevKeys = vimKeymap ? vimKeyCapsAll(vimKeymap, 'find-prev').join(' / ') : `${shift}+Enter`

  return (
    <DetachedWindow
      open={open}
      title="Find - Vimperium"
      width={WIDTH}
      height={HEIGHT}
      resizable={false}
      // In Vim mode Esc is the popup's Vim keys' (usePopupVimMode).
      closeOnEscape={!vimKeymap}
      placement={placement}
      focusTick={focusTick}
      onClose={onClose}
      onWindowChange={setPopupWindow}
    >
      <div className="h-full bg-popover text-popover-foreground border border-border overflow-hidden flex flex-col">
        <div className="flex h-11 items-center gap-1.5 px-2">
          {/* The count in the field, as browsers have it; the mode at its end. */}
          <InputField inputRef={inputRef} mode={vim.mode} pending={vim.pending} className="flex-1 h-8 rounded-lg">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={vim.onBoxFocus}
              onBlur={vim.onBoxBlur}
              placeholder="Find in page (= exact)"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
            {/* Found as another reading of what's typed: which. */}
            {reading && (
              <span className="max-w-[9rem] shrink-0 truncate text-xs text-muted-foreground select-none" title={`Found as “${reading}”`}>
                → {reading}
              </span>
            )}
            {/* The match is on a link or a button: Enter clicks it. */}
            {onLink && (
              <span
                className="flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary select-none"
                title={result?.link ? `The match is on a link: ${result.link}` : 'The match is on something to click'}
              >
                <Link size={11} />
                {result?.link ? 'Link' : 'Click'}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap select-none">
              {counter}
            </span>
          </InputField>
          <button
            type="button"
            onClick={() => findNext(false)}
            disabled={texts.length === 0}
            title={`Previous match (${prevKeys})`}
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-default"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => findNext(true)}
            disabled={texts.length === 0}
            title={`Next match (${nextKeys})`}
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-default"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="p-1 rounded hover:bg-accent"
          >
            <X size={14} />
          </button>
        </div>
        {/* Its keys, always up — the room is there anyway: COMMAND's in
            COMMAND, INSERT's while typing. */}
        <HintBar>
          {vim.mode === 'command' ? (
            <>
              {onLink && <Hint label={clickLabel} keys={['Enter']} />}
              <Hint label="Next" keys={vimKeyCapsAll(vimKeymap, 'find-next')} />
              <Hint label="Previous" keys={vimKeyCapsAll(vimKeymap, 'find-prev')} />
              <Hint label="Type" keys={vimKeyCaps(vimKeymap, 'insert-mode')} />
              <Hint label="Close" keys={['Esc']} />
            </>
          ) : vim.mode ? (
            <>
              <Hint label="Command mode" keys={['Enter', LEAVE_INSERT_CAP]} />
              {onLink && <Hint label={clickLabel} keys={[isMac ? '⌘' : 'Ctrl', 'Enter']} />}
              <Hint label="Close" keys={['Esc']} />
            </>
          ) : (
            <>
              <Hint label="Next" keys={['Enter']} />
              <Hint label="Previous" keys={[shift, 'Enter']} />
              {onLink && <Hint label={clickLabel} keys={[isMac ? '⌘' : 'Ctrl', 'Enter']} />}
              <Hint label="Close" keys={['Esc']} />
            </>
          )}
        </HintBar>
      </div>
    </DetachedWindow>
  )
}
