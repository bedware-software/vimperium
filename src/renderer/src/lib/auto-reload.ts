// Tabs that reload themselves on a timer (Vim's R): which, and how often.
// Main runs the timers (tab-views.ts tabSetAutoReload) and drops a closed
// tab's; a closed tab's entry here just goes stale — ids aren't reused.

import { create } from 'zustand'

export const AUTO_RELOAD_MIN_SECONDS = 1
export const AUTO_RELOAD_MAX_SECONDS = 24 * 60 * 60

export const useAutoReloadStore = create<{ seconds: Record<string, number> }>(() => ({ seconds: {} }))

/** Reload `tabId` every `seconds`; 0 stops. */
export function setAutoReload(tabId: string, seconds: number): void {
  useAutoReloadStore.setState((s) => {
    const next = { ...s.seconds }
    if (seconds > 0) next[tabId] = seconds
    else delete next[tabId]
    return { seconds: next }
  })
  void window.electronAPI.tabSetAutoReload?.(tabId, seconds)
}

/** What was typed for an interval, in seconds: "30", "1.5", "45s", "2m",
 *  "1h". Null for anything else, or outside the limits. */
export function parseAutoReloadInterval(text: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(s|sec|m|min|h)?$/i.exec(text.trim())
  if (!m) return null
  const unit = (m[2] ?? 's').toLowerCase()
  const seconds = Number(m[1].replace(',', '.')) * (unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1)
  if (!(seconds >= AUTO_RELOAD_MIN_SECONDS && seconds <= AUTO_RELOAD_MAX_SECONDS)) return null
  return seconds
}

/** 5 → "5s", 90 → "1.5m", 3600 → "1h": short enough for the button's badge. */
export function autoReloadLabel(seconds: number): string {
  const trim = (n: number): string => String(Math.round(n * 10) / 10)
  if (seconds >= 3600) return `${trim(seconds / 3600)}h`
  if (seconds >= 60) return `${trim(seconds / 60)}m`
  return `${trim(seconds)}s`
}
