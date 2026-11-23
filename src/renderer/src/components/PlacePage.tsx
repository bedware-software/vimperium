// Where something goes, as a page (lib/place-page.ts): where a tab, the
// picked tabs or a group move to (vimperium://move), where a link another
// app handed over opens (vimperium://open-link). Search Everything's
// frame and keys: the address bar is its filter, typing at once; ↑/↓ and
// Enter there pick a destination, Tab flips the scope; its kinds — a
// workspace's top level, or a tab group — are the page's filter (w g in
// COMMAND), one kind only for a group, which goes to a workspace; Ctrl+C leaves the
// bar for COMMAND, where the scroll keys move the selection, every row
// wears a label that picks it, i types again and c switches the columns.
// Esc gives up from either — the page's tab closes, back to where you were.
//
// A move follows what moved to its new home; Shift+Enter moves it and
// stays. A link opens in front, always; ⌘↵ (Ctrl+Enter) passes it on to
// another browser — the one chosen before; the other browsers are a kind
// of the filter too (b), to pick one outright.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderInput, Layers, Layout, Link, Globe, CornerDownLeft } from 'lucide-react'
import { useAppStore, saveStateNow } from '../store/app-store'
import type { OtherBrowser } from '../App'
import { log } from '../lib/log'
import { fuzzyFilter } from '../lib/fuzzy'
import { focusAddressFilter, useAddressFilter, type AddressFilterKeyEvent } from '../lib/address-filter'
import { closePageTab } from '../lib/page-nav'
import { clearMoveRequest, nextLink, useLinkRequest, useMoveRequest } from '../lib/place-page'
import { buildDestinationItems, decodeTarget, encodeTarget } from '../lib/tab-destinations'
import { useHintLabels, useHintTargets, useReservedHintKeys } from '../lib/hint-labels'
import { usePageKeys } from '../lib/vim-mode'
import type { VimMode } from '../lib/vim-mode'
import { keyTokenFromEvent } from '../lib/vim-keymap'
import { ColumnsSwitch, PageSegmented, usePageColumns } from './ColumnsSwitch'
import { EntityIcon, LIST_PAGE_ROOT, LIST_ROW_SCROLL, ListPageHeader, PageScopeSwitch, listBoxClass, listColumnCount } from './ListPage'
import { GroupPill } from './GroupPill'
import { RowCap } from './KeyHints'
import { Button, Kbd } from '@bedware/ui'

export interface PlacePageProps {
  page: 'move' | 'open-link'
  /** The page's own tab: placing (or giving up) closes it. */
  tabId: string
  windowWorkspaceId: string | null
  vimMode: VimMode | null
  vimPending: string
  /** Its rows may wear COMMAND's labels: no popup has its own up. */
  hintsOn: boolean
}

interface Row {
  id: string
  label: string
  /** A group's colour: the label is its pill. */
  color?: string
  /** Where it is, itself aside. */
  crumbs: string[]
  /** All of it, for the filter. */
  pathText: string
  note?: string
  kind: 'workspace' | 'group' | 'browser'
}

type Scope = 'current' | 'all'

/** What kind of place the rows are: a workspace (its top level) or a tab
 *  group — the page's filter, as Search Everything's kinds are — or, for
 *  a link, another browser. A group only ever goes to a workspace: its
 *  filter has the one kind. */
type PlaceKind = 'workspace' | 'group' | 'browser'
/** A tab's kinds; a link's have the other browsers too — the third place
 *  it can go. */
const KINDS: readonly PlaceKind[] = ['workspace', 'group']
const LINK_KINDS: readonly PlaceKind[] = ['workspace', 'group', 'browser']
const KIND_LABELS: Record<PlaceKind, string> = { workspace: 'Workspaces', group: 'Tab Groups', browser: 'Other Browsers' }
const KIND_ICONS: Record<PlaceKind, typeof Layout> = { workspace: Layout, group: Layers, browser: Globe }
/** COMMAND's key for each, ahead of the keymap here: Search Everything's. */
const KIND_KEYS: Record<PlaceKind, string> = { workspace: 'w', group: 'g', browser: 'b' }
const KIND_KEY_LIST = Object.values(KIND_KEYS)

const isMac = navigator.platform.includes('Mac')
// Passing a link on to another browser (main/other-browser.ts): macOS and
// Windows.
const canPassOn = isMac || navigator.platform.startsWith('Win')
const passOnKeys = isMac ? '⌘↵' : 'Ctrl+Enter'
const HALF_PAGE_ROWS = 10

/** The scope picked last, remembered apart for a tab's move, a group's and
 *  a link: a move usually heads somewhere else (every workspace at first),
 *  a link usually opens where you are. */
type ScopeFor = 'tabs' | 'group' | 'link'
function loadScope(what: ScopeFor): Scope {
  const fallback: Scope = what === 'link' ? 'current' : 'all'
  try {
    const saved = localStorage.getItem(`vimperium-place-scope-${what}`)
    return saved === 'all' || saved === 'current' ? saved : fallback
  } catch {
    return fallback
  }
}
function saveScope(what: ScopeFor, scope: Scope): void {
  try { localStorage.setItem(`vimperium-place-scope-${what}`, scope) } catch { /* not remembered */ }
}

// The page is mounted while its tab is the active one: the request already
// answered isn't taken for a new one when it's shown again.
let handledMove = useMoveRequest.getState().v
let handledLink = useLinkRequest.getState().v

/** A click on the page leaves the keyboard where it was. */
const keepFocus = (e: React.MouseEvent): void => {
  if (!(e.target instanceof HTMLElement && e.target.closest('input, textarea'))) e.preventDefault()
}

export function PlacePage({ page, tabId, windowWorkspaceId, vimMode, vimPending, hintsOn }: PlacePageProps) {
  const profiles = useAppStore((s) => s.profiles)
  const move = useMoveRequest()
  const link = useLinkRequest()
  const request = page === 'move' ? move.request : null
  const url = page === 'open-link' ? link.url : null
  const requestV = page === 'move' ? move.v : link.v
  const has = page === 'move' ? request !== null : url !== null

  const scopeFor: ScopeFor = page === 'open-link' ? 'link' : request?.kind === 'group' ? 'group' : 'tabs'
  const [scope, setScope] = useState<Scope>(() => loadScope(scopeFor))
  // Another thing asked about (a group after a tab): its own.
  useEffect(() => { setScope(loadScope(scopeFor)) }, [scopeFor])
  const [selected, setSelected] = useState(0)
  // A tab usually goes into a group; a link opens where you were — in that
  // group, or at the workspace's top level.
  const [kind, setKind] = useState<PlaceKind>(() =>
    page === 'move' ? (move.request?.kind === 'group' ? 'workspace' : 'group') : link.fromGroupId ? 'group' : 'workspace')
  // The browser ⌘↵ passes the link on to, once chosen; and, while the rows
  // are browsers to choose from, those.
  const [otherBrowser, setOtherBrowser] = useState<OtherBrowser | null>(null)
  const [browsers, setBrowsers] = useState<OtherBrowser[]>([])
  // The one ⌘↵ tried that couldn't open the link: another is to be chosen.
  const [failedBrowser, setFailedBrowser] = useState<OtherBrowser | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const closedRef = useRef(false)

  const closeSelf = (): void => {
    if (closedRef.current) return
    closedRef.current = true
    closePageTab(tabId)
  }

  // Nothing to place (the tab restored at launch, the request answered
  // elsewhere): the page has nothing to ask.
  useEffect(() => {
    if (!has) closeSelf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has])

  const windowProfileId = useMemo(
    () => profiles.find((p) => p.workspaces.some((w) => w.id === windowWorkspaceId))?.id ?? null,
    [profiles, windowWorkspaceId],
  )

  // What's moving: the tabs with where each is, or the group with its workspace.
  const movingTabs = useMemo(() => {
    if (request?.kind !== 'tabs') return []
    const out: Array<{ title: string; workspaceId: string; groupId: string | null }> = []
    for (const id of request.tabIds) {
      search: for (const p of profiles) {
        for (const w of p.workspaces) {
          const loose = w.tabs?.find((t) => t.id === id)
          if (loose) {
            out.push({ title: loose.title || loose.url, workspaceId: w.id, groupId: null })
            break search
          }
          for (const g of w.tabGroups) {
            const t = g.tabs.find((x) => x.id === id)
            if (t) {
              out.push({ title: t.title || t.url, workspaceId: w.id, groupId: g.id })
              break search
            }
          }
        }
      }
    }
    return out
  }, [request, profiles])
  const movingGroup = useMemo(() => {
    if (request?.kind !== 'group') return null
    for (const p of profiles) {
      for (const w of p.workspaces) {
        const group = w.tabGroups.find((g) => g.id === request.groupId)
        if (group) return { group, workspaceId: w.id }
      }
    }
    return null
  }, [request, profiles])

  const allRows = useMemo((): Row[] => {
    // A group goes to a workspace: every one but its own.
    if (request?.kind === 'group') {
      const out: Row[] = []
      for (const p of profiles) {
        if (scope === 'current' && windowProfileId && p.id !== windowProfileId) continue
        for (const w of p.workspaces) {
          if (w.id === movingGroup?.workspaceId) continue
          const tabCount = (w.tabs?.length ?? 0) + w.tabGroups.reduce((n, g) => n + g.tabs.length, 0)
          out.push({
            id: encodeTarget(w.id, null),
            label: w.name,
            crumbs: [p.name],
            pathText: `${p.name} / ${w.name}`,
            note: `${tabCount} tabs`,
            kind: 'workspace',
          })
        }
      }
      return out
    }
    // A tab, or a link, goes to a workspace's top level or into a group.
    // A link can go on to another browser too.
    const browserRows: Row[] = page === 'open-link'
      ? browsers.map((b) => ({ id: `browser:${b.id}`, label: b.name, crumbs: [], pathText: '', kind: 'browser' as const }))
      : []
    let items = buildDestinationItems(profiles, scope, windowWorkspaceId)
    // Where every moving tab already is isn't somewhere to move them.
    const sources = new Set(movingTabs.map((t) => encodeTarget(t.workspaceId, t.groupId)))
    if (sources.size === 1) items = items.filter((item) => !sources.has(item.id))
    return [...items.map((item) => {
      const path = (item.path ?? []).map((segment) => segment.label)
      return {
        id: item.id,
        label: item.label,
        color: item.color,
        crumbs: path.slice(0, -1),
        pathText: path.join(' / '),
        note: item.trailingNote,
        kind: decodeTarget(item.id).groupId ? 'group' as const : 'workspace' as const,
      }
    }), ...browserRows]
  }, [page, browsers, request, profiles, scope, windowProfileId, windowWorkspaceId, movingGroup, movingTabs])

  // The kinds there are to pick from: one for a group, none for browsers.
  const kinds: readonly PlaceKind[] = request?.kind === 'group'
    ? ['workspace']
    : page === 'open-link' && canPassOn ? LINK_KINDS : KINDS
  const shownKind: PlaceKind = kinds.includes(kind) ? kind : 'workspace'
  const rows = useMemo(
    () => allRows.filter((row) => row.kind === shownKind),
    [allRows, shownKind],
  )
  const kindCounts = useMemo(() => {
    const out: Record<PlaceKind, number> = { workspace: 0, group: 0, browser: 0 }
    for (const row of allRows) out[row.kind]++
    return out
  }, [allRows])
  useReservedHintKeys(KIND_KEY_LIST)

  const tabCount = request?.kind === 'tabs' ? request.tabIds.length : 0
  const heading = page === 'open-link'
    ? 'Open Link'
    : request?.kind === 'group' ? 'Move Group' : tabCount > 1 ? `Move ${tabCount} Tabs` : 'Move Tab'
  const scopeLabels = request?.kind === 'group'
    ? { current: 'This profile', all: 'All profiles' }
    : { current: 'This workspace', all: 'All workspaces' }
  const scopeShown = shownKind !== 'browser' && (request?.kind === 'group' ? !!windowProfileId : !!windowWorkspaceId)

  const typed = useAddressFilter(page, has ? {
    label: heading,
    placeholder: page === 'open-link' ? 'Open the link in…' : request?.kind === 'group' ? 'Move the group to…' : tabCount > 1 ? 'Move the tabs to…' : 'Move the tab to…',
    onKey: (e) => barKey(e),
    onEnter: (e) => enter(e),
    onEscape: () => { giveUp(); return true },
  } : null)
  const query = typed.trim()

  const results = useMemo(() => {
    if (!query) return rows
    return fuzzyFilter(query, rows, (row) => [
      { value: row.label, weight: 1 },
      { value: row.pathText, weight: 0.6 },
    ])
  }, [query, rows])

  // A request: starts over, typing at once. The page shown again any other
  // way leaves the keys where they were.
  useEffect(() => {
    const handled = page === 'move' ? handledMove : handledLink
    if (requestV === handled) return
    if (page === 'move') handledMove = requestV
    else handledLink = requestV
    setFailedBrowser(null)
    setKind(page === 'move'
      ? (useMoveRequest.getState().request?.kind === 'group' ? 'workspace' : 'group')
      : useLinkRequest.getState().fromGroupId ? 'group' : 'workspace')
    const timers = [0, 80].map((ms) => setTimeout(() => {
      if (document.activeElement?.id !== 'url-bar') focusAddressFilter()
    }, ms))
    return () => timers.forEach(clearTimeout)
  }, [page, requestV])

  useEffect(() => {
    if (page !== 'open-link' || !canPassOn) return
    let live = true
    window.electronAPI.otherBrowserGet().then((browser) => {
      if (live) setOtherBrowser(browser as OtherBrowser | null)
    }).catch((err) => log.warn('other browser: load failed', err))
    window.electronAPI.otherBrowserList().then((list) => {
      if (live) setBrowsers(list)
    }).catch((err) => log.warn('other browser: list failed', err))
    return () => { live = false }
  }, [page, requestV])

  // A link opens where you were unless you pick elsewhere: that group (or
  // the workspace's top level) is the row selected at first.
  const homeId = page === 'open-link' && windowWorkspaceId
    ? encodeTarget(windowWorkspaceId, link.fromGroupId)
    : null
  useEffect(() => {
    const at = !query && homeId ? results.findIndex((row) => row.id === homeId) : -1
    setSelected(Math.max(at, 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, requestV, homeId, shownKind])
  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(results.length - 1, 0)))
  }, [results.length])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const { columns, setColumns, keyFree: columnsKeyFree, onKey: columnsKey } = usePageColumns('vimperium-place-page-columns')
  const perLine = (): number => (columns === 1 ? 1 : listColumnCount(boxRef.current))
  const moveBy = (delta: number): void => {
    setSelected((i) => Math.max(0, Math.min(results.length - 1, i + delta)))
  }
  const toggleScope = (): void => {
    if (!scopeShown) return
    const next: Scope = scope === 'all' ? 'current' : 'all'
    setScope(next)
    saveScope(scopeFor, next)
  }

  // The Sidebar's row says what's asked.
  useEffect(() => {
    useAppStore.getState().updateTabTitle(tabId, heading)
  }, [tabId, heading])

  /** Esc: nothing is placed and the page closes — the next link waiting
   *  is asked about. */
  const giveUp = (): void => {
    log.action('place:cancel', { page })
    if (page === 'move') clearMoveRequest()
    closeSelf()
    if (page === 'open-link') nextLink()
  }

  /** ⌘↵ / Ctrl+Enter: the link goes to another browser — `pick`, or the one
   *  chosen before; with none yet (or one that failed) the filter turns to
   *  the browsers there are. */
  const passOn = async (pick?: OtherBrowser): Promise<void> => {
    if (!url || !canPassOn) return
    try {
      const result = await window.electronAPI.otherBrowserOpen(url, pick) as { opened: boolean; browsers: OtherBrowser[]; failed?: OtherBrowser }
      if (result.opened) {
        log.action('place:pass-on', { browser: pick?.id ?? null })
        closeSelf()
        nextLink()
        return
      }
      // None chosen yet, or the chosen one couldn't: the browsers to pick from.
      setBrowsers(result.browsers)
      setFailedBrowser(result.failed ?? null)
      setKind('browser')
    } catch (err) {
      log.warn('other browser: open failed', err)
    }
  }

  /** Puts it in `row`. `background`: a move that stays where you are. */
  const place = async (row: Row, background: boolean): Promise<void> => {
    if (busyRef.current) return
    if (row.kind === 'browser') {
      const pick = browsers.find((b) => `browser:${b.id}` === row.id)
      if (pick) void passOn(pick)
      return
    }
    busyRef.current = true
    try {
      const { workspaceId, groupId } = decodeTarget(row.id)
      const store = useAppStore.getState()
      let dest: { profileId: string; name: string } | null = null
      for (const p of store.profiles) {
        const w = p.workspaces.find((x) => x.id === workspaceId)
        if (w) {
          dest = { profileId: p.id, name: w.name }
          break
        }
      }
      const here = workspaceId === windowWorkspaceId
      log.action('place', { page, workspaceId, groupId, background })

      if (page === 'move' && request) {
        // A move keeps the tabs' ids: the first is the one to show there.
        let shownTabId: string | undefined
        if (request.kind === 'tabs') {
          for (const id of request.tabIds) store.moveTabAcross(id, workspaceId, groupId)
          shownTabId = request.tabIds[0]
        } else {
          shownTabId = movingGroup?.group.tabs[0]?.id
          store.moveGroupAcross(request.groupId, workspaceId)
        }
        clearMoveRequest()
        if (background || !dest) {
          closeSelf()
          return
        }
        // In this window: what moved shows, then the page closes behind it.
        if (here) {
          if (shownTabId) useAppStore.getState().setActiveTab(shownTabId)
          closeSelf()
          return
        }
        // In a window of its own: the page closes first, so the state saved
        // for that window has what moved and not this page.
        closeSelf()
        await saveStateNow()
        void window.electronAPI.openWorkspaceWindow(dest.profileId, workspaceId, dest.name, shownTabId)
        return
      }

      if (page === 'open-link' && url) {
        // A link handed over always lands in front: here at once, in
        // another workspace's window by asking that window for it.
        const newTabId = groupId ? store.addTab(groupId, url, here) : store.addUngroupedTab(workspaceId, url, here)
        closeSelf()
        if (!here && dest) {
          await saveStateNow()
          void window.electronAPI.openWorkspaceWindow(dest.profileId, workspaceId, dest.name, newTabId)
        }
        nextLink()
      }
    } catch (err) {
      log.warn('place: failed', { page, err: String(err) })
    } finally {
      busyRef.current = false
    }
  }

  /** Enter, in the bar or out of it; false with no row to take it. */
  const enter = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean => {
    if (page === 'open-link' && canPassOn && (e.ctrlKey || (isMac && e.metaKey))) {
      void passOn()
      return true
    }
    const row = results[selected]
    // Nothing matches: Enter does nothing rather than open what's typed.
    if (!row) return true
    void place(row, page === 'move' && e.shiftKey)
    return true
  }

  /** A key typed in the bar but Enter and Esc. */
  const barKey = (e: AddressFilterKeyEvent): boolean => {
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey
    if (e.key === 'Tab' && plain) {
      toggleScope()
      return true
    }
    if (!plain || e.shiftKey) return false
    switch (e.key) {
      case 'ArrowDown': moveBy(perLine()); return true
      case 'ArrowUp': moveBy(-perLine()); return true
      case 'PageDown': moveBy(HALF_PAGE_ROWS * perLine()); return true
      case 'PageUp': moveBy(-HALF_PAGE_ROWS * perLine()); return true
    }
    return false
  }

  // ── Vim COMMAND ──
  useHintTargets('place-page', 0, vimMode === 'command' && hintsOn
    ? results.map((row) => ({ id: `place:${row.id}`, name: row.label, activate: () => { void place(row, false) } }))
    : null)
  const hintLabels = useHintLabels()

  usePageKeys({
    intercept: (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return false
      if (e.key === 'Enter') return enter(e)
      if (e.shiftKey) return false
      if (e.key === 'Escape') {
        giveUp()
        return true
      }
      // w g: the kind of place. Ahead of the keymap's own g… here.
      const token = keyTokenFromEvent(e)
      const picked = kinds.find((k) => KIND_KEYS[k] === token)
      if (picked) {
        setKind(picked)
        return true
      }
      if (columnsKey(e)) return true
      if (token === '<Tab>') {
        toggleScope()
        return true
      }
      return false
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
      }
      return false
    },
  })

  // Outside the bar: ⌘↵ / Ctrl+Enter (COMMAND leaves those chords alone),
  // and, without Vim mode, the arrows, Enter and Esc.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (e.defaultPrevented) return
    const target = e.target
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
    let handled = true
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handled = page === 'open-link' && enter(e)
    else if (vimMode || e.metaKey || e.ctrlKey || e.altKey) handled = false
    else if (e.key === 'ArrowDown') moveBy(1)
    else if (e.key === 'ArrowUp') moveBy(-1)
    else if (e.key === 'Enter') enter(e)
    else if (e.key === 'Escape') giveUp()
    else if (e.key === 'Tab') toggleScope()
    else handled = false
    if (handled) e.preventDefault()
  }
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => keyRef.current(e)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!has) return null

  const HeadIcon = page === 'open-link' ? Link : FolderInput
  const countLabel = query ? `${results.length}/${rows.length}` : `${rows.length}`
  const enterCap = <CornerDownLeft size={11} strokeWidth={2.5} />
  const subject = page === 'open-link'
      ? <>Opening <span className="font-medium text-foreground">{url}</span></>
      : request?.kind === 'group'
        ? <>Moving group <span className="font-medium text-foreground">{movingGroup?.group.name ?? ''}</span></>
        : tabCount > 1
          ? <>Moving <span className="font-medium text-foreground">{tabCount} tabs</span></>
          : <>Moving <span className="font-medium text-foreground">{movingTabs[0]?.title ?? ''}</span></>

  return (
    <div ref={listRef} className={LIST_PAGE_ROOT} role="region" aria-label={heading} onMouseDown={keepFocus}>
      <ListPageHeader
        columns={columns}
        title={(
          <>
            <HeadIcon size={18} className="shrink-0 text-primary" />
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{heading}</h1>
            {/* What's being placed. */}
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{subject}</span>
          </>
        )}
      >
        {/* The kind of place, as Search Everything's kinds: the one shown
            says how many there are, and how many the filter leaves. */}
        {kinds.length > 0 && (
          <PageSegmented
            label="Where to"
            className="shrink-0"
            value={shownKind}
            onChange={setKind}
            options={kinds.map((k) => {
              const Icon = KIND_ICONS[k]
              return {
                value: k,
                icon: <Icon size={13} />,
                title: `${KIND_LABELS[k]} (${KIND_KEYS[k]} in COMMAND)`,
                label: (
                  <>
                    {KIND_LABELS[k]}
                    <span className="tabular-nums opacity-50">{shownKind === k ? countLabel : kindCounts[k]}</span>
                    {vimMode === 'command' && kinds.length > 1 && <Kbd on="button">{KIND_KEYS[k]}</Kbd>}
                  </>
                ),
              }
            })}
          />
        )}
        {/* What Enter does, and Shift+Enter: said in full. */}
        <div className="ml-auto flex shrink-0 items-center gap-3 px-2 text-xs text-muted-foreground">
          {shownKind === 'browser' ? (
            <span className="flex items-center gap-1" title={`The browser picked is remembered for ${passOnKeys}; Settings → General changes it`}>
              {failedBrowser ? `${failedBrowser.name} couldn't open it — open in another` : 'Open in that browser'}
              <Kbd className="flex items-center font-mono text-[10px]">{enterCap}</Kbd>
            </span>
          ) : page === 'move' ? (
            <>
              <span className="flex items-center gap-1" title="Enter moves it and shows it in its new place">
                Move and go there <Kbd className="flex items-center font-mono text-[10px]">{enterCap}</Kbd>
              </span>
              <span className="flex items-center gap-1" title="Shift+Enter moves it and leaves you on the tab you were on">
                Move and stay here <Kbd className="flex items-center gap-0.5 font-mono text-[10px]">⇧{enterCap}</Kbd>
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1">Open it there <Kbd className="flex items-center font-mono text-[10px]">{enterCap}</Kbd></span>
          )}
        </div>
        {page === 'open-link' && shownKind !== 'browser' && canPassOn && (
          <Button
            variant="ghost"
            tabIndex={-1}
            icon={<Globe size={13} />}
            keys={<span className="flex items-center gap-0.5">{isMac ? '⌘' : 'Ctrl+'}{enterCap}</span>}
            onClick={() => { void passOn() }}
            title={`Pass the link on to another browser (${passOnKeys})`}
            className="shrink-0"
          >
            {otherBrowser ? `Open in ${otherBrowser.name}` : 'Other browser'}
          </Button>
        )}
        {scopeShown && (
          <PageScopeSwitch
            on={scope === 'current'}
            label={scopeLabels[scope]}
            onToggle={toggleScope}
            title="Only where you are, or everywhere (Tab)"
          />
        )}
        <ColumnsSwitch columns={columns} onChange={setColumns} keyFree={columnsKeyFree} many vimMode={vimMode} className="ml-2" />
      </ListPageHeader>

      <div>
        <div ref={boxRef} className={listBoxClass(columns, true, true)} role="listbox" aria-label={heading}>
          {results.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
              {query
                ? `Nothing matches “${query}”`
                : shownKind === 'browser' ? 'No other browser is installed' : 'Nowhere else to put it'}
            </p>
          )}
          {results.map((row, idx) => (
            <div
              key={row.id}
              data-index={idx}
              role="option"
              aria-selected={idx === selected}
              data-group-container={row.color ? '' : undefined}
              style={row.color ? { ['--gc' as string]: row.color } : undefined}
              onClick={(e) => { void place(row, page === 'move' && e.shiftKey) }}
              onMouseMove={() => { if (selected !== idx) setSelected(idx) }}
              className={`relative flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 ${LIST_ROW_SCROLL} ${
                idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              }`}
            >
              <RowCap mode={vimMode} label={hintsOn ? hintLabels.get(`place:${row.id}`) : undefined} pending={vimPending} index={idx} />
              <span className="flex w-6 shrink-0 items-center">
                <EntityIcon
                  icon={row.kind === 'group' ? Layers : row.kind === 'browser' ? Globe : Layout}
                  mode={vimMode}
                  index={idx}
                  count={results.length}
                  style={row.color ? { color: 'var(--gc-resolved)' } : undefined}
                />
              </span>
              {/* Single-cell grid: a row with no breadcrumb is as tall as one with. */}
              <div className="grid min-w-0 flex-1 grid-cols-1">
                <div aria-hidden="true" className="invisible col-start-1 row-start-1">
                  <div className="text-sm">&nbsp;</div>
                  <div className="text-[10px]">&nbsp;</div>
                </div>
                <div className="col-start-1 row-start-1 min-w-0 self-center">
                  {row.color ? (
                    <GroupPill name={row.label} title={row.label} className="block w-fit max-w-full truncate text-sm" />
                  ) : (
                    <div className="truncate text-sm" title={row.label}>{row.label}</div>
                  )}
                  {row.crumbs.length > 0 && (
                    <div className="truncate text-[10px] text-muted-foreground" title={row.pathText}>{row.crumbs.join(' / ')}</div>
                  )}
                </div>
              </div>
              {row.note && <span className="shrink-0 text-[10px] text-muted-foreground">{row.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
