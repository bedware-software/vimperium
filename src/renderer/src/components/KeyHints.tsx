// Vimperium's own side of the key hints: a row's label cap, which-key's
// entries. The bar, a hint, a cap, the table of all a surface's keys and the
// caps read off a keymap are @bedware/ui's.

import { Button, Hint, Kbd, RowKey } from '@bedware/ui'
import { cn } from '../lib/utils'
import { displayKeySequence } from '../lib/vim-keymap'

export { KeysHelp, vimKeyCaps, vimKeyCapsAll, LEAVE_INSERT_CAP } from '@bedware/ui/vim-form'
import type { WhichKeyEntry } from '../lib/which-key'

/** The hint bar's way to all the keys: "Keys ?" at its end, a click or the
 *  key bringing KeysHelp up. */
export function KeysHelpButton({ keyCap, onClick }: { keyCap: string | undefined; onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} title="All the keys" tabIndex={-1} keys={keyCap ? [keyCap] : undefined} className="shrink-0">
      Keys
    </Button>
  )
}

/** A list row's key in Vim mode, as a keycap filling the row's left padding
 *  (positioned by the row, so its content never moves): in COMMAND its label — the
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
    <RowKey quiet={numbered} className={cn('z-10 transition-opacity', faded && 'opacity-30', className)}>
      {typed > 0 && <span className="bw-vimlabel__typed">{label.slice(0, typed)}</span>}{label.slice(typed)}
    </RowKey>
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
        <Kbd className="text-ink">{displayKeySequence(pending)}</Kbd>
        <span aria-hidden="true">→</span>
      </span>
      {entries.map((entry) => (
        <Hint key={entry.keys} label={entry.label} keys={[entry.keys]} />
      ))}
    </>
  )
}
