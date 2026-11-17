// One column or two, for the pages that list rows in the page area — a
// group's page, Search Everything. Two columns are the wide layout: the
// page's whole width, to show as many rows at once as fit. The switch is a
// pair of buttons, or c in COMMAND — the page's own key, ahead of the
// keymap while no binding of the user's starts with it; no row's label
// starts with it then (lib/hint-labels.ts). Each page remembers its own.

import { useEffect, useMemo, useState } from 'react'
import { Columns2, Rows3 } from 'lucide-react'
import { SEQUENCE_JOIN, keyTokenFromEvent } from '../../../shared/vim-keys'
import { useWindowVimKeymap } from '../lib/window-vim-keymap'
import { useReservedHintKeys } from '../lib/hint-labels'
import type { VimMode } from '../lib/vim-mode'
import { cn } from '../lib/utils'

export type Columns = 1 | 2

/** The width of a page's header and list, the same on every page that
 *  lists rows: one column a readable measure in the middle of the page, two
 *  the page's whole width. */
export function pageWidthClass(columns: Columns): string {
  return columns === 2 ? 'max-w-none' : 'max-w-4xl'
}

/** The switch's key in COMMAND. */
export const COLUMNS_KEY = 'c'

function load(storageKey: string): Columns {
  try {
    return localStorage.getItem(storageKey) === '2' ? 2 : 1
  } catch {
    return 1
  }
}

/** A page's columns, remembered under `storageKey`, and its key. */
export function usePageColumns(storageKey: string): {
  columns: Columns
  setColumns: (columns: Columns) => void
  /** c is the page's: no binding of the user's starts with it. */
  keyFree: boolean
  /** A key typed outside the filter, ahead of the keymap: true when it was
   *  the switch's. */
  onKey: (e: KeyboardEvent) => boolean
} {
  const [columns, setColumns] = useState<Columns>(() => load(storageKey))
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(columns)) } catch { /* the layout just isn't kept */ }
  }, [storageKey, columns])

  const keymap = useWindowVimKeymap()?.main ?? null
  const keyFree = useMemo(() => {
    if (!keymap) return true
    for (const seq of keymap.keys()) if (seq.split(SEQUENCE_JOIN)[0] === COLUMNS_KEY) return false
    return true
  }, [keymap])
  useReservedHintKeys(keyFree ? [COLUMNS_KEY] : [])

  const onKey = (e: KeyboardEvent): boolean => {
    if (!keyFree || e.metaKey || e.ctrlKey || e.altKey) return false
    if (keyTokenFromEvent(e) !== COLUMNS_KEY) return false
    if (!e.repeat) setColumns((n) => (n === 1 ? 2 : 1))
    return true
  }
  return { columns, setColumns, keyFree, onKey }
}

/** The buttons, the key's cap before them while the keys are COMMAND's. */
export function ColumnsSwitch({ columns, onChange, keyFree, vimMode, className }: {
  columns: Columns
  onChange: (columns: Columns) => void
  keyFree: boolean
  vimMode: VimMode | null
  className?: string
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {vimMode === 'command' && keyFree && (
        <kbd className="shrink-0 font-mono text-[11px]" title="One column / two">{COLUMNS_KEY}</kbd>
      )}
      <div role="radiogroup" aria-label="Layout" className="flex h-8 shrink-0 items-center rounded-md bg-secondary p-0.5">
        {([1, 2] as const).map((n) => {
          const Icon = n === 1 ? Rows3 : Columns2
          const active = columns === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={-1}
              onClick={() => onChange(n)}
              title={`${n === 1 ? 'One column' : 'Two columns'}${keyFree ? ` (${COLUMNS_KEY})` : ''}`}
              className={cn(
                'flex h-7 w-8 items-center justify-center rounded transition-colors',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon size={14} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
