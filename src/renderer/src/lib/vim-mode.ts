import { useCallback, useEffect, useRef, useState } from 'react'
import { useKeySequence as useKeySequenceIn, useVimFormMode as useVimFormModeIn } from '@bedware/ui/vim-form'
import { COUNT_COMMANDS, isCtrlToken, keyTokenFromEvent, type VimKeymap, type VimKeymapEntries } from '../../../shared/vim-keys'
import type { SidebarCommand } from './vim-keymap'
import { log } from './log'
import { sidebarCursorAway, sidebarRowsPicked } from './sidebar-cursor'

// Vim mode. A window is in one of two modes:
//   COMMAND — plain keys run the commands from Settings' keymap: scrolling
//             the page, history, tabs, app commands. Mostly the page has the
//             keyboard: its preload (webview-stealth.ts) runs the page's
//             keys, the way Vimium does, passes the browser's commands on
//             here and lets unbound keys reach the page. The chrome has it
//             only with no page to go to, or while Ctrl steps through the
//             tabs; this module passes the page's keys on to the page then.
//   INSERT  — keys go where you type: a page field, the page itself (i),
//             the URL bar, a rename box.
// Clicking a text field is INSERT, anywhere else COMMAND; Esc (or Ctrl+[)
// leaves INSERT — in a popup's field Ctrl+C (or Ctrl+[) does, and Esc closes
// the popup (usePopupVimMode). A Sidebar key in COMMAND (Ctrl+J/K step through the rows,
// Ctrl+H/L fold and unfold) is the Sidebar's turn: a cursor on the active
// row — with the keyboard kept in the chrome, so a page's text field can't
// take it on the way — until Ctrl is let go, which hands it to the page
// shown (one rebound to a plain key ends after a pause instead). Ctrl alone
// does nothing, so its other chords never flash the cursor.
// This module holds the window's mode and tells main, which passes it on to
// the pages.

export type VimMode = 'command' | 'insert'

export { isTypingElement, isEscapeKey, isCopyKey, isLeaveInsertKey } from '@bedware/ui/vim-form'

// Set while the Sidebar keys step through the tabs: activating a tab then must not hand
// OS keyboard focus to its page (WebviewPanel), or the next keystroke would
// go to the site — or a field of it — instead of the Sidebar's keys.
let walkingTabs = false

// Settings → General, "A Page Focusing Its Own Field": true leaves COMMAND
// as it is (the page's preload blurs the field). Goes to the pages with the
// mode, so a change is pushed at once.
let ignorePageFocus = true
let repushPageState: (() => void) | null = null
export function setIgnorePageFocus(ignore: boolean): void {
  if (ignorePageFocus === ignore) return
  ignorePageFocus = ignore
  repushPageState?.()
}

export function keepsChromeKeyboard(): boolean {
  return walkingTabs
}

// With no Ctrl held (a plain key a Sidebar command is rebound to), how long
// the Sidebar keys stay live after the last one.
const WALK_IDLE_MS = 1000
// Commands that keep going while their key is held.
const REPEATABLE = new Set([
  'scroll-down', 'scroll-up', 'half-page-down', 'half-page-up',
  'cursor-down-show', 'cursor-up-show', 'row-move-down', 'row-move-up',
  'cursor-down', 'cursor-up', 'find-next', 'find-prev',
  // Settings' h / l (H / L): a slider keeps sliding.
  'value-next', 'value-prev', 'value-next-big', 'value-prev-big',
])

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** Inside a page this renderer draws in the page area (marked
 *  `data-vim-page`: Downloads, Bangs, the Keys). */
function isInternalPage(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-vim-page]') !== null
}

/** Inside a form up over such a page (the bang form, `data-vim-own-keys`):
 *  its controls keep Tab, Enter and Space, so the focus anywhere in it is
 *  INSERT. */
function isOwnKeysForm(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-vim-own-keys]') !== null
}

/** The mode keyboard focus on `target` in this renderer stands for: INSERT
 *  is a text field (or the bang form), the rest COMMAND. A page this
 *  renderer draws is COMMAND too — the mode shown must be what the keys do:
 *  its rows' keys run through usePageKeys, typing is its filter's. */
function modeForRendererFocus(target: EventTarget | null): VimMode {
  return isEditable(target) || isOwnKeysForm(target) ? 'insert' : 'command'
}

/** Tab, and Enter / Space on a focused control, inside a page this renderer
 *  draws: the control's own, not COMMAND's to swallow. */
function isPageControlKey(e: KeyboardEvent): boolean {
  const target = e.target
  if (!isInternalPage(target)) return false
  if (e.key === 'Tab') return true
  return (e.key === 'Enter' || e.key === ' ') && (target as HTMLElement).closest('button, a, [role="radio"], [role="switch"]') !== null
}

/** INSERT in the chrome (a URL bar, a rename) rather than in a page. */
function isChromeField(target: EventTarget | null): boolean {
  return isEditable(target) && !isInternalPage(target)
}

/** Move OS keyboard focus to this renderer, retrying while a tab view is
 *  still pulling it away. `force` takes it even from another window — right
 *  for a hotkey, which only reaches us while ours is in use. */
function claimRendererFocus(force: boolean): void {
  if (force) window.electronAPI?.focusWindowRenderer?.()
  else window.electronAPI?.reclaimWindowRendererFocus?.()
  for (const delay of [60, 180]) {
    setTimeout(() => {
      if (walkingTabs && !document.hasFocus()) window.electronAPI?.reclaimWindowRendererFocus?.()
    }, delay)
  }
}

// ── The Sidebar ──

let sidebarHandler: ((cmd: SidebarCommand) => void) | null = null
// Ends the Sidebar keys (useVimMode's), for a row menu that swallowed the
// Ctrl release.
let endSidebarKeysHook: (() => void) | null = null
// A row menu the keys opened (m) is up: its own window has the keys. Ending
// the walk now — the window losing focus to the menu says Ctrl's let go, and
// a plain key's walk times out — would hand the page the keyboard, which
// focuses the window again and blurs the menu shut. Its closing ends it.
let rowMenuOpen = false

/** Runs a Sidebar command on the row under its cursor; false when no
 *  Sidebar is showing to take it. */
export function dispatchSidebarCommand(cmd: SidebarCommand): boolean {
  if (!sidebarHandler) return false
  sidebarHandler(cmd)
  return true
}

/**
 * Hooks a Sidebar up to its Ctrl commands while `active`. Wrap
 * keyboard-opened context menus in the returned `runMenu`: a native menu
 * keeps the Ctrl release from us, so its closing ends the Sidebar keys.
 */
export function useVimSidebar(
  active: boolean,
  onCommand: (cmd: SidebarCommand) => void,
): { runMenu: <T>(open: () => Promise<T>) => Promise<T> } {
  const commandRef = useRef(onCommand)
  commandRef.current = onCommand

  useEffect(() => {
    if (!active) return
    const handler = (cmd: SidebarCommand): void => commandRef.current(cmd)
    sidebarHandler = handler
    return () => {
      if (sidebarHandler === handler) sidebarHandler = null
    }
  }, [active])

  const runMenu = useCallback(async <T,>(open: () => Promise<T>): Promise<T> => {
    rowMenuOpen = true
    try {
      return await open()
    } finally {
      rowMenuOpen = false
      // After the menu's action has run (a duplicate made active, a tab
      // closed): the keyboard then goes to the page that's now in front, not
      // the one about to be replaced.
      setTimeout(() => endSidebarKeysHook?.(), 0)
    }
  }, [])

  return { runMenu }
}

// ── A page drawn in the page's place ──
//
// The group page (a tab group parked on, its tabs in the page area) has no
// tab view to run COMMAND's keys, so it takes them here: the keymap's
// commands it knows (j/k move through its tabs, i types in its filter), and
// a few keys of its own ahead of the keymap (a digit, Enter). So do a page
// load's error over the page (r tries again), and the Bookshelf while it
// has the keyboard — ahead of the group page and the error even when they
// mount after it: the one holding the keyboard always goes first.

export interface PageKeys {
  /** A key ahead of the keymap; true when the page took it. */
  intercept: (e: KeyboardEvent) => boolean
  /** A COMMAND command; true when the page took it. */
  command: (command: string) => boolean
}

export interface PageKeysOptions {
  /** Holds the keyboard (the Bookshelf): goes ahead of every page mounted
   *  without it, even one mounted later. */
  owner?: boolean
}

interface PageKeysEntry extends PageKeys {
  owner: boolean
}

// Walked from the end: the keyboard's holders on top, the one mounted last
// first, then the pages drawn in the page's place, the one mounted last
// first. A key or command one doesn't take goes on to the one below.
const pageKeysStack: PageKeysEntry[] = []

/** Puts a handler in the stack: a holder of the keyboard on top, any other
 *  under the holders (on top of the other pages). */
export function addPageKeys(entry: PageKeys, options: PageKeysOptions = {}): () => void {
  const owned: PageKeysEntry = { intercept: entry.intercept, command: entry.command, owner: options.owner === true }
  const firstOwner = pageKeysStack.findIndex((e) => e.owner)
  if (owned.owner || firstOwner === -1) pageKeysStack.push(owned)
  else pageKeysStack.splice(firstOwner, 0, owned)
  return () => {
    const at = pageKeysStack.indexOf(owned)
    if (at !== -1) pageKeysStack.splice(at, 1)
  }
}

/** Runs a COMMAND command on the page drawn in the page's place; false when
 *  there's none or it doesn't take the command. */
export function dispatchPageCommand(command: string): boolean {
  for (let i = pageKeysStack.length - 1; i >= 0; i--) if (pageKeysStack[i].command(command)) return true
  return false
}

function interceptPageKey(e: KeyboardEvent): boolean {
  for (let i = pageKeysStack.length - 1; i >= 0; i--) if (pageKeysStack[i].intercept(e)) return true
  return false
}

/** Hooks a page drawn in the page's place up to COMMAND's keys while it's
 *  mounted. `owner` for one that holds the keyboard while it's mounted (the
 *  Bookshelf), so a page mounted after it doesn't take its keys. */
export function usePageKeys(keys: PageKeys, options: PageKeysOptions = {}): void {
  const keysRef = useRef(keys)
  keysRef.current = keys
  const owner = options.owner === true
  useEffect(() => addPageKeys({
    intercept: (e) => keysRef.current.intercept(e),
    command: (command) => keysRef.current.command(command),
  }, { owner }), [owner])
}

// ── Key sequences, a popup's mode ──
//
// @bedware/ui's (its vim-form entry), with the app's own sets of what repeats:
// the package's defaults are a form's, where a count moves the cursor (5j).

const SEQUENCE_OPTIONS = { repeatable: REPEATABLE, countable: COUNT_COMMANDS } as const

/** Key tokens into sequences against `keymap`: see the package's. */
export function useKeySequence(
  keymap: VimKeymap,
  onCommand: (command: string) => void,
): { pending: string; feed: (e: KeyboardEvent) => boolean; reset: () => void } {
  return useKeySequenceIn(keymap, onCommand, SEQUENCE_OPTIONS)
}

/** A popup's own COMMAND / INSERT pair: see the package's useVimFormMode. */
export function usePopupVimMode(options: Omit<Parameters<typeof useVimFormModeIn>[0], 'repeatable' | 'countable'>): ReturnType<typeof useVimFormModeIn> {
  return useVimFormModeIn({ ...options, ...SEQUENCE_OPTIONS })
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

/** Ctrl and the key at `code` (by position, so in any input language),
 *  nothing else held, no IME at work. */
function isCtrlChord(e: KeyboardEvent, code: string): boolean {
  return e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing && e.code === code
}

/** Ctrl+C that leaves for COMMAND, as it leaves a popup's field: typed in
 *  the address bar — a page's address or a page's filter — or on a control
 *  of the bang form; its fields keep their Ctrl+C. Off the Mac, with part
 *  of the bar's text selected, Ctrl+C copies it — the whole of it selected
 *  is what going into the bar does, not a selection to copy. */
function leavesPageInsert(e: KeyboardEvent): boolean {
  if (!isCtrlChord(e, 'KeyC')) return false
  const target = e.target
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement && target.id === 'url-bar') {
    const from = target.selectionStart ?? 0
    const to = target.selectionEnd ?? 0
    const part = to > from && to - from < target.value.length
    return isMac || !part
  }
  return isOwnKeysForm(target) && !isEditable(target)
}

// ── The main window's mode ──

interface Options {
  enabled: boolean
  keymap: VimKeymap
  /** A command from the keymap: an app action id, a Sidebar command or a
   *  vim command — also one the page's keys asked for. */
  onCommand: (command: string) => void
  /** Hand the keyboard to the active tab's page, for `mode`. False when there
   *  is no page to go to, e.g. while parked on a group — or, in COMMAND, a
   *  page this renderer draws: the window keeps the keys. */
  focusPage: (mode: VimMode) => boolean
  isActiveTab: (tabId: string) => boolean
}

export interface VimModeState {
  /** Null while Vim mode is off. */
  mode: VimMode | null
  /** INSERT in a chrome field (the address bar, a rename in the Sidebar)
   *  rather than in a page. */
  insertInChrome: boolean
  /** Keys typed so far of an unfinished sequence (vim's showcmd). */
  pending: string
  /** A Sidebar command just ran in COMMAND, and Ctrl is still held (or,
   *  rebound to a plain key, a pause hasn't passed): the Sidebar's keys are
   *  live — a cursor on the active row. */
  sidebarKeys: boolean
  /** COMMAND, in the active tab's page when there is one. */
  enterCommand: (force: boolean) => void
  /** Into the active tab's page, in INSERT mode — keys reach the page. */
  enterInsert: () => void
  /** A Sidebar command is about to run: its keys stay live, with the
   *  keyboard in the chrome, until Ctrl is let go. */
  startTabWalk: () => void
  /** A popup closed: in COMMAND the page gets the keyboard back — unless
   *  what the popup did put it in a chrome field. */
  returnToPage: () => void
  /** The Sidebar keys end now, the walk's idle wait and all. */
  endSidebarKeys: () => void
}

export function useVimMode({ enabled, keymap, onCommand, focusPage, isActiveTab }: Options): VimModeState {
  const [mode, setModeState] = useState<VimMode | null>(null)
  const modeRef = useRef<VimMode | null>(null)
  // INSERT in a chrome field (URL bar, rename) rather than in the page. The
  // state is for the window (Settings' Hide the Sidebar in INSERT leaves a
  // chrome field's INSERT be), the ref for the handlers here.
  const insertInChromeRef = useRef(false)
  const [insertInChrome, setInsertInChrome] = useState(false)
  const [sidebarKeys, setSidebarKeys] = useState(false)
  const ctrlDownRef = useRef(false)
  const walkIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // What the pages get (main passes it on): the mode, COMMAND's keys, and a
  // count of trips out of INSERT on purpose (Ctrl+[), each of which makes a
  // page's focused field let go. Sent as the mode changes, not after the
  // render, so a page learns it before it's handed the keyboard.
  const keymapEntriesRef = useRef<VimKeymapEntries>([])
  const leaveInsertRef = useRef(0)
  const pushState = useCallback(() => {
    window.electronAPI.vimSetState?.({ mode: modeRef.current, keymap: keymapEntriesRef.current, leaveInsert: leaveInsertRef.current, ignorePageFocus })
  }, [])
  useEffect(() => {
    repushPageState = pushState
    return () => { repushPageState = null }
  }, [pushState])

  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand
  const { pending: chromePending, feed, reset } = useKeySequence(keymap, (command) => onCommandRef.current(command))
  // An unfinished sequence typed in the active page, which runs COMMAND's
  // keys itself.
  const [pagePending, setPagePending] = useState('')
  const pending = chromePending || pagePending
  const pendingRef = useRef(chromePending)
  pendingRef.current = chromePending
  const focusPageRef = useRef(focusPage)
  focusPageRef.current = focusPage
  const isActiveTabRef = useRef(isActiveTab)
  isActiveTabRef.current = isActiveTab

  const clearCtrlTimers = useCallback(() => {
    if (walkIdleTimerRef.current) clearTimeout(walkIdleTimerRef.current)
    walkIdleTimerRef.current = null
  }, [])

  /** The Sidebar keys end: a pause after the last one, Ctrl let go after a
   *  Ctrl chord one (or the window lost it). The tab the walk stopped on
   *  gets the keyboard. */
  const endSidebarKeys = useCallback(() => {
    if (rowMenuOpen) return
    clearCtrlTimers()
    setSidebarKeys(false)
    if (!walkingTabs) return
    walkingTabs = false
    log.event('vim:tab walk', 'end')
    if (modeRef.current === 'command') focusPageRef.current('command')
  }, [clearCtrlTimers])

  useEffect(() => {
    endSidebarKeysHook = endSidebarKeys
    return () => {
      if (endSidebarKeysHook === endSidebarKeys) endSidebarKeysHook = null
    }
  }, [endSidebarKeys])

  const setMode = useCallback((next: VimMode | null, why: string, inChrome = false) => {
    const changed = modeRef.current !== next
    if (changed) {
      log.event('vim:mode', next ?? 'off', why)
      // A prefix typed in one mode isn't the next one's to finish.
      reset()
    }
    modeRef.current = next
    insertInChromeRef.current = next === 'insert' && inChrome
    setInsertInChrome(insertInChromeRef.current)
    setModeState(next)
    if (changed) pushState()
    if (next !== 'command') {
      // The Sidebar keys are COMMAND's.
      walkingTabs = false
      clearCtrlTimers()
      setSidebarKeys(false)
    }
  }, [clearCtrlTimers, pushState, reset])

  const enterCommand = useCallback((force: boolean) => {
    if (modeRef.current === null) return
    // A chrome field (the URL bar) lets go of the keys, and so does the
    // page's field: this is a trip out of INSERT on purpose.
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused !== document.body) focused.blur()
    leaveInsertRef.current++
    // Ctrl+[ is vim's Esc: it drops a prefix pending in COMMAND too (the
    // page's goes with the leaveInsert count, applyState in the preload).
    reset()
    // Set first: the page must learn its mode before it gets the keys.
    setMode('command', 'enter-command')
    pushState()
    if (walkingTabs || !focusPageRef.current('command')) claimRendererFocus(force)
  }, [setMode, pushState, reset])

  const enterInsert = useCallback(() => {
    if (modeRef.current === null) return
    walkingTabs = false
    // Set first: focusPage may activate a tab, which must now take the
    // keyboard, and the page must learn its mode before keys arrive.
    const previous = modeRef.current
    setMode('insert', 'enter-insert')
    if (!focusPageRef.current('insert')) setMode(previous, 'no page to go to')
  }, [setMode])

  const returnToPage = useCallback(() => {
    if (modeRef.current !== 'command' || walkingTabs || isEditable(document.activeElement)) return
    focusPageRef.current('command')
  }, [])

  const startTabWalk = useCallback(() => {
    if (modeRef.current !== 'command') return
    clearCtrlTimers()
    setSidebarKeys(true)
    if (!walkingTabs) {
      walkingTabs = true
      log.event('vim:tab walk', 'start')
      claimRendererFocus(true)
    }
    // A plain key a Sidebar command was rebound to: no Ctrl release will
    // end it.
    if (!ctrlDownRef.current) walkIdleTimerRef.current = setTimeout(endSidebarKeys, WALK_IDLE_MS)
  }, [clearCtrlTimers, endSidebarKeys])

  // Vim mode starts in COMMAND, like vim. Not forced: of several windows
  // restored at launch only the focused one takes the keyboard.
  useEffect(() => {
    if (!enabled) {
      setMode(null, 'disabled')
      reset()
      return
    }
    const initial = modeForRendererFocus(document.activeElement)
    setMode(initial, 'enabled', isChromeField(document.activeElement))
    if (initial === 'command' && document.hasFocus()) focusPageRef.current('command')
  }, [enabled, setMode, reset])

  // Pages run COMMAND's keys themselves.
  useEffect(() => {
    keymapEntriesRef.current = [...keymap]
    pushState()
  }, [keymap, pushState])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent): void => {
      // Ctrl+C in the address bar or on the bang form: COMMAND.
      if (modeRef.current === 'insert' && leavesPageInsert(e)) {
        e.preventDefault()
        e.stopPropagation()
        enterCommand(false)
        return
      }
      if (modeRef.current !== 'command') return
      // Typing into a chrome field (URL bar, rename) stays typing.
      if (isEditable(e.target)) return
      if (e.metaKey || e.altKey) return
      if (e.ctrlKey) {
        // Ctrl with a letter is a Vim key when the keymap binds it (<C-j>);
        // other Ctrl chords go on as they would.
        const token = keyTokenFromEvent(e)
        if (token && isCtrlToken(token) && feed(e)) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
      // One drawn in the page's place takes some ahead of the keymap.
      // Not Enter while the Sidebar's cursor is off the row shown: that
      // Enter shows the cursor's row (the keymap's, below).
      const rowGo = sidebarCursorAway() && keyTokenFromEvent(e) === '<CR>'
      // Nor Esc while rows are picked there: that Esc unpicks them, and the
      // next one is the page's (closing it).
      const rowUnselect = sidebarRowsPicked() && keyTokenFromEvent(e) === '<Esc>'
      if (!pendingRef.current && !rowGo && !rowUnselect && interceptPageKey(e)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (!rowGo && isPageControlKey(e)) return
      // COMMAND mode owns every plain key in the chrome — an unbound one
      // must not reach a focused toolbar button (Enter/Space) or move focus
      // (Tab) either. Capture phase on window, so App's global Escape
      // handler and any row handlers never see it.
      e.preventDefault()
      e.stopPropagation()
      feed(e)
    }

    // A text field taking focus is INSERT; the chrome taking it otherwise
    // (a click on it, the window coming back) is COMMAND, here in the
    // chrome — not handed on to the page, which would take it from under a
    // double-click that opens a rename box.
    const syncWithFocus = (): void => {
      if (!document.hasFocus()) return
      const next = modeForRendererFocus(document.activeElement)
      setMode(next, 'renderer focus', isChromeField(document.activeElement))
    }
    const onWindowFocus = (): void => { setTimeout(syncWithFocus, 0) }
    const onFocusIn = (e: FocusEvent): void => {
      if (isEditable(e.target)) setMode('insert', 'field focus', isChromeField(e.target))
      else if (isOwnKeysForm(e.target)) setMode('insert', 'form focus', false)
      else syncWithFocus()
    }
    // Leaving a text field, or the bang form, for nothing (Esc, Enter in a
    // rename) is COMMAND; leaving it for the page is the page's focus
    // event's to decide.
    const onFocusOut = (e: FocusEvent): void => {
      if (!(isEditable(e.target) || isOwnKeysForm(e.target)) || e.relatedTarget) return
      setTimeout(syncWithFocus, 0)
    }

    const cleanupTabEvents = window.electronAPI.onTabEvent?.((raw) => {
      const evt = raw as { type?: string; tabId?: string; byUser?: boolean; mode?: VimMode; why?: string; command?: string; pending?: string }
      // A sequence ending counts from any page — the one it was typed in may
      // have stopped being the active one on the way.
      if (evt.type === 'vim-pending' && !evt.pending) {
        setPagePending('')
        return
      }
      if (!evt.tabId || !isActiveTabRef.current(evt.tabId)) return
      if (evt.type === 'focus') {
        if (evt.byUser) {
          // A click into the page. A field it lands in makes the page
          // report INSERT right after.
          reset()
          setMode('command', 'page click')
          return
        }
        // The page took focus on its own — a reload, a load finishing. While
        // Ctrl walks the tabs the chrome keeps the keyboard; from a chrome
        // field the keys did move to the page, which is COMMAND.
        if (walkingTabs) claimRendererFocus(false)
        else if (modeRef.current === 'insert' && insertInChromeRef.current) setMode('command', 'page focus')
      } else if (evt.type === 'vim' && (evt.mode === 'command' || evt.mode === 'insert')) {
        // The page moved itself along: i, a field focused or left, Esc.
        if (!walkingTabs) setMode(evt.mode, `page: ${evt.why ?? ''}`)
      } else if (evt.type === 'vim-command') {
        setPagePending('')
        if (evt.command) onCommandRef.current(evt.command)
      } else if (evt.type === 'vim-pending') {
        setPagePending(evt.pending ?? '')
      }
    })

    // Ctrl pressed or let go anywhere in the window — the page or the
    // chrome (main sees both) — or the window losing it. Pressing it shows
    // nothing; letting it go ends what a Ctrl chord Sidebar key started.
    const cleanupCtrl = window.electronAPI.onVimCtrl?.((down) => {
      ctrlDownRef.current = down
      if (!down && walkingTabs) endSidebarKeys()
    })

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    // A prefix waits for its next key however long, while the keys stay
    // here: a click, or the window losing them — to the page, a popup,
    // another app — drops it, and the which-key strip with it.
    window.addEventListener('blur', reset)
    document.addEventListener('mousedown', reset, true)
    return () => {
      cleanupTabEvents?.()
      cleanupCtrl?.()
      endSidebarKeys()
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('blur', reset)
      document.removeEventListener('mousedown', reset, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [enabled, feed, reset, setMode, endSidebarKeys, clearCtrlTimers, enterCommand])

  return { mode, insertInChrome, pending, sidebarKeys, enterCommand, enterInsert, startTabWalk, returnToPage, endSidebarKeys }
}
