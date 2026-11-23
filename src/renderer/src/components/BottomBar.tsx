// The window's bottom bar: the hint bar as part of the window's layout,
// the Toolbar's twin — full width, under the Sidebar and the page, which
// end where it starts. Not a popup over the page (it was one), and not
// always there (it was that too — the owner's word on both: it is away
// until there is something to say, then it shows). It shows what can follow
// a pending prefix (lib/which-key.ts), else a notice (lib/notice.ts).

import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { WhichKeyHints } from './KeyHints'
import type { VimKeymap } from '../lib/vim-keymap'
import { useWhichKey } from '../lib/which-key'
import { clearNotice, useNoticeStore } from '../lib/notice'
import { HintBar } from '@bedware/ui'

const NOTICE_SHOWN_MS = 2600

export function BottomBar({ keymap, pending, hidden }: {
  /** COMMAND's keys; null while Vim isn't up yet. */
  keymap: VimKeymap | null
  pending: string
  /** Cinema mode: no bar at all. */
  hidden: boolean
}) {
  const entries = useWhichKey(keymap, pending)
  const notice = useNoticeStore((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => clearNotice(notice.seq), NOTICE_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [notice])

  if (hidden) return null
  if (entries.length > 0) {
    return (
      <HintBar wrap className="min-h-10">
        <WhichKeyHints pending={pending} entries={entries} />
      </HintBar>
    )
  }
  // A prefix just typed, its entries not up yet (which-key's delay): the
  // notice waits, as it did.
  if (!notice || pending) return null
  return (
    <HintBar>
      <span className="flex min-w-0 items-center gap-1.5 text-foreground">
        <Check size={13} className="shrink-0 text-primary" />
        <span className="shrink-0">{notice.text}</span>
        {notice.detail && <span className="min-w-0 truncate text-muted-foreground">{notice.detail}</span>}
      </span>
    </HintBar>
  )
}
