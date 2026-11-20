// The key hint bar the Downloads page introduced, shared by every keyboard
// surface — Downloads, Search Everything, the Command Palette, Find in Page,
// the address editor, the pickers, the Sidebar and the Bookshelf: "Label
// <key> <key>" items in the toolbar tone, each key its own cap, always along
// the bottom. One rule everywhere (the owner's): the bar always shows, with
// the main keys; where there are more, it ends in "Keys ?" and ? opens
// KeysHelp — the bar itself never grows into the full list.

import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { displayKeySequence, keysFor, type VimKeymap } from '../lib/vim-keymap'
import type { WhichKeyEntry } from '../lib/which-key'

export function Hint({ label, keys }: { label: ReactNode; keys: ReactNode[] }) {
  if (keys.length === 0) return null
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {label}
      {keys.map((key, i) => <kbd key={i}>{key}</kbd>)}
    </span>
  )
}

/** One cap at the hint bar's size wherever it sits — in a search box, or
 *  on a button whose own text is bigger. `onField`: the cap sits on a text
 *  field, whose fill is the cap's own — it takes a lighter one so it reads
 *  as a cap, the way it does on the hint bar. */
export function KeyCap({ children, onField = false, onPrimary = false }: {
  children: ReactNode
  onField?: boolean
  /** On a primary (filled) button: a see-through cap in the button's own
   *  text colour, readable in every theme. */
  onPrimary?: boolean
}) {
  return (
    <span className="inline-flex text-[11px] font-medium leading-none">
      <kbd data-on-field={onField ? '' : undefined} data-on-primary={onPrimary ? '' : undefined}>{children}</kbd>
    </span>
  )
}

interface BarProps {
  children: ReactNode
  /** Narrow panels: hints wrap onto more rows instead of being cut off. */
  wrap?: boolean
  className?: string
}

/** The bar, for the bottom of whatever it's for: the line is on top. */
export function HintBar({ children, wrap = false, className }: BarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center gap-x-3 border-t border-border bg-toolbar px-4 text-[11px] font-medium text-muted-foreground',
        wrap ? 'flex-wrap gap-y-1.5 py-2' : 'h-10 overflow-hidden whitespace-nowrap',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** All of a surface's keys, as a table over it — what ? brings up wherever
 *  the hint bar (always shown) names only the main ones. Covers the nearest
 *  positioned ancestor, or the whole window with `fixed` (a popup's own).
 *  Closing — Esc, ? again — is the owner's keys'; a click outside the card
 *  or on its X asks through `onClose`. */
export function KeysHelp({ rows, onClose, children, fixed = false, columns = 1 }: {
  /** Keys (as text) and what they do; a row without keys is left out. */
  rows: ReadonlyArray<{ keys: string; what: ReactNode }>
  onClose: () => void
  /** Notes under the table. */
  children?: ReactNode
  fixed?: boolean
  /** Side-by-side tables, for a long list. */
  columns?: 1 | 2
}) {
  const shown = rows.filter((row) => row.keys)
  const perColumn = Math.ceil(shown.length / columns)
  const tables = Array.from({ length: columns }, (_, i) => shown.slice(i * perColumn, (i + 1) * perColumn))
  return (
    <div
      className={cn(fixed ? 'fixed' : 'absolute', 'inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[1px]')}
      onClick={onClose}
    >
      <div
        className={cn(
          'flex max-h-[90%] max-w-[92%] flex-col rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl',
          columns === 2 ? 'w-[760px]' : 'w-[440px]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close keyboard shortcuts"
            tabIndex={-1}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          <div className={cn('grid gap-x-8', columns === 2 && 'grid-cols-2')}>
            {tables.map((table, i) => (
              <dl key={i} className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1.5 text-xs">
                {table.map((row, j) => (
                  <div key={j} className="contents">
                    <dt className="whitespace-nowrap font-mono text-foreground">{row.keys}</dt>
                    <dd className="text-muted-foreground">{row.what}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

/** The hint bar's way to all the keys: "Keys ?" at its end, a click or the
 *  key bringing KeysHelp up. */
export function KeysHelpButton({ keyCap, onClick }: { keyCap: string | undefined; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground"
      title="All the keys"
      tabIndex={-1}
    >
      Keys
      {keyCap && <kbd>{keyCap}</kbd>}
    </button>
  )
}

/** The caps for `commands` as `map` binds them — each command's first key,
 *  written the way a keycap reads (Enter, Ctrl+J). */
export function vimKeyCaps(map: VimKeymap | null, ...commands: string[]): string[] {
  if (!map) return []
  const out: string[] = []
  for (const command of commands) {
    const first = keysFor(map, command)[0]
    if (first) out.push(displayKeySequence(first))
  }
  return out
}

/** Every key `map` binds to `command`, as caps — for a command whose keys
 *  are all worth knowing (Find's j / n). */
export function vimKeyCapsAll(map: VimKeymap | null, command: string): string[] {
  return map ? keysFor(map, command).map(displayKeySequence) : []
}

/** The cap of the key that leaves a popup's field for COMMAND: Ctrl+C (⌃C
 *  on a Mac). Esc closes the popup. */
export const LEAVE_INSERT_CAP = displayKeySequence('<C-c>')

/** A list row's key in Vim mode, as a keycap filling the row's left padding
 *  (positioned by the row, so its content never moves; a span, as the
 *  global kbd style's padding would widen it): in COMMAND its label — the
 *  part typed so far lit, rows it no longer fits faded. Nothing in INSERT,
 *  where typing goes in the box and no key picks a row. `always`: the cap
 *  stays, empty, while there's no label to show — for a column of them that
 *  mustn't come and go. `index`: the row's place in its list (from 0) —
 *  the cap stays likewise, and reads the row's number (1, 2, 3…) while it
 *  has no label: in INSERT, or with the labels another list's. */
export function RowHint({ mode, label, pending, className, always = false, index }: {
  mode: 'command' | 'insert' | null
  label?: string
  /** Keys typed so far of an unfinished sequence. */
  pending?: string
  className?: string
  always?: boolean
  index?: number
}) {
  let numbered = false
  if (mode !== 'command' || !label) {
    if (index !== undefined && index >= 0) {
      label = String(index + 1)
      numbered = true
    } else if (always) label = ''
    else return null
  }
  const typed = !numbered && pending && label.startsWith(pending) ? pending.length : 0
  const faded = !numbered && !!label && !!pending && !typed
  return (
    <span
      aria-hidden="true"
      className={cn(
        'z-10 inline-flex items-center justify-center h-[18px] min-w-4 px-px rounded-md border border-border bg-popover text-foreground font-mono font-medium text-[10px] leading-none tabular-nums shadow-[0_0_2px_rgb(0_0_0/0.1)] select-none pointer-events-none transition-opacity',
        // A number only counts the rows: quieter than a label to type.
        numbered && 'font-normal text-muted-foreground',
        faded && 'opacity-30',
        className,
      )}
    >
      <span className="text-primary">{label.slice(0, typed)}</span>{label.slice(typed)}
    </span>
  )
}

/** A row's cap in a column of its own at the row's start, as the Sidebar's
 *  label column: always there, one width whatever it reads (three letters
 *  fit) — the row's label in COMMAND, its number otherwise — then a rule
 *  down the row's whole height, so the rows' rules join into one line; the
 *  row's content never moves as the mode changes. In the row's flow, as its
 *  first child; `bleed` undoes the row's vertical padding for the rule
 *  (-my-2 for a py-2 row). `rule` false: the cap alone, for rows that
 *  aren't stacked edge to edge (the Bookshelf's nested ones). */
export function RowCap({ mode, label, pending, index, rule = true, bleed = '-my-2', className }: {
  mode: 'command' | 'insert' | null
  label?: string
  pending?: string
  /** The row's place in its list, from 0. */
  index: number
  rule?: boolean
  bleed?: string
  className?: string
}) {
  return (
    <span data-row-cap="" className={cn('flex shrink-0 items-center', rule && 'self-stretch', rule && bleed, className)}>
      <RowHint mode={mode} label={label} pending={pending} index={index} className="w-5 px-0" />
      {rule && <span aria-hidden="true" className="ml-2 w-px self-stretch bg-border" />}
    </span>
  )
}

/** The entries as hint bar items: the prefix typed, lit as the mode's
 *  showcmd is, then each next key with what it does. */
export function WhichKeyHints({ pending, entries }: { pending: string; entries: WhichKeyEntry[] }) {
  return (
    <>
      <span className="flex items-center gap-1 whitespace-nowrap text-foreground">
        <kbd className="font-mono text-primary">{displayKeySequence(pending)}</kbd>
        <span aria-hidden="true">→</span>
      </span>
      {entries.map((entry) => (
        <Hint key={entry.keys} label={entry.label} keys={[entry.keys]} />
      ))}
    </>
  )
}
