// Going to an address the way the address bar's Enter does, for the places
// that take one without it: Vim mode's p / P (the clipboard) and the address
// editor (components/UrlEditor.tsx).

import { useAppStore } from '../store/app-store'
import { normalizeURL } from './url'
import { isInternalUrl } from './internal-pages'
import { log } from './log'
import { resolveBangs } from './bangs'
import { openBangGroup } from './multi-bang'

/** Opens `text` — a URL, or a search for anything else — in the active tab
 *  or a new one. Only the first line counts. False when there's nothing to
 *  open. */
export function openAddress(text: string, inNewTab: boolean, why: string): boolean {
  const line = (text.split(/\r?\n/)[0] ?? '').trim()
  // Several bangs, or a label of them: a group of searches.
  const many = line ? resolveBangs(line) : null
  if (many && many.bangs.length > 1) {
    openBangGroup(many, null)
    return true
  }
  const url = normalizeURL(line)
  if (!url) return false
  const s = useAppStore.getState()
  const tab = s.getActiveTab()
  log.action('open-address', { why, inNewTab, hasTab: !!tab })
  // Parked on a tab group there's no page to replace: open a tab instead.
  if (inNewTab || !tab) {
    if (!s.activeWorkspaceId || isInternalUrl(url)) return false
    s.addTabNearActive(s.activeWorkspaceId, url, true)
    return true
  }
  // Internal pages (vimperium://…) have no view to navigate: going to or from
  // one is a store change, and WebviewPanel drops or creates the view.
  if (isInternalUrl(url) || isInternalUrl(tab.url)) {
    s.retargetTab(tab.id, url)
    return true
  }
  window.electronAPI.tabNavigate?.(tab.id, url)
  s.updateTabUrl(tab.id, url)
  return true
}

/** `url` with the last number in it (past the site: its path, query or
 *  fragment) `by` more — page 3 to page 4, <C-a> and <C-x>. Leading zeros
 *  keep their width (007 → 008); never below 0. Null with no number there,
 *  or nothing to change. */
export function stepUrlNumber(url: string, by: number): string | null {
  let rest: string
  let site: string
  try {
    const parsed = new URL(url)
    site = `${parsed.protocol}//${parsed.host}`
    if (!url.startsWith(site)) return null
    rest = url.slice(site.length)
  } catch {
    return null
  }
  const numbers = [...rest.matchAll(/\d+/g)]
  const last = numbers[numbers.length - 1]
  if (!last || last.index === undefined) return null
  const value = Math.max(0, Number(last[0]) + by)
  if (!Number.isSafeInteger(value)) return null
  const written = String(value).padStart(last[0].startsWith('0') ? last[0].length : 0, '0')
  if (written === last[0]) return null
  return site + rest.slice(0, last.index) + written + rest.slice(last.index + last[0].length)
}
