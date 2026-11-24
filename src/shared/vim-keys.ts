// Vim's key handling for the window renderer (COMMAND mode in the browser
// chrome, its popups) and tab pages (src/preload/webview-stealth.ts). The
// mechanism — key tokens, sequences against a keymap — is @bedware/ui's,
// through its React-free entry: the preload bundles it (electron.vite.config.ts
// keeps it out of the externals; a page's preload can't require the package).
// Here: which commands are the page's, and which a count repeats.

import { timesFor as timesForIn } from '@bedware/ui/vim-keys'

export {
  SEQUENCE_JOIN, MAX_COUNT, KeySequencer, keyTokenFromEvent, isCtrlToken, matchKeys, runTimes,
  type VimKeymap, type VimKeymapEntries, type KeymapMatch,
} from '@bedware/ui/vim-keys'

/** COMMAND-mode commands the page runs itself (webview-stealth.ts) — the
 *  window renderer passes them on to the active page when the keyboard is
 *  in the chrome. INSERT (insert-mode) is the page's too, but it moves the
 *  window's mode along. */
const PAGE_COMMANDS = new Set([
  'scroll-down', 'scroll-up', 'half-page-down', 'half-page-up', 'page-top', 'page-bottom', 'focus-input',
  'next-page', 'prev-page', 'pass-key',
])

export function isPageCommand(command: string): boolean {
  return PAGE_COMMANDS.has(command)
}

/** Commands a count repeats (5j, 3x): moving and what's worth doing
 *  several times over. Any other runs once whatever the count — nobody
 *  means five new workspaces. */
export const COUNT_COMMANDS: ReadonlySet<string> = new Set([
  'scroll-down', 'scroll-up', 'half-page-down', 'half-page-up',
  'close-tab', 'reopen-closed-tab', 'next-tab', 'prev-tab',
  'cursor-down-show', 'cursor-up-show', 'row-down', 'row-up', 'row-select-down', 'row-select-up',
  'row-move-down', 'row-move-up', 'zoom-in', 'zoom-out', 'increment-url', 'decrement-url', 'repeat',
])

/** How many times `command` runs for the count typed before it. */
export function timesFor(command: string, count: number): number {
  return timesForIn(command, count, COUNT_COMMANDS)
}
