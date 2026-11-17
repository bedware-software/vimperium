// A notice's strip (lib/notice.ts): a line along the bottom of the page
// area, where which-key's strip shows and looking as it does — a popup, so
// it's over the page, shown without taking the keyboard. It goes by itself
// after a moment, and at once while which-key's strip has the place.

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { DetachedWindow, type PopupPlacement } from './DetachedWindow'
import { HintBar } from './KeyHints'
import { clearNotice, useNoticeStore } from '../lib/notice'

const STRIP_HEIGHT = 40
const SHOWN_MS = 2600

export function NoticeStrip({ anchorRef, hidden }: {
  anchorRef: React.RefObject<HTMLElement | null>
  /** Something else has the place (a pending prefix's keys). */
  hidden: boolean
}) {
  const notice = useNoticeStore((s) => s.notice)
  const [box, setBox] = useState<{ placement: PopupPlacement; width: number } | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => clearNotice(notice.seq), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const el = anchorRef.current
    if (!notice || !el) {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    setBox({ placement: { left: Math.round(r.left), top: Math.round(r.bottom - STRIP_HEIGHT) }, width: Math.max(200, Math.round(r.width)) })
  }, [notice, anchorRef])

  if (!notice || !box || hidden) return null
  return (
    <DetachedWindow
      open
      title="Notice"
      width={box.width}
      height={STRIP_HEIGHT}
      resizable={false}
      activate={false}
      placement={box.placement}
      onClose={() => clearNotice(notice.seq)}
    >
      <HintBar className="h-full">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <Check size={13} className="shrink-0 text-primary" />
          <span className="shrink-0">{notice.text}</span>
          {notice.detail && <span className="min-w-0 truncate text-muted-foreground">{notice.detail}</span>}
        </span>
      </HintBar>
    </DetachedWindow>
  )
}
