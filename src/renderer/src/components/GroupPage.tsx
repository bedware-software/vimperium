// The page area while parked on a tab group (a click on its header, or its
// label in COMMAND): the group's tabs, the split picker's look laid out on
// the page, in one column or two (components/ColumnsSwitch.tsx: the switch
// by the count, or c in COMMAND; remembered) — two being the wide layout,
// the page's whole width.
// Enter on the selected one, or a click, shows that tab.
//
// The filter is the address bar (lib/address-filter.ts): while the group
// page shows, the bar wears the group's pill and what's typed there narrows
// its tabs; ↑/↓ typed there move the selection, Enter opens it, Esc goes
// back to COMMAND with the filter kept.
//
// Vim mode: there's no tab view to run COMMAND's keys, so the page takes
// them (lib/vim-mode.ts usePageKeys) — the keymap's scroll keys move
// through the tabs, insert-mode (i) and gi type in the filter, and Enter
// comes ahead of the keymap. In COMMAND each row wears a label that picks
// it (lib/hint-labels.ts), the one the Sidebar gives the same tab.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Globe } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import type { TabGroup } from '../store/types'
import { TabFavicon } from './TabFavicon'
import { CommentChip } from './CommentChip'
import { RowCap } from './KeyHints'
import { useHintLabels, useHintTargets } from '../lib/hint-labels'
import { ColumnsSwitch, usePageColumns } from './ColumnsSwitch'
import { fuzzyFilter } from '../lib/fuzzy'
import { focusAddressFilter, useAddressFilter, type AddressFilterKeyEvent } from '../lib/address-filter'
import { keyTokenFromEvent } from '../lib/vim-keymap'
import { usePageKeys, type VimMode } from '../lib/vim-mode'
import type { VimKeymap } from '../lib/vim-keymap'
import { cn } from '../lib/utils'

interface Props {
  group: TabGroup
  /** COMMAND mode's keys; null while Vim mode is off. */
  vimKeymap: VimKeymap | null
  /** The window's Vim mode; null while Vim mode is off. */
  vimMode: VimMode | null
  /** Keys typed so far of an unfinished COMMAND sequence. */
  vimPending: string
  /** Its rows may wear COMMAND's labels: no popup has its own up. */
  hintsOn: boolean
}

const HALF_PAGE_ROWS = 5
const COLUMNS_STORAGE_KEY = 'vimperium-group-page-columns'

// Its rows' ids among the window's hint targets: the tab's own, as the
// Sidebar lists it too — one tab, one label in both places.
const hintId = (tabId: string): string => `tab:${tabId}`

export function GroupPage({ group, vimMode, vimPending, hintsOn }: Props) {
  const [selected, setSelected] = useState(0)
  const { columns, setColumns, keyFree: columnsKeyFree, onKey: columnsKey } = usePageColumns(COLUMNS_STORAGE_KEY)
  const listRef = useRef<HTMLDivElement>(null)
  const setActiveTab = useAppStore((s) => s.setActiveTab)

  // The address bar is the filter, wearing the group's pill. Another group
  // parked on starts from an empty one.
  const query = useAddressFilter(`group:${group.id}`, {
    label: group.name || 'Unnamed group',
    color: group.color,
    placeholder: "Filter the group's tabs…",
    onKey: (e) => filterKey(e),
    onEnter: () => open(selected),
  })

  useEffect(() => { setSelected(0) }, [group.id])

  const rows = useMemo(() => (query.trim()
    ? fuzzyFilter(query, group.tabs, (t) => [
      { value: t.title, weight: 1 },
      { value: t.comment, weight: 0.9 },
      { value: t.url, weight: 0.6 },
    ])
    : group.tabs), [query, group.tabs])

  useEffect(() => { setSelected(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected, columns])

  const open = (index: number): boolean => {
    const tab = rows[index]
    if (!tab) return false
    setActiveTab(tab.id)
    return true
  }
  const moveBy = (delta: number): void => {
    setSelected((i) => Math.max(0, Math.min(rows.length - 1, i + delta)))
  }

  /** ↑/↓ (in the filter, or on the page without Vim mode): a line of the
   *  layout — the tab above or below, in two columns too. */
  const arrowKey = (key: string): boolean => {
    if (key === 'ArrowDown') moveBy(columns)
    else if (key === 'ArrowUp') moveBy(-columns)
    else if (key === 'PageDown') moveBy(HALF_PAGE_ROWS * columns)
    else if (key === 'PageUp') moveBy(-HALF_PAGE_ROWS * columns)
    else return false
    return true
  }

  /** A key typed in the address bar, the page's filter. */
  const filterKey = (e: AddressFilterKeyEvent): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false
    if (e.key === 'Tab') {
      moveBy(e.shiftKey ? -1 : 1)
      return true
    }
    return arrowKey(e.key)
  }

  /** Enter and c, typed outside the filter. */
  const rowKey = (e: KeyboardEvent): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false
    if (columnsKey(e)) return true
    return keyTokenFromEvent(e) === '<CR>' && open(selected)
  }

  // COMMAND's labels on its rows.
  useHintTargets('group-page', 0, vimMode === 'command' && hintsOn
    ? rows.map((tab, i) => ({ id: hintId(tab.id), name: tab.title || tab.url, activate: () => { open(i) } }))
    : null)
  const hintLabels = useHintLabels()

  // j/k walk the tabs in reading order, one at a time, in two columns too
  // (h/l are the window's history keys).
  usePageKeys({
    intercept: rowKey,
    command: (command) => {
      switch (command) {
        case 'scroll-down': moveBy(1); return true
        case 'scroll-up': moveBy(-1); return true
        case 'half-page-down': moveBy(HALF_PAGE_ROWS * columns); return true
        case 'half-page-up': moveBy(-HALF_PAGE_ROWS * columns); return true
        case 'page-top': setSelected(0); return true
        case 'page-bottom': setSelected(Math.max(rows.length - 1, 0)); return true
        case 'insert-mode':
        case 'focus-input':
          focusAddressFilter()
          return true
      }
      return false
    },
  })

  // Without Vim mode: arrows and Enter, outside the filter.
  // (In Vim's COMMAND the keys come through usePageKeys instead and never
  // get this far.)
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (vimMode || e.defaultPrevented) return
    const target = e.target
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, button, a'))) return
    let handled = rowKey(e)
    if (!handled && !e.metaKey && !e.ctrlKey && !e.altKey) handled = arrowKey(e.key)
    if (handled) e.preventDefault()
  }
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => keyRef.current(e)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const count = group.tabs.length
  const filtered = query.trim() !== ''

  return (
    // The page itself scrolls, its bar at the window's right edge as a web
    // page's is; the header stays put at the top, the rows passing under it.
    <div className="absolute inset-0 z-50 overflow-y-auto bg-background px-8 text-foreground select-none">
      {/* The same space above the header as below the list. */}
      <div className="pb-[max(2rem,6vh)]">
        <div className={cn('mx-auto w-full', columns === 2 ? 'max-w-none' : 'max-w-2xl')}>
          {/* Above the rows' labels (z-10), which pass under it too. */}
          <div className="sticky top-0 z-20 flex min-w-0 items-center gap-3 bg-background pb-4 pt-[max(2rem,6vh)]">
            <div
              data-group-container=""
              style={{ ['--gc' as string]: group.color }}
              className="flex min-w-0 items-center"
            >
              <span
                data-group-pill=""
                className="min-w-0 truncate rounded-xl px-4 py-1.5 text-2xl font-semibold tracking-tight"
              >
                {group.name || 'Unnamed group'}
              </span>
            </div>
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {filtered ? `${rows.length} of ${count}` : count} {count === 1 ? 'tab' : 'tabs'}
            </span>
            <ColumnsSwitch columns={columns} onChange={setColumns} keyFree={columnsKeyFree} vimMode={vimMode} className="ml-auto" />
          </div>
          <div
            ref={listRef}
            className={cn(columns === 2 && rows.length > 0 && 'grid grid-cols-2 content-start gap-x-2')}
          >
            {rows.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {count === 0 ? 'No tabs in this group' : 'No tabs match'}
              </div>
            )}
            {rows.map((tab, idx) => {
              return (
                <div
                  key={tab.id}
                  data-index={idx}
                  onClick={() => open(idx)}
                  onMouseMove={() => { if (selected !== idx) setSelected(idx) }}
                  className={cn(
                    // Scrolled to by the keys, a row stops clear of the
                    // header it would otherwise sit under.
                    'flex min-w-0 scroll-mb-4 scroll-mt-[calc(max(2rem,6vh)+4rem)] cursor-pointer items-center gap-2 rounded-lg px-3 py-2',
                    idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {/* Its label in COMMAND, its number in INSERT: the column
                      and its rule, as the Sidebar's. */}
                  <RowCap mode={vimMode} label={hintLabels.get(hintId(tab.id))} pending={vimPending} index={idx} />
                  <span className="flex w-6 shrink-0 items-center">
                    {tab.favicon ? <TabFavicon favicon={tab.favicon} /> : <Globe size={16} className="text-muted-foreground/60" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {tab.comment && <CommentChip comment={tab.comment} />}
                      <span className="truncate text-sm">{tab.title || tab.url}</span>
                    </div>
                    {tab.url && tab.url !== 'about:blank' && (
                      <div className="truncate text-[10px] text-muted-foreground">{tab.url}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
