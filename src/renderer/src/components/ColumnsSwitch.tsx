// One column or two, for the pages that list rows in the page area — a
// group's page, Search Everything. Two columns are the wide layout: the
// page's whole width, to show as many rows at once as fit. The switch is a
// pair of choices, or c in COMMAND — the page's own key, ahead of the
// keymap while no binding of the user's starts with it; no row's label
// starts with it then (lib/hint-labels.ts). Each page remembers its own.
//
// A list of short rows (Search Everything's workspaces and tab groups)
// takes as many columns as fit in place of two (`many`); one that's never
// long (its profiles) stays in one column, its switch there but locked.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Columns2, LayoutGrid, Rows3 } from 'lucide-react'
import { SEQUENCE_JOIN, keyTokenFromEvent } from '../../../shared/vim-keys'
import { useWindowVimKeymap } from '../lib/window-vim-keymap'
import { useReservedHintKeys } from '../lib/hint-labels'
import type { VimMode } from '../lib/vim-mode'
import { cn } from '../lib/utils'
import { Kbd, Segmented, type SegmentedProps } from '@bedware/ui'

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

/** A Segmented in a list page's header (the small track), its choices out
 *  of the Tab order: the page's keys reach them, and Tab is the page's own.
 *  The package has no prop for it, so the attribute is set on its buttons
 *  after each render. */
export function PageSegmented<T extends string | boolean>(props: SegmentedProps<T>) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    ref.current?.querySelectorAll('[role="radio"]').forEach((radio) => radio.setAttribute('tabindex', '-1'))
  })
  return <span ref={ref} className="contents"><Segmented size="sm" {...props} /></span>
}

/** The switch, the key's cap before it while the keys are COMMAND's. */
export function ColumnsSwitch({ columns, onChange, keyFree, vimMode, many = false, locked = false, className }: {
  columns: Columns
  onChange: (columns: Columns) => void
  keyFree: boolean
  vimMode: VimMode | null
  /** The wide layout is as many columns as fit, not two. */
  many?: boolean
  /** One column and no other: the switch shows, dimmed, and does nothing. */
  locked?: boolean
  className?: string
}) {
  const wide = many ? 'As many columns as fit' : 'Two columns'
  const one = { value: '1', label: <Rows3 size={14} />, title: `One column${keyFree ? ` (${COLUMNS_KEY})` : ''}` }
  if (locked) {
    return (
      <div
        className={cn('flex shrink-0 cursor-not-allowed items-center gap-2 opacity-40', className)}
        title="Always one column here"
        aria-disabled="true"
      >
        {vimMode === 'command' && keyFree && <Kbd className="shrink-0">{COLUMNS_KEY}</Kbd>}
        {/* pointer-events-none: the hover is the wrapper's, for its title and cursor. */}
        <PageSegmented label="Layout" value="" options={[{ ...one, title: undefined }]} onChange={() => {}} className="pointer-events-none shrink-0" />
      </div>
    )
  }
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {vimMode === 'command' && keyFree && (
        <Kbd className="shrink-0" title={`One column / ${wide.toLowerCase()}`}>{COLUMNS_KEY}</Kbd>
      )}
      <PageSegmented
        label="Layout"
        value={String(columns)}
        options={[
          one,
          { value: '2', label: many ? <LayoutGrid size={14} /> : <Columns2 size={14} />, title: `${wide}${keyFree ? ` (${COLUMNS_KEY})` : ''}` },
        ]}
        onChange={(n) => onChange(n === '2' ? 2 : 1)}
        className="shrink-0"
      />
    </div>
  )
}
