// Search Everything as a page (vimperium://search): f opens it on the kind
// of thing it showed last — tabs, tab groups, workspaces, profiles — and
// picking a result goes there, the page's tab closing behind it.
//
// It has no box of its own: the address bar is its filter
// (lib/address-filter.ts), typing at once when it opens. In the bar ↑/↓ and
// PageUp/PageDown move through the results, Enter opens the selected one,
// Tab flips the scope (this workspace / every one) for tabs and groups;
// Ctrl+C leaves the bar for COMMAND, the query kept, and Esc closes the
// page from there too.
//
// In COMMAND (lib/vim-mode.ts usePageKeys) the scroll keys move the
// selection, Enter opens it, i types in the bar again, m opens the
// selected row's menu, w g t p pick the kind searched (workspaces, groups,
// tabs, profiles — ahead of the keymap's own g… and t… here), Tab flips
// the scope, and Esc closes the page — back to the tab you were
// on. Every result wears a label that picks it (lib/hint-labels.ts), the one
// the Sidebar gives the same tab or group. The kind picked here is the one
// f opens the page on next time; f, typed here, types in the bar again.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, User, Layout, Layers, Globe } from 'lucide-react'
import { useAppStore, saveStateNow } from '../store/app-store'
import type { SearchableItem } from '../store/types'
import { log } from '../lib/log'
import { fuzzyFilter } from '../lib/fuzzy'
import { focusAddressFilter, useAddressFilter, type AddressFilterKeyEvent } from '../lib/address-filter'
import { closePage, closePageTab, useSearchPageRequest, type SearchFilter } from '../lib/page-nav'
import { internalPageOf } from '../lib/internal-pages'
import { useSearchFields } from '../lib/search-fields'
import { SEARCH_FIELD_OPTIONS, type SearchFieldKind } from '../../../shared/search-fields'
import { useHintLabels, useHintTargets, useReservedHintKeys } from '../lib/hint-labels'
import { ColumnsSwitch, usePageColumns, type Columns } from './ColumnsSwitch'
import { EntityIcon, LIST_PAGE_ROOT, LIST_ROW_SCROLL, ListPageHeader, PageScopeSwitch, listBoxClass, listColumnCount } from './ListPage'
import { usePageKeys } from '../lib/vim-mode'
import { keyTokenFromEvent } from '../lib/vim-keymap'
import type { VimKeymap } from '../lib/vim-keymap'
import type { VimMode } from '../lib/vim-mode'
import { TabFavicon } from './TabFavicon'
import { CommentChip } from './CommentChip'
import { GroupPill } from './GroupPill'
import { RowCap } from './KeyHints'
import { openDropdownAsync, type DropdownAction } from './dropdown-protocol'
import { InputDialog } from './InputDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { Kbd, Segmented } from '@bedware/ui'

export interface SearchPageProps {
  /** The page's own tab: picking a result closes it. */
  tabId: string
  windowWorkspaceId: string | null
  /** COMMAND's keys (the window's), for the hints; null for the beat at launch. */
  vimKeymap: VimKeymap | null
  vimMode: VimMode | null
  vimPending: string
  /** Its rows may wear COMMAND's labels: no popup has its own up. */
  hintsOn: boolean
}

const FILTER_TYPES = ['profile', 'workspace', 'tabGroup', 'tab'] as const
type FilterType = SearchFilter

const TYPE_ICONS: Record<FilterType, typeof User> = {
  profile: User,
  workspace: Layout,
  tabGroup: Layers,
  tab: Globe,
}

const TYPE_LABELS: Record<FilterType, string> = {
  profile: 'Profiles',
  workspace: 'Workspaces',
  tabGroup: 'Tab Groups',
  tab: 'Tabs',
}

/** The bar's placeholder: what's searched, and where. */
function placeholderFor(filter: FilterType, scoped: boolean | null): string {
  const what = filter === 'tabGroup' ? 'tab groups' : TYPE_LABELS[filter].toLowerCase()
  if (scoped === null) return `Search ${what}…`
  return `Search ${what} ${scoped ? 'in this workspace' : 'in every workspace'}…`
}

/** Where tab groups / tabs are searched: every workspace or only the one this window shows. */
type SearchScope = 'all' | 'current'

const FILTER_STORAGE_KEY = 'vimperium-search-filter'
const SCOPE_STORAGE_KEY = 'vimperium-search-scope'

/** The filter picked last; tabs at first (a stale "all" too). */
function loadFilter(): FilterType {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if ((FILTER_TYPES as readonly string[]).includes(raw ?? '')) return raw as FilterType
  } catch { /* no storage: the default */ }
  return 'tab'
}

function saveFilter(filter: FilterType): void {
  try { localStorage.setItem(FILTER_STORAGE_KEY, filter) } catch { /* not remembered */ }
}

function loadScope(): SearchScope {
  // The window's own workspace by default: searching tabs/groups usually
  // means "find something in what I'm looking at".
  try {
    return localStorage.getItem(SCOPE_STORAGE_KEY) === 'all' ? 'all' : 'current'
  } catch {
    return 'current'
  }
}

function saveScope(scope: SearchScope): void {
  try { localStorage.setItem(SCOPE_STORAGE_KEY, scope) } catch { /* not remembered */ }
}

// The page is mounted while its tab is the active one: these outlive a
// remount (another tab shown and this one again) — the request already
// answered isn't answered twice, and the page shows the kind it showed. It
// starts at the request there is when the app starts (none), so a search tab
// restored at launch isn't taken for one.
let handledRequest = useSearchPageRequest.getState().v
let shownFilter: FilterType | null = null

/** COMMAND's key for each kind, ahead of the keymap on this page: the
 *  letter it's named by. */
const TYPE_KEYS: Record<FilterType, string> = {
  profile: 'p',
  workspace: 'w',
  tabGroup: 'g',
  tab: 't',
}
const TYPE_KEY_LIST = Object.values(TYPE_KEYS)

/** First in the filter: search tabs by the whole path to them — profile,
 *  workspace, group — and not only by their title and address. */
const HIERARCHY_PREFIX = '>'
/** First too (before or after >): what's typed is searched for as it is —
 *  a substring — not as letters spread through the text. */
const EXACT_PREFIX = '='
const SCOPE_KEY_CAP = 'Tab'
const HALF_PAGE_ROWS = 10

/** Its rows' ids among the window's hint targets: the Sidebar's for a tab
 *  or a group, so one thing wears one label wherever it's listed. */
function hintId(item: SearchableItem): string {
  switch (item.type) {
    case 'tab': return `tab:${item.id}`
    case 'tabGroup': return `group:${item.id}`
    case 'workspace': return `workspace:${item.id}`
    case 'profile': return `profile:${item.id}`
  }
}

/** The theme for the row menu's popup (its own window). */
function readThemeAttrs(): { theme?: string; themeVariant?: string } {
  const root = document.documentElement
  return {
    theme: root.getAttribute('data-theme') ?? undefined,
    themeVariant: root.getAttribute('data-theme-variant') ?? undefined,
  }
}

/** A row menu's follow-up that needs a dialog of its own. */
type RowDialog =
  | { kind: 'rename-workspace'; id: string; name: string }
  | { kind: 'rename-group'; id: string; name: string }
  | { kind: 'delete-workspace'; id: string; name: string; tabCount: number }

/** What a row's menu (m in COMMAND, or a right-click) offers, with a key
 *  each — the Sidebar's letters where it has the same action. */
function rowMenuActions(item: SearchableItem): DropdownAction[] {
  switch (item.type) {
    case 'tab':
      return [
        { id: 'close-tab', label: 'Close Tab', iconName: 'X', key: 'x' },
        { id: 'duplicate-tab', label: 'Duplicate Tab', iconName: 'CopyPlus', key: 'd' },
        { id: 'move-tab', label: 'Move Tab…', iconName: 'FolderInput', key: 'm', divider: 'before' },
      ]
    case 'tabGroup':
      return [
        { id: 'rename-group', label: 'Rename Group…', iconName: 'Pencil', key: 'r' },
        { id: 'close-group', label: 'Close Group', iconName: 'X', key: 'x', destructive: true, divider: 'before' },
      ]
    case 'workspace': {
      // A profile keeps at least one workspace (the profile menu's rule).
      const profile = useAppStore.getState().profiles.find((p) => p.id === item.profileId)
      const last = (profile?.workspaces.length ?? 0) <= 1
      return [
        { id: 'rename-workspace', label: 'Rename Workspace…', iconName: 'Pencil', key: 'r' },
        {
          id: 'delete-workspace',
          label: 'Delete Workspace…',
          iconName: 'Trash2',
          key: 'x',
          destructive: true,
          divider: 'before',
          disabled: last,
          disabledTitle: last ? 'A profile keeps at least one workspace' : undefined,
        },
      ]
    }
    default:
      return []
  }
}

/** Where it is, itself aside: its path's names but its own. */
function pathBefore(item: SearchableItem): string {
  const last = item.pathSegments[item.pathSegments.length - 1]
  const before = last?.type === item.type ? item.pathSegments.slice(0, -1) : item.pathSegments
  return before.map((segment) => segment.label).join(' / ')
}

function SearchBreadcrumb({ item }: { item: SearchableItem }) {
  const visibleUrl = item.url && item.url !== 'about:blank' ? item.url : undefined
  const fullLabel = `${item.path}${visibleUrl ? ` · ${visibleUrl}` : ''}`
  // A group's own row already wears the colour on its label, so the group
  // crumb is only a pill where the label is something else (a tab).
  const pillGroupCrumb = !!item.groupColor && item.type !== 'tabGroup'
  // Where it is, without itself: the row's label already says its name (a
  // workspace's, a group's, a tab's title). The whole path is still what
  // the search goes by, and the tooltip.
  const last = item.pathSegments[item.pathSegments.length - 1]
  const crumbs = last?.type === item.type ? item.pathSegments.slice(0, -1) : item.pathSegments

  return (
    <div className="truncate text-[10px] text-muted-foreground" title={fullLabel}>
      {crumbs.map((segment, index) => (
        <span key={`${segment.type}-${index}`}>
          {index > 0 && <span aria-hidden="true"> / </span>}
          {segment.type === 'tabGroup' && pillGroupCrumb
            ? <GroupPill name={segment.label} />
            : segment.label}
        </span>
      ))}
      {visibleUrl && `${crumbs.length > 0 ? ' · ' : ''}${visibleUrl}`}
    </div>
  )
}

/** A click on the page's buttons and rows leaves the keyboard where it was:
 *  typing in the bar goes on, COMMAND stays COMMAND. */
const keepFocus = (e: React.MouseEvent): void => {
  // Not for what a dialog of its own (another window) bubbles up.
  if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return
  if (!(e.target instanceof HTMLElement && e.target.closest('input, textarea'))) e.preventDefault()
}

export function SearchPage({ tabId, windowWorkspaceId, vimMode, vimPending, hintsOn }: SearchPageProps) {
  const request = useSearchPageRequest()
  const [filter, setFilter] = useState<FilterType>(() =>
    request.v !== handledRequest ? request.filter ?? loadFilter() : shownFilter ?? loadFilter())
  const [scope, setScope] = useState<SearchScope>(loadScope)
  const [selected, setSelected] = useState(0)
  const [rowDialog, setRowDialog] = useState<RowDialog | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pickingRef = useRef(false)
  const rowMenuOpenRef = useRef(false)
  useEffect(() => { shownFilter = filter }, [filter])

  // The scope narrows what lives inside a workspace (tabs, groups) to the
  // window's own — typing or not: "This workspace" means this workspace.
  const scopeApplies = filter === 'tabGroup' || filter === 'tab'
  const scopedToCurrent = scopeApplies && scope === 'current' && !!windowWorkspaceId

  // Read again whenever what's there changes: a title loading, a tab closed
  // from the row menu.
  const profiles = useAppStore((s) => s.profiles)
  const allItems = useMemo(
    // This page's own tab (and another workspace's) is never a result.
    () => useAppStore.getState().getAllSearchableItems().filter((item) => internalPageOf(item.url) !== 'search'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles],
  )

  const inScope = useMemo(
    () => (scopedToCurrent ? allItems.filter((item) => item.workspaceId === windowWorkspaceId) : allItems),
    [allItems, scopedToCurrent, windowWorkspaceId],
  )
  const items = useMemo(() => inScope.filter((item) => item.type === filter), [inScope, filter])

  /** Each kind's count where it's searched, for the chips. */
  const counts = useMemo(() => {
    const out: Record<FilterType, number> = { profile: 0, workspace: 0, tabGroup: 0, tab: 0 }
    for (const item of allItems) {
      const scoped = (item.type === 'tab' || item.type === 'tabGroup') && scope === 'current' && !!windowWorkspaceId
      if (scoped && item.workspaceId !== windowWorkspaceId) continue
      out[item.type]++
    }
    return out
  }, [allItems, scope, windowWorkspaceId])

  // > first in the filter: tabs are searched by everything on the way to
  // them too (below). The bar's pill says so.
  const [wholePath, setWholePath] = useState(false)
  const [exactOnly, setExactOnly] = useState(false)
  const typed = useAddressFilter('search', {
    label: `${TYPE_LABELS[filter]}${wholePath ? ' › whole path' : ''}${exactOnly ? ' › exact' : ''}`,
    placeholder: placeholderFor(filter, scopeApplies && windowWorkspaceId ? scopedToCurrent : null),
    onKey: (e) => barKey(e),
    onEnter: () => openAt(selected),
    onEscape: () => closePage('search'),
  })

  // The markers ahead of the text, in either order: > and =.
  const marks = /^\s*([>=]{1,2})/.exec(typed)?.[1] ?? ''
  const markers = marks[0] === marks[1] ? marks.slice(0, 1) : marks
  const hierarchy = markers.includes(HIERARCHY_PREFIX)
  const exact = markers.includes(EXACT_PREFIX)
  useEffect(() => { setWholePath(hierarchy) }, [hierarchy])
  useEffect(() => { setExactOnly(exact) }, [exact])
  /** What's searched for: the filter's text, the > aside. */
  const query = markers ? typed.trimStart().slice(markers.length).trim() : typed

  const fields = useSearchFields((s) => s.fields)
  const results = useMemo(() => {
    if (!query.trim()) return items.slice(0, 250)
    return fuzzyFilter(query, items, (item) => {
      const address = item.url && item.url !== 'about:blank' ? item.url : undefined
      // By what Settings picked for its kind (shared/search-fields.ts): a
      // tab by what it is — its title, its comment, its address — and not
      // by where it is, unless picked: its profile's, workspace's and
      // group's names brought up too many tabs nobody meant.
      const by = item.type === 'profile' ? null : fields[item.type]
      if (by && !hierarchy) {
        // Each picked field, counting as Settings lists them (the first
        // most). The path has the thing's own name last: without the name
        // picked, only what's before it.
        const value = (id: string): string | undefined => {
          switch (id) {
            case 'name': return item.name
            case 'comment': return item.comment
            case 'url': return address
            case 'path': return by.includes('name') ? item.path : pathBefore(item)
          }
          return undefined
        }
        return SEARCH_FIELD_OPTIONS[item.type as SearchFieldKind]
          .filter((option) => by.includes(option.id))
          .map((option) => ({ value: value(option.id), weight: option.weight }))
      }
      // > first in the filter (and a profile, always): everything. A
      // combined haystack so a query can run across path, address and
      // comment (the path has profile / workspace / group / title).
      const haystack = [item.path, address, item.comment].filter((s): s is string => !!s).join(' ')
      return [
        { value: item.name, weight: 1 },
        { value: item.comment, weight: 0.9 },
        { value: address, weight: 0.5 },
        { value: item.path, weight: 0.7 },
        { value: haystack, weight: 0.5 },
      ]
    }, exact)
  }, [query, items, hierarchy, exact, fields])

  // A request (f, the toolbar's search): the kind shown last, typing at
  // once. One that names its kind (pick-*, when bound) shows that, and it
  // isn't remembered as the one to open on next time.
  // Only a request takes the keyboard: the page shown again any other way
  // (a tab closed and this one picked, a click on its row, launch) leaves
  // COMMAND as it was, so the next keys aren't typed into the filter.
  useEffect(() => {
    if (request.v === handledRequest) return
    handledRequest = request.v
    setFilter(request.filter ?? loadFilter())
    // After the bar has turned into this page's filter (its layout effect,
    // then the toolbar's render) — and past the key that asked.
    const timers = [0, 80].map((ms) => setTimeout(() => {
      if (document.activeElement?.id !== 'url-bar') focusAddressFilter()
    }, ms))
    return () => timers.forEach(clearTimeout)
  }, [request.v, request.filter])

  useEffect(() => { setSelected(0) }, [query, filter, scope])
  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(results.length - 1, 0)))
  }, [results.length])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const moveBy = (delta: number): void => {
    setSelected((i) => Math.max(0, Math.min(results.length - 1, i + delta)))
  }

  const selectFilter = (next: FilterType): void => {
    setFilter(next)
    saveFilter(next)
  }
  // One column or two (the wide layout), as a group's page has.
  const { columns: pickedColumns, setColumns, keyFree: columnsKeyFree, onKey: pageColumnsKey } = usePageColumns('vimperium-search-page-columns')
  // Profiles are few: one column, the switch locked. Workspaces and tab
  // groups are short: the wide layout is as many columns as fit. Tabs'
  // titles are long: two.
  const columnsLocked = filter === 'profile'
  const manyColumns = filter === 'workspace' || filter === 'tabGroup'
  const columns: Columns = columnsLocked ? 1 : pickedColumns
  const columnsKey = (e: KeyboardEvent): boolean => !columnsLocked && pageColumnsKey(e)
  const boxRef = useRef<HTMLDivElement>(null)
  /** How many rows a line of the layout holds now. */
  const perLine = (): number => (columns === 1 ? 1 : listColumnCount(boxRef.current))
  // No result's label starts with a kind's key.
  useReservedHintKeys(TYPE_KEY_LIST)
  // The Sidebar's row says what's searched.
  useEffect(() => {
    useAppStore.getState().updateTabTitle(tabId, `Search Everything: ${TYPE_LABELS[filter]}`)
  }, [tabId, filter])
  const toggleScope = (): void => {
    setScope((prev) => {
      const next = prev === 'all' ? 'current' : 'all'
      saveScope(next)
      return next
    })
  }

  /** A key typed in the bar but Enter and Esc. */
  const barKey = (e: AddressFilterKeyEvent): boolean => {
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey
    // Tab flips the scope (this workspace / every one), as in the pickers;
    // the kinds are COMMAND's keys (TYPE_KEYS), not the bar's.
    if (e.key === 'Tab' && plain) {
      if (scopeApplies) toggleScope()
      return true
    }
    if (!plain || e.shiftKey) return false
    switch (e.key) {
      // A line of the layout: the result above or below, in two columns too.
      case 'ArrowDown': moveBy(perLine()); return true
      case 'ArrowUp': moveBy(-perLine()); return true
      case 'PageDown': moveBy(HALF_PAGE_ROWS * perLine()); return true
      case 'PageUp': moveBy(-HALF_PAGE_ROWS * perLine()); return true
    }
    return false
  }

  /** Goes where the result points; this page's tab closes behind it. */
  const pick = async (item: SearchableItem): Promise<void> => {
    if (pickingRef.current) return
    pickingRef.current = true
    log.action('search:select', { type: item.type, id: item.id, name: item.name })
    const store = useAppStore.getState()
    // In front, back to where the page was opened from; behind the result
    // just shown, only closed (lib/page-nav.ts).
    const closeSelf = (): void => { closePageTab(tabId) }
    const here = !!windowWorkspaceId && item.workspaceId === windowWorkspaceId

    // In this window: show it, then close the page — the closed tab isn't
    // the active one any more, so what's shown stays.
    if (item.type === 'tab' && here) {
      store.setActiveTab(item.id)
      closeSelf()
      return
    }
    const workspace = store.profiles
      .find((p) => p.id === item.profileId)
      ?.workspaces.find((w) => w.id === item.workspaceId)
    if (item.type === 'tabGroup' && here) {
      const group = workspace?.tabGroups.find((g) => g.id === item.tabGroupId)
      const firstTabId = group?.tabs.find((t) => t.id !== tabId)?.id
      if (firstTabId) store.setActiveTab(firstTabId)
      else if (group) store.setActiveGroup(group.id)
      closeSelf()
      return
    }

    // In a window of its own (or this one, brought up): the page closes
    // first, in its workspace — where you were shows again here, a group's
    // page too — so the state saved for that window no longer has it.
    closeSelf()
    try {
      if (item.type === 'profile') {
        const profile = useAppStore.getState().profiles.find((p) => p.id === item.profileId)
        if (!profile || profile.workspaces.length === 0) return
        await saveStateNow()
        // A window of the profile already open: the most recently active
        // one comes up; otherwise its last used workspace (or its first).
        const byId = new Map(profile.workspaces.map((w) => [w.id, w]))
        const openWindows = await window.electronAPI.getOpenWorkspaceWindows()
        const openWs = openWindows.map((entry) => byId.get(entry.workspaceId)).find((w) => w !== undefined)
        if (openWs) {
          window.electronAPI.openWorkspaceWindow(profile.id, openWs.id, openWs.name)
        } else {
          const lastUsedId = await window.electronAPI.getLastUsedWorkspace(profile.id)
          const ws = (lastUsedId && byId.get(lastUsedId)) || profile.workspaces[0]
          window.electronAPI.openWorkspaceWindow(profile.id, ws.id, ws.name)
        }
      } else if (item.type === 'workspace') {
        await saveStateNow()
        window.electronAPI.openWorkspaceWindow(item.profileId, item.workspaceId!, item.name)
      } else if (item.type === 'tabGroup') {
        const group = workspace?.tabGroups.find((g) => g.id === item.tabGroupId)
        await saveStateNow()
        window.electronAPI.openWorkspaceWindow(item.profileId, item.workspaceId!, workspace?.name || item.name, group?.tabs[0]?.id)
      } else {
        await saveStateNow()
        window.electronAPI.openWorkspaceWindow(item.profileId, item.workspaceId!, workspace?.name || item.name, item.id)
      }
    } catch (err) {
      log.warn('search: opening the result failed', { type: item.type, id: item.id, err: String(err) })
    }
  }

  /** Opens the row at `index`; false when there's none. */
  const openAt = (index: number): boolean => {
    const item = results[index]
    if (!item) return false
    void pick(item)
    return true
  }

  // ── The row menu (m in COMMAND, or a right-click) ──
  const runRowAction = (item: SearchableItem, actionId: string | null): void => {
    const s = useAppStore.getState()
    log.action('search:row-menu', { type: item.type, id: item.id, action: actionId })
    switch (actionId) {
      case 'close-tab': s.closeTab(item.id); break
      case 'duplicate-tab': s.duplicateItems([item.id]); break
      case 'move-tab':
        window.dispatchEvent(new CustomEvent('vimperium:open-move-tab', { detail: { tabIds: [item.id] } }))
        break
      case 'close-group': s.closeGroup(item.id); break
      case 'rename-group': setRowDialog({ kind: 'rename-group', id: item.id, name: item.name }); break
      case 'rename-workspace': setRowDialog({ kind: 'rename-workspace', id: item.id, name: item.name }); break
      case 'delete-workspace': {
        const ws = s.profiles.find((p) => p.id === item.profileId)?.workspaces.find((w) => w.id === item.id)
        const tabCount = ws ? (ws.tabs?.length ?? 0) + ws.tabGroups.reduce((n, g) => n + g.tabs.length, 0) : 0
        setRowDialog({ kind: 'delete-workspace', id: item.id, name: item.name, tabCount })
        break
      }
    }
  }

  const openRowMenu = async (item: SearchableItem, at: { x: number; y: number }, keyboard: boolean): Promise<void> => {
    if (rowMenuOpenRef.current) return
    const actions = rowMenuActions(item)
    if (actions.length === 0) return
    rowMenuOpenRef.current = true
    let actionId: string | null = null
    try {
      const result = await openDropdownAsync({
        kind: 'menu',
        position: { x: Math.round(at.x), y: Math.round(at.y) },
        ...readThemeAttrs(),
        header: item.name,
        actions,
        keyboard,
      })
      actionId = result?.type === 'action' ? result.actionId : null
    } catch (err) {
      log.warn('search: row menu failed', { err: String(err) })
    } finally {
      rowMenuOpenRef.current = false
    }
    runRowAction(item, actionId)
  }

  /** The selected row's menu, just under it past its icon. */
  const openSelectedRowMenu = (): void => {
    const item = results[selected]
    if (!item) return
    const rect = listRef.current?.querySelector(`[data-index="${selected}"]`)?.getBoundingClientRect()
    const at = rect ? { x: rect.left + 40, y: rect.bottom } : { x: window.innerWidth / 3, y: window.innerHeight / 4 }
    void openRowMenu(item, at, true)
  }

  // ── Vim COMMAND ──
  // Its rows' labels, picked by the window's keymap (App's useHintKeymap).
  useHintTargets('search-page', 0, vimMode === 'command' && hintsOn
    ? results.map((item) => ({
      id: hintId(item),
      name: item.name || item.url,
      activate: () => { void pick(item) },
    }))
    : null)
  const hintLabels = useHintLabels()

  usePageKeys({
    intercept: (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false
      // Esc closes the page: the tab you were on shows again.
      if (e.key === 'Escape') return closePage('search')
      const token = keyTokenFromEvent(e)
      // w g t p: what's searched. Ahead of the keymap's own g… and t… here.
      const kind = FILTER_TYPES.find((type) => TYPE_KEYS[type] === token)
      if (kind) {
        selectFilter(kind)
        return true
      }
      // c: one column or two.
      if (columnsKey(e)) return true
      // Tab: this workspace or every one.
      if (token === '<Tab>') {
        if (scopeApplies) toggleScope()
        return true
      }
      return token === '<CR>' && openAt(selected)
    },
    command: (command) => {
      switch (command) {
        case 'scroll-down': moveBy(1); return true
        case 'scroll-up': moveBy(-1); return true
        case 'half-page-down': moveBy(HALF_PAGE_ROWS * perLine()); return true
        case 'half-page-up': moveBy(-HALF_PAGE_ROWS * perLine()); return true
        case 'page-top': setSelected(0); return true
        case 'page-bottom': setSelected(Math.max(results.length - 1, 0)); return true
        case 'insert-mode':
        case 'focus-input':
          focusAddressFilter()
          return true
        // The selected result's, not the Sidebar's row's.
        case 'row-menu':
          openSelectedRowMenu()
          return true
      }
      return false
    },
  })

  // Without Vim mode: arrows, Enter and Esc outside the bar. (In Vim's
  // COMMAND they come through usePageKeys instead and never get this far.)
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (vimMode || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
    let handled = true
    if (e.key === 'ArrowDown') moveBy(1)
    else if (e.key === 'ArrowUp') moveBy(-1)
    else if (e.key === 'Enter') handled = openAt(selected)
    else if (e.key === 'Escape') handled = closePage('search')
    else handled = false
    if (handled) e.preventDefault()
  }
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => keyRef.current(e)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // What the row menu's rename and delete open.
  const renaming = rowDialog?.kind === 'rename-workspace' || rowDialog?.kind === 'rename-group' ? rowDialog : null
  const deleting = rowDialog?.kind === 'delete-workspace' ? rowDialog : null

  const TypeIcon = TYPE_ICONS[filter]
  const total = items.length
  const countLabel = query.trim() ? `${results.length}/${total}` : `${total}`

  /** The page's name, with what's searched: its heading and its row in
   *  the Sidebar read the same. */
  const pageTitle = `Search Everything: ${TYPE_LABELS[filter]}`

  return (
    <div
      // The page's frame is the one a group's page has (ListPage.tsx): the
      // page scrolls, the header stays put.
      ref={listRef}
      className={LIST_PAGE_ROOT}
      role="region"
      aria-label={pageTitle}
      onMouseDown={keepFocus}
    >
      {/* Header: the title, then the kinds, the scope and the columns. */}
      <ListPageHeader
        columns={columns}
        title={(
          <>
            <Search size={18} className="shrink-0 text-primary" />
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{pageTitle}</h1>
          </>
        )}
      >
          <Segmented size="sm" tabbable={false}
            label="What to search"
            className="shrink-0"
            value={filter}
            onChange={selectFilter}
            options={FILTER_TYPES.map((type) => {
              const Icon = TYPE_ICONS[type]
              return {
                value: type,
                icon: <Icon size={13} />,
                title: `${TYPE_LABELS[type]} (${TYPE_KEYS[type]} in COMMAND)`,
                label: (
                  <>
                    {TYPE_LABELS[type]}
                    {/* How many there are; of the kind shown, how many of them
                        the filter leaves (11/21). */}
                    <span className="tabular-nums opacity-50">{filter === type ? countLabel : counts[type]}</span>
                    {/* Its key, while the keys are COMMAND's. */}
                    {vimMode === 'command' && <Kbd on="button">{TYPE_KEYS[type]}</Kbd>}
                  </>
                ),
              }
            })}
          />
          {scopeApplies && windowWorkspaceId && (
            <PageScopeSwitch
              on={scope === 'current'}
              label={scope === 'current' ? 'This workspace' : 'All workspaces'}
              onToggle={toggleScope}
              title={`Search this workspace or every one (${SCOPE_KEY_CAP})`}
              className="ml-auto"
            />
          )}
          <ColumnsSwitch
            columns={columns}
            onChange={setColumns}
            keyFree={columnsKeyFree}
            many={manyColumns}
            locked={columnsLocked}
            vimMode={vimMode}
            className={scopeApplies && windowWorkspaceId ? 'ml-2' : 'ml-auto'}
          />
      </ListPageHeader>

      {/* The results: the same padding above and below, scrolled or not. */}
      <div>
        <div ref={boxRef} className={listBoxClass(columns, true, manyColumns)} role="listbox" aria-label={TYPE_LABELS[filter]}>
          {results.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
              {query.trim() ? `Nothing matches “${query.trim()}”` : `No ${TYPE_LABELS[filter].toLowerCase()} here`}
            </p>
          )}
          {results.map((item, idx) => {
            const label = hintLabels.get(hintId(item))
            return (
              <div
                key={item.id}
                data-index={idx}
                role="option"
                aria-selected={idx === selected}
                data-group-container={item.groupColor ? '' : undefined}
                style={item.groupColor ? { ['--gc' as string]: item.groupColor } : undefined}
                onClick={() => { void pick(item) }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setSelected(idx)
                  void openRowMenu(item, { x: e.clientX, y: e.clientY }, false)
                }}
                onMouseMove={() => { if (selected !== idx) setSelected(idx) }}
                className={`relative flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 ${LIST_ROW_SCROLL} ${
                  idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
              >
                {/* Its label in COMMAND, its number in INSERT: the column and
                    its rule, as the Sidebar's. */}
                <RowCap mode={vimMode} label={hintsOn ? label : undefined} pending={vimPending} index={idx} />
                <span className="relative flex w-6 shrink-0 items-center">
                  {item.type === 'tab' ? (
                    <>
                      {item.groupColor && (
                        <span
                          aria-hidden="true"
                          className="absolute -left-1 h-4 w-0.5"
                          style={{ backgroundColor: 'var(--gc-resolved)' }}
                        />
                      )}
                      <TabFavicon favicon={item.favicon} />
                    </>
                  ) : (
                    // Its place's colour of the mode's gradient down the
                    // list; a group keeps its own colour.
                    <EntityIcon
                      icon={TypeIcon}
                      mode={vimMode}
                      index={idx}
                      count={results.length}
                      style={item.type === 'tabGroup' && item.groupColor ? { color: 'var(--gc-resolved)' } : undefined}
                    />
                  )}
                </span>
                {/* Single-cell grid: a profile's path is just its name, so it
                    has no breadcrumb — the invisible strut holds the row at
                    the height of a title and a breadcrumb all the same. */}
                <div className="grid min-w-0 flex-1 grid-cols-1">
                  {item.type === 'profile' && (
                    <div aria-hidden="true" className="invisible col-start-1 row-start-1">
                      <div className="text-sm">&nbsp;</div>
                      <div className="text-[10px]">&nbsp;</div>
                    </div>
                  )}
                  <div className="col-start-1 row-start-1 min-w-0 self-center">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {item.comment && <CommentChip comment={item.comment} />}
                      {item.type === 'tabGroup' && item.groupColor ? (
                        <GroupPill name={item.name} title={item.name} className="min-w-0 truncate text-sm" />
                      ) : (
                        <span className="min-w-title-stub flex-1 truncate text-sm" title={item.name}>
                          {item.name || item.url}
                        </span>
                      )}
                    </div>
                    {item.type !== 'profile' && <SearchBreadcrumb item={item} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <InputDialog
        open={renaming !== null}
        title={renaming?.kind === 'rename-group' ? 'Rename Group' : 'Rename Workspace'}
        placeholder={renaming?.kind === 'rename-group' ? 'Group name' : 'New workspace name'}
        defaultValue={renaming?.name ?? ''}
        confirmLabel="Rename"
        onConfirm={(name) => {
          if (renaming?.kind === 'rename-group') useAppStore.getState().renameTabGroup(renaming.id, name)
          else if (renaming) useAppStore.getState().renameWorkspace(renaming.id, name)
          log.action('search:rename', { kind: renaming?.kind, id: renaming?.id, name })
          setRowDialog(null)
        }}
        onCancel={() => setRowDialog(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete workspace "${deleting?.name ?? ''}"?`}
        message={`This will permanently delete ${deleting?.tabCount ?? 0} tab${deleting?.tabCount === 1 ? '' : 's'}. The workspace's window will be closed.`}
        onConfirm={() => {
          const target = deleting
          setRowDialog(null)
          if (!target) return
          log.action('search:delete-workspace', { id: target.id, name: target.name })
          // As the profile menu's Delete does: its window first, then the
          // workspace itself.
          void (async () => {
            try {
              await window.electronAPI.closeWorkspaceWindows([target.id])
              useAppStore.getState().removeWorkspace(target.id)
              await saveStateNow()
            } catch (err) {
              log.warn('search: deleting the workspace failed', { id: target.id, err: String(err) })
            }
          })()
        }}
        onCancel={() => setRowDialog(null)}
      />
    </div>
  )
}
