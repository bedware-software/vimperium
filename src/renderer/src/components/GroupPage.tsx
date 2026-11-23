// The page area while parked on a tab group (a click on its header, or its
// label in COMMAND): the group's tabs, the split picker's look laid out on
// the page, in one column or two (components/ColumnsSwitch.tsx: the switch
// by the count, or c in COMMAND; remembered) — two being the wide layout,
// the page's whole width.
// Enter on the selected one, or a click, shows that tab.
//
// Its header: the group's pill, as the Sidebar's, and after it the badge
// with how many tabs it has — how many of them are left, 11/21, while
// something narrows them. Under it, where Search Everything has its kinds:
// the sites most of its tabs are on, up to four — a click on one (its
// digit in COMMAND) keeps that site's tabs only, again shows them all.
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
import { EntityIcon, LIST_PAGE_ROOT, LIST_ROW_SCROLL, ListPageHeader, listBoxClass } from './ListPage'
import { fuzzyFilter } from '../lib/fuzzy'
import { focusAddressFilter, useAddressFilter, type AddressFilterKeyEvent } from '../lib/address-filter'
import { keyTokenFromEvent } from '../lib/vim-keymap'
import { usePageKeys, type VimMode } from '../lib/vim-mode'
import type { VimKeymap } from '../lib/vim-keymap'
import { cn } from '../lib/utils'
import { Kbd } from '@bedware/ui'

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

/** How many sites the header offers. */
const TOP_SITES = 4

/** The site a tab is on: its address's host, www. aside; null for an
 *  address that has none (a blank tab, a page of the browser's own). */
function siteOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

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

  // The sites most of its tabs are on: the most tabs first, the group's
  // order among equals.
  const sites = useMemo(() => {
    const found = new Map<string, { site: string; count: number; favicon: string }>()
    for (const tab of group.tabs) {
      const site = siteOf(tab.url)
      if (!site) continue
      const entry = found.get(site)
      if (entry) {
        entry.count++
        if (!entry.favicon && tab.favicon) entry.favicon = tab.favicon
      } else {
        found.set(site, { site, count: 1, favicon: tab.favicon || '' })
      }
    }
    return [...found.values()].sort((a, b) => b.count - a.count).slice(0, TOP_SITES)
  }, [group.tabs])

  // The one whose tabs are kept; none once its last tab is gone.
  const [pickedSite, setPickedSite] = useState<string | null>(null)
  const site = pickedSite !== null && sites.some((s) => s.site === pickedSite) ? pickedSite : null
  const toggleSite = (next: string): void => setPickedSite(site === next ? null : next)

  useEffect(() => {
    setSelected(0)
    setPickedSite(null)
  }, [group.id])

  const rows = useMemo(() => {
    const onSite = site ? group.tabs.filter((t) => siteOf(t.url) === site) : group.tabs
    return query.trim()
      ? fuzzyFilter(query, onSite, (t) => [
        { value: t.title, weight: 1 },
        { value: t.comment, weight: 0.9 },
        { value: t.url, weight: 0.6 },
      ])
      : onSite
  }, [query, site, group.tabs])

  useEffect(() => { setSelected(0) }, [query, site])
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

  /** Enter, c and the sites' digits, typed outside the filter. */
  const rowKey = (e: KeyboardEvent): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false
    if (columnsKey(e)) return true
    const digit = /^[1-9]$/.test(e.key) ? sites[Number(e.key) - 1] : undefined
    if (digit) {
      toggleSite(digit.site)
      return true
    }
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
  const filtered = query.trim() !== '' || site !== null

  return (
    // The page's frame is the one Search Everything has (ListPage.tsx): the
    // page scrolls, the header stays put, its controls on a row of their own.
    <div className={LIST_PAGE_ROOT}>
      <ListPageHeader
        columns={columns}
        title={(
          <div
            data-group-container=""
            style={{ ['--gc' as string]: group.color }}
            className="flex min-w-0 items-center gap-2"
          >
            <h1 data-group-pill="" className="min-w-0 truncate rounded-lg px-3 py-0.5 text-lg font-semibold tracking-tight">
              {group.name || 'Unnamed group'}
            </h1>
            {/* How many tabs, in the group's colour as the Sidebar's badge;
                after the pill, so the pill stays put as it widens. */}
            <span
              data-group-badge=""
              title={filtered ? `${rows.length} of ${count} ${count === 1 ? 'tab' : 'tabs'}` : `${count} ${count === 1 ? 'tab' : 'tabs'}`}
              className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums leading-none"
            >
              {filtered ? `${rows.length}/${count}` : count}
            </span>
          </div>
        )}
      >
        {/* The sites most of its tabs are on, as Search Everything's kinds:
            one picked keeps that site's tabs, picked again shows them all. */}
        {sites.length > 0 && (
          <div className="flex h-8 min-w-0 items-center rounded-md bg-secondary p-0.5" role="group" aria-label="Sites">
            {sites.map((entry, i) => {
              const active = site === entry.site
              return (
                <button
                  key={entry.site}
                  type="button"
                  aria-pressed={active}
                  tabIndex={-1}
                  onClick={() => toggleSite(entry.site)}
                  title={`${entry.site}: ${entry.count} ${entry.count === 1 ? 'tab' : 'tabs'} (${i + 1} in COMMAND)`}
                  className={cn(
                    'flex h-7 min-w-0 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {entry.favicon
                    ? <TabFavicon favicon={entry.favicon} className="h-[13px] w-[13px] shrink-0 rounded-sm" />
                    : <Globe size={13} className="shrink-0" />}
                  <span className="min-w-0 truncate">{entry.site}</span>
                  <span className="tabular-nums opacity-50">{entry.count}</span>
                  {/* Its key, while the keys are COMMAND's. */}
                  {vimMode === 'command' && <Kbd className="font-mono text-[10px]">{i + 1}</Kbd>}
                </button>
              )
            })}
          </div>
        )}
        <ColumnsSwitch columns={columns} onChange={setColumns} keyFree={columnsKeyFree} vimMode={vimMode} className="ml-auto" />
      </ListPageHeader>
      <div>
        <div>
          <div ref={listRef} className={listBoxClass(columns, rows.length > 0)}>
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
                    LIST_ROW_SCROLL,
                    'flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2',
                    idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {/* Its label in COMMAND, its number in INSERT: the column
                      and its rule, as the Sidebar's. */}
                  <RowCap mode={vimMode} label={hintLabels.get(hintId(tab.id))} pending={vimPending} index={idx} />
                  <span className="flex w-6 shrink-0 items-center">
                    {tab.favicon ? <TabFavicon favicon={tab.favicon} /> : <EntityIcon icon={Globe} mode={vimMode} index={idx} count={rows.length} />}
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
