// The Sidebar's cursor (the arrows move it without showing anything) is
// off the row that's shown: Enter shows the row it's on. Only then is Enter
// a key of the window's — App.tsx binds it while this says so — the rest of
// the time it's the page's, as ever.

import { create } from 'zustand'

/** Enter's command while the cursor is away: show the row it's on. */
export const ROW_GO_COMMAND = 'row-go'

/** Esc's command while rows are picked: none picked, the cursor back on
 *  the row that's shown. */
export const ROW_UNSELECT_COMMAND = 'row-unselect'

export const useSidebarCursorStore = create<{ away: boolean; picked: boolean }>(() => ({ away: false, picked: false }))

/** Rows are picked in the Sidebar (the arrows, Shift+arrows, a click with
 *  Cmd or Shift): one Esc unpicks them — the window's key only then. */
export function setSidebarRowsPicked(picked: boolean): void {
  if (useSidebarCursorStore.getState().picked !== picked) useSidebarCursorStore.setState({ picked })
}

export function sidebarRowsPicked(): boolean {
  return useSidebarCursorStore.getState().picked
}

export function setSidebarCursorAway(away: boolean): void {
  if (useSidebarCursorStore.getState().away !== away) useSidebarCursorStore.setState({ away })
}

export function sidebarCursorAway(): boolean {
  return useSidebarCursorStore.getState().away
}
