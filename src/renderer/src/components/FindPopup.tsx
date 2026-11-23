import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, Search, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { DetachedWindow } from './DetachedWindow'
import { InputField } from './InputField'
import { LEAVE_INSERT_CAP, vimKeyCaps, vimKeyCapsAll } from './KeyHints'
import { usePopupVimMode } from '../lib/vim-mode'
import { usePagePlacement } from '../lib/page-placement'
import type { VimKeymap } from '../lib/vim-keymap'
import { Hint, HintBar, IconButton } from '@bedware/ui'

const WIDTH = 460
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
}

/**
 * Find in page: a popup pinned to the page's top-right corner; main half
 * is tabFindInPage / the 'found-in-page' tab event (main/tab-views.ts).
 * Opens in INSERT for typing; Enter or Ctrl+C goes to COMMAND, the one
 * place find-next / find-prev step; Esc closes from either. Links are
 * Go's (GoPanel.tsx), not Find's.
 */
export function FindPopup({ open, focusTick, onClose, anchorRef, vimKeymap }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ active: number; total: number } | null>(null)
  const [popupWindow, setPopupWindow] = useState<Window | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Tab we most recently asked main to search. Used so that switching tabs
  // (or closing the popup) can clear highlights on the previous tab even
  // after activeTabId has already moved on.
  const lastSearchedTabIdRef = useRef<string | null>(null)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const placement = usePagePlacement(open, anchorRef, 'right', WIDTH)

  const findNext = useCallback((forward: boolean): void => {
    if (!query || !activeTabId) return
    // findNext: false steps within the session the typing effect began.
    window.electronAPI?.tabFindInPage?.(activeTabId, query, { findNext: false, forward })
    lastSearchedTabIdRef.current = activeTabId
  }, [activeTabId, query])

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
      setResult({ active: found.activeMatchOrdinal, total: found.matches })
    })
    return cleanup
  }, [activeTabId])

  // findNext: true is Electron's flag for "a new find session", which each
  // keystroke is. The debounce keeps one request from cancelling the last
  // before found-in-page settles (the counter looked stuck).
  useEffect(() => {
    if (!open) return
    if (lastSearchedTabIdRef.current && lastSearchedTabIdRef.current !== activeTabId) {
      window.electronAPI?.tabStopFindInPage?.(lastSearchedTabIdRef.current, 'clearSelection')
      lastSearchedTabIdRef.current = null
    }
    if (!activeTabId) return
    if (!query) {
      setResult(null)
      if (lastSearchedTabIdRef.current) {
        window.electronAPI?.tabStopFindInPage?.(lastSearchedTabIdRef.current, 'clearSelection')
        lastSearchedTabIdRef.current = null
      }
      return
    }
    const t = setTimeout(() => {
      window.electronAPI?.tabFindInPage?.(activeTabId, query, { findNext: true })
      lastSearchedTabIdRef.current = activeTabId
    }, 40)
    return () => clearTimeout(t)
  }, [query, activeTabId, open])

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
  const shift = navigator.platform.toLowerCase().includes('mac') ? '⇧' : 'Shift'
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
          <InputField
            mode={vim.mode} pending={vim.pending}
            size="sm"
            boxClassName="flex-1"
            leading={<Search size={14} className="shrink-0 text-muted-foreground" />}
            trailing={(
              <>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap select-none">
              {counter}
            </span>
              </>
            )}
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={vim.onBoxFocus}
            onBlur={vim.onBoxBlur}
            placeholder="Find in page"
            spellCheck={false}
          />
          <IconButton
            size={24}
            onClick={() => findNext(false)}
            disabled={!query}
            label={`Previous match (${prevKeys})`}
          >
            <ChevronUp size={14} />
          </IconButton>
          <IconButton
            size={24}
            onClick={() => findNext(true)}
            disabled={!query}
            label={`Next match (${nextKeys})`}
          >
            <ChevronDown size={14} />
          </IconButton>
          <IconButton
            size={24}
            onClick={onClose}
            label="Close (Esc)"
          >
            <X size={14} />
          </IconButton>
        </div>
        <HintBar>
          {vim.mode === 'command' ? (
            <>
              <Hint label="Next" keys={vimKeyCapsAll(vimKeymap, 'find-next')} />
              <Hint label="Previous" keys={vimKeyCapsAll(vimKeymap, 'find-prev')} />
              <Hint label="Type" keys={vimKeyCaps(vimKeymap, 'insert-mode')} />
              <Hint label="Close" keys={['Esc']} />
            </>
          ) : vim.mode ? (
            <>
              <Hint label="Command mode" keys={['Enter', LEAVE_INSERT_CAP]} />
              <Hint label="Close" keys={['Esc']} />
            </>
          ) : (
            <>
              <Hint label="Next" keys={['Enter']} />
              <Hint label="Previous" keys={[shift, 'Enter']} />
              <Hint label="Close" keys={['Esc']} />
            </>
          )}
        </HintBar>
      </div>
    </DetachedWindow>
  )
}
