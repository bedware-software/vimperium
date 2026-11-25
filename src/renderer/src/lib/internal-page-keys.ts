// The keys of a page this window draws in the page area: Downloads, Bangs.
//
// Such a page is COMMAND's, and the mode shown is what the keys do: the
// window's commands it has a meaning for come on the window's keymap (dd
// deletes the row rather than closing the tab; a rebind carries over, and
// the page's hints show what's bound), its own keys (s the sort, Enter,
// Space…) go ahead of the keymap, and every other key is the window's as on
// any page. i and / type in its filter — the address bar
// (lib/address-filter.ts), the only INSERT here; Esc closes the page. Both
// ride lib/vim-mode.ts usePageKeys, as the group page's keys do.

import { useMemo } from 'react'
import { SEQUENCE_JOIN, keyTokenFromEvent, type VimKeymap } from '../../../shared/vim-keys'
import { DEFAULT_VIM_KEYMAP } from '../../../shared/vim-default-keymap'
import { useReservedHintKeys } from './hint-labels'
import { displayKeySequence, keysFor, parseVimKeymap } from './vim-keymap'
import { usePageKeys } from './vim-mode'
import { useWindowVimKeymap } from './window-vim-keymap'

/** A window command the page has a meaning of its own for: `cmd('close-tab')`
 *  — dd deletes the row rather than closing the tab. */
export interface CommandKey {
  readonly command: string
}
export const cmd = (command: string): CommandKey => ({ command })

/** One of an action's keys: a key token of the page's own (`s`, `<CR>`),
 *  taken while the window's keymap leaves it free, or a window command. */
export type PageKey = string | CommandKey

/** Action → its keys, in the order its hints list them. */
export type PageKeyTable<A extends string> = Readonly<Record<A, readonly PageKey[]>>

// Keys no keymap can bind, so never the window's: the menu key, Shift+F10.
const CONTEXT_MENU_KEY = '<ContextMenu>'
const SHIFT_F10_KEY = '<S-F10>'
/** The keyboard's own ways to a context menu, for a page's menu action. */
export const CONTEXT_MENU_KEYS: readonly string[] = [CONTEXT_MENU_KEY, SHIFT_F10_KEY]

/** How a list moves: the window's scroll keys, and the arrows & co. */
export type ListMove = 'down' | 'up' | 'halfDown' | 'halfUp' | 'pageDown' | 'pageUp' | 'first' | 'last'
export const LIST_MOVES: PageKeyTable<ListMove> = {
  down: [cmd('scroll-down'), '<Down>'],
  up: [cmd('scroll-up'), '<Up>'],
  halfDown: [cmd('half-page-down')],
  halfUp: [cmd('half-page-up')],
  pageDown: ['<PageDown>'],
  pageUp: ['<PageUp>'],
  first: [cmd('page-top'), '<Home>'],
  last: [cmd('page-bottom'), '<End>'],
}
// Held down, these keep going; every other action fires once per press.
const REPEATING = new Set<string>(Object.keys(LIST_MOVES))

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey' | 'isComposing'>

/** The token a keydown stands for on the page: the keymap's tokens
 *  (shared/vim-keys.ts — by position, so any input language), plus the
 *  menu key and Shift+F10. Null for a chord with Ctrl, Cmd or Alt: those
 *  are the window's. */
export function pageKeyToken(e: KeyLike): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return null
  if (e.key === 'ContextMenu') return CONTEXT_MENU_KEY
  if (e.key === 'F10' && e.shiftKey) return SHIFT_F10_KEY
  return keyTokenFromEvent(e)
}

/** The tokens some binding of `keymap` starts with. */
function firstTokens(keymap: VimKeymap): Set<string> {
  const out = new Set<string>()
  for (const seq of keymap.keys()) out.add(seq.split(SEQUENCE_JOIN)[0])
  return out
}

export interface ResolvedPageKeys<A extends string> {
  /** A key of the page's own → its action: only keys `keymap` leaves free. */
  byToken: ReadonlyMap<string, A>
  /** A window command → the page's action for it. */
  byCommand: ReadonlyMap<string, A>
  /** Each action's keys as keycaps read (dd, Enter, ⌃M), in the table's
   *  order; empty when the keymap took them all. */
  caps: Readonly<Record<A, readonly string[]>>
}

/** `table` against the window's keymap: which keys the page may take. */
export function resolvePageKeys<A extends string>(keymap: VimKeymap, table: PageKeyTable<A>): ResolvedPageKeys<A> {
  const taken = firstTokens(keymap)
  const byToken = new Map<string, A>()
  const byCommand = new Map<string, A>()
  const caps = {} as Record<A, string[]>
  for (const action of Object.keys(table) as A[]) {
    const out: string[] = []
    for (const key of table[action]) {
      if (typeof key === 'string') {
        if (taken.has(key) || byToken.has(key)) continue
        byToken.set(key, action)
        if (!CONTEXT_MENU_KEYS.includes(key)) out.push(displayKeySequence(key))
      } else {
        if (!byCommand.has(key.command)) byCommand.set(key.command, action)
        for (const seq of keysFor(keymap, key.command)) out.push(displayKeySequence(seq))
      }
    }
    caps[action] = [...new Set(out)]
  }
  return { byToken, byCommand, caps }
}

let defaultMain: VimKeymap | null = null

/** COMMAND's keymap as it stands by default, until the window's has loaded. */
function defaultMainKeymap(): VimKeymap {
  if (!defaultMain) defaultMain = parseVimKeymap(DEFAULT_VIM_KEYMAP).main
  return defaultMain
}

/** The bindings of `main` (the window's COMMAND keymap) for the commands
 *  `table` takes: what of the window's keys the page answers to, Ctrl
 *  chords (<C-d>) and sequences (dd, gg) included. */
export function pageKeymap<A extends string>(main: VimKeymap, table: PageKeyTable<A>): VimKeymap {
  const commands = new Set<string>()
  for (const keys of Object.values(table) as Array<readonly PageKey[]>) {
    for (const key of keys) if (typeof key !== 'string') commands.add(key.command)
  }
  const out: VimKeymap = new Map()
  for (const [seq, command] of main) if (commands.has(command)) out.set(seq, command)
  return out
}

/** Where a page action came from. */
export interface PageKeySource {
  /** The window command it came as (dd: close-tab); none for a key of the
   *  page's own. */
  command?: string
  /** The keydown, for a key of the page's own. */
  event?: KeyboardEvent
}

/** Runs `action`; false when it doesn't apply now, and the key does
 *  nothing more (r retries only a failed download). */
export type PageKeyRunner<A extends string> = (action: A, source: PageKeySource) => boolean

/** A help row's keys: one action's (`dd, Del`), or two side by side
 *  (`j / k, ↓ / ↑`). */
export function helpKeys<A extends string>(caps: Readonly<Record<A, readonly string[]>>, actions: readonly A[]): string {
  if (actions.length === 1) return caps[actions[0]].join(', ')
  const [a, b] = [caps[actions[0]], caps[actions[1]]]
  const pairs: string[] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) pairs.push(`${a[i]} / ${b[i]}`)
  return pairs.join(', ')
}

/** A button's tooltip with its key, when it has one: `Delete (dd)`. */
export function titleWithKey(label: string, key: string | undefined): string {
  return key ? `${label} (${key})` : label
}

/** The help's last line. */
export function windowKeysNote(): string {
  return "Esc closes the page. Every other key is the browser's, as on any page."
}

/**
 * Hooks a page drawn in the page area up to COMMAND's keys while it's
 * mounted. `ownsKeyboard` is false for a key that isn't the page's (typed
 * in a field, Enter on one of its own buttons). `table` must be a module
 * constant.
 */
export function useInternalPageKeys<A extends string>({ table, run, ownsKeyboard }: {
  table: PageKeyTable<A>
  run: PageKeyRunner<A>
  ownsKeyboard: (e: KeyboardEvent) => boolean
}): {
  /** The window's COMMAND keymap; null until it has loaded. */
  keymap: VimKeymap | null
  caps: Readonly<Record<A, readonly string[]>>
  /** An action's first key as its cap reads, for a hint or a tooltip. */
  key: (action: A) => string | undefined
} {
  const parsed = useWindowVimKeymap()
  const main = parsed?.main ?? null
  const keymap = useMemo(() => pageKeymap(main ?? defaultMainKeymap(), table), [main, table])
  const resolved = useMemo(() => resolvePageKeys(keymap, table), [keymap, table])

  // The page's own letters go ahead of the keymap: no Sidebar label may
  // start with one.
  const letters = useMemo(() => [...resolved.byToken.keys()].filter((t) => /^[a-z]$/i.test(t)), [resolved])
  useReservedHintKeys(letters)

  usePageKeys({
    intercept: (e) => {
      if (!ownsKeyboard(e)) return false
      const token = pageKeyToken(e)
      const action = token ? resolved.byToken.get(token) : undefined
      if (action === undefined) return false
      if (e.repeat && !REPEATING.has(action)) return true
      return run(action, { event: e })
    },
    // Taken even when it does nothing now: dd with no row to delete must
    // not go on to close the tab.
    command: (command) => {
      const action = resolved.byCommand.get(command)
      if (action === undefined) return false
      run(action, { command })
      return true
    },
  })

  return {
    keymap: main,
    caps: resolved.caps,
    key: (action) => resolved.caps[action][0],
  }
}
