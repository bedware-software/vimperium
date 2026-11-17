// Asking where something goes, as a page (components/PlacePage.tsx) in
// place of the popups it was: where a tab or a group moves to
// (vimperium://move), where a link another app handed over opens
// (vimperium://open-link). Each is a tab of its own, as Search Everything
// is — the address bar its filter, the destinations its rows — there while
// you pick and closed once you have, back to where you were.
//
// What's being placed is kept here, not in the tab: the page shown with
// nothing to place (its tab restored at launch) closes itself.

import { create } from 'zustand'
import { useAppStore } from '../store/app-store'
import { MOVE_URL, OPEN_LINK_URL, internalPageOf } from './internal-pages'
import { showPage } from './page-nav'

/** What moves: tabs (one, or the picked ones), or a whole group. */
export type MoveRequest =
  | { kind: 'tabs'; tabIds: string[] }
  | { kind: 'group'; groupId: string }

/** The last request to move something, counted so the same one twice is two. */
export const useMoveRequest = create<{ request: MoveRequest | null; v: number }>(() => ({ request: null, v: 0 }))

/** Shows the page that asks where `request` moves to, typing in its filter. */
export function openMovePage(request: MoveRequest): void {
  if (!useAppStore.getState().getActiveWorkspace()) return
  useMoveRequest.setState((s) => ({ request, v: s.v + 1 }))
  showPage(MOVE_URL)
}

export function clearMoveRequest(): void {
  if (useMoveRequest.getState().request) useMoveRequest.setState({ request: null })
}

interface LinkRequestState {
  /** The link being placed; null with none. */
  url: string | null
  /** Links that came while one was being placed: asked about in turn. */
  queue: string[]
  /** The group you were in when the first one came: where it opens unless
   *  you pick elsewhere (null: the workspace's top level). */
  fromGroupId: string | null
  v: number
}

export const useLinkRequest = create<LinkRequestState>(() => ({ url: null, queue: [], fromGroupId: null, v: 0 }))

function linkPageTabExists(): boolean {
  const w = useAppStore.getState().getActiveWorkspace()
  if (!w) return false
  const isPage = (url: string): boolean => internalPageOf(url) === 'open-link'
  return !!w.tabs?.some((t) => isPage(t.url)) || w.tabGroups.some((g) => g.tabs.some((t) => isPage(t.url)))
}

/** A link another app handed over: asks where it opens. One that comes
 *  while the page is still asking about another waits its turn. */
export function openLinkPage(url: string): void {
  const s = useAppStore.getState()
  if (!s.getActiveWorkspace()) return
  const pending = useLinkRequest.getState()
  if (pending.url && linkPageTabExists()) {
    useLinkRequest.setState({ queue: [...pending.queue, url] })
  } else {
    useLinkRequest.setState({ url, queue: [], fromGroupId: s.activeTabGroupId, v: pending.v + 1 })
  }
  showPage(OPEN_LINK_URL)
}

/** The link asked about is placed (or given up): the next one waiting, if
 *  any, is asked about — the page shown again for it. Call it once the
 *  page's tab is closed. */
export function nextLink(): void {
  const { queue, v } = useLinkRequest.getState()
  const [next, ...rest] = queue
  if (!next) {
    useLinkRequest.setState({ url: null, queue: [] })
    return
  }
  useLinkRequest.setState({ url: next, queue: rest, fromGroupId: useAppStore.getState().activeTabGroupId, v: v + 1 })
  showPage(OPEN_LINK_URL)
}
