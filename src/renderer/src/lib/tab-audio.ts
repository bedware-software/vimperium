// Tabs making sound right now, as main reports them (tab-views.ts
// 'audio-state-changed'), and the ones muted here (main only applies it:
// tabSetMuted). A closed tab is never reported silent, so its entries go
// stale — ids aren't reused. Subscribed at import, not in a component:
// main sends only changes, so one missed while nothing is mounted stays wrong.

import { create } from 'zustand'

export const useTabAudioStore = create<{ audible: Record<string, true>; muted: Record<string, true> }>(() => ({ audible: {}, muted: {} }))

export function toggleTabMuted(tabId: string): void {
  const muted = !useTabAudioStore.getState().muted[tabId]
  useTabAudioStore.setState((s) => {
    const next = { ...s.muted }
    if (muted) next[tabId] = true
    else delete next[tabId]
    return { muted: next }
  })
  void window.electronAPI.tabSetMuted?.(tabId, muted)
}

window.electronAPI?.onTabEvent?.((raw) => {
  const evt = raw as { type?: string; tabId?: string; audible?: boolean }
  if (evt.type !== 'audio-state-changed' || !evt.tabId) return
  const tabId = evt.tabId
  useTabAudioStore.setState((s) => {
    if (!!s.audible[tabId] === !!evt.audible) return s
    const next = { ...s.audible }
    if (evt.audible) next[tabId] = true
    else delete next[tabId]
    return { audible: next }
  })
})
