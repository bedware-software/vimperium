// The Sidebar's cursor (the arrows move it without showing anything) is
// off the row that's shown: Enter shows the row it's on. Only then is Enter
// a key of the window's — App.tsx binds it while this says so — the rest of
// the time it's the page's, as ever.

import { create } from 'zustand'

/** Enter's command while the cursor is away: show the row it's on. */
export const ROW_GO_COMMAND = 'row-go'

export const useSidebarCursorStore = create<{ away: boolean }>(() => ({ away: false }))

export function setSidebarCursorAway(away: boolean): void {
  if (useSidebarCursorStore.getState().away !== away) useSidebarCursorStore.setState({ away })
}

export function sidebarCursorAway(): boolean {
  return useSidebarCursorStore.getState().away
}
