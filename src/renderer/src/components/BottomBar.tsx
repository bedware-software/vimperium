// The window's bottom bar: the hint bar as part of the window's layout,
// the Toolbar's twin — full width, under the Sidebar and the page, which
// end where it starts. Not a popup over the page (it was one: the owner
// wants the same bar everywhere, in the layout). It shows, first that
// applies: what can follow a pending prefix (lib/which-key.ts), a notice
// (lib/notice.ts), else COMMAND's main keys on a web page. A page this
// window draws has a hint bar of its own, so there the bar is away unless
// a prefix or a notice needs it.

import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { Hint, HintBar, WhichKeyHints, vimKeyCaps } from './KeyHints'
import type { VimKeymap } from '../lib/vim-keymap'
import type { VimMode } from '../lib/vim-mode'
import { useWhichKey } from '../lib/which-key'
import { clearNotice, useNoticeStore } from '../lib/notice'

const NOTICE_SHOWN_MS = 2600

export function BottomBar({ keymap, mode, pending, webPage, hidden }: {
  /** COMMAND's keys; null while Vim isn't up yet. */
  keymap: VimKeymap | null
  mode: VimMode | null
  pending: string
  /** The tab in front is a site's page: the bar names COMMAND's main keys. */
  webPage: boolean
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
  if (notice && !pending) {
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
  if (!webPage || !keymap || !mode) return null
  const caps = (...commands: string[]): string[] => vimKeyCaps(keymap, ...commands)
  return (
    <HintBar>
      {mode === 'insert' ? (
        <Hint label="Command mode" keys={['Esc']} />
      ) : (
        <>
          <Hint label="Scroll" keys={caps('scroll-down', 'scroll-up')} />
          <Hint label="Go to a link" keys={caps('go')} />
          <Hint label="Find" keys={caps('find-in-page')} />
          <Hint label="Search" keys={caps('search')} />
          <Hint label="Address" keys={caps('focus-url')} />
          <Hint label="New tab" keys={caps('new-tab')} />
          <Hint label="Close tab" keys={caps('close-tab')} />
          <Hint label="Type" keys={caps('insert-mode')} />
          <Hint label="Keys" keys={caps('help')} />
        </>
      )}
    </HintBar>
  )
}
