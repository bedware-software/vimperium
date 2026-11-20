// A notice: a line that says something just happened where nothing on the
// page shows it (a page put on the Bookshelf from the keys) — up for a
// moment in the window's bottom bar (components/BottomBar.tsx), which-key's
// place and look. One at a time: the next one takes the last one's place.

import { create } from 'zustand'

export interface Notice {
  /** What happened ("Added to the Bookshelf"). */
  text: string
  /** What it happened to (the page's title), dimmed after the text. */
  detail?: string
  /** Counts up with each notice, so the same one twice shows twice. */
  seq: number
}

export const useNoticeStore = create<{ notice: Notice | null }>(() => ({ notice: null }))

/** Show `text` (and `detail`) for a moment. */
export function showNotice(text: string, detail?: string): void {
  useNoticeStore.setState((s) => ({ notice: { text, detail, seq: (s.notice?.seq ?? 0) + 1 } }))
}

export function clearNotice(seq: number): void {
  useNoticeStore.setState((s) => (s.notice?.seq === seq ? { notice: null } : s))
}
