// What a form's Vim keys (lib/vim-form.ts) draw: each control's
// label, vimium-style, at its top-left corner — the part typed so far lit,
// the ones it no longer fits faded — and the hints for the control under
// the cursor, for the form's hint bar.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RowHint, vimKeyCaps } from './KeyHints'
import { useVimFormSnapshot, type VimFormController } from '../lib/vim-form'
import type { VimMode } from '../lib/vim-mode'
import type { VimKeymap } from '../lib/vim-keymap'
import { Hint } from '@bedware/ui'

interface Spot {
  label: string
  left: number
  top: number
}

// `scrolled` are in the scroller's content coordinates, drawn in a layer inside it.
interface Spots {
  fixed: Spot[]
  scrolled: Spot[]
  scroller: HTMLElement | null
}

const NO_SPOTS: Spots = { fixed: [], scrolled: [], scroller: null }

function sameList(a: readonly Spot[], b: readonly Spot[]): boolean {
  return a.length === b.length && a.every((s, i) => s.label === b[i].label && s.left === b[i].left && s.top === b[i].top)
}

/** The labels, over the form, in COMMAND — none while a list or the
 *  filter's results are open over it. The scroller it portals into must be
 *  positioned (`relative`). */
export function VimFormLabels({ form, labels, mode, pending }: {
  form: VimFormController
  /** Label i for the form's labelled control i (usePopupHints). */
  labels: readonly string[]
  mode: VimMode | null
  pending?: string
}) {
  const snapshot = useVimFormSnapshot(form)
  const shown = mode === 'command' && !snapshot.overlayOpen && labels.length > 0
  const layerRef = useRef<HTMLDivElement>(null)
  const [spots, setSpots] = useState<Spots>(NO_SPOTS)

  useLayoutEffect(() => {
    if (!shown) {
      setSpots(NO_SPOTS)
      return
    }
    const layer = layerRef.current
    const doc = layer?.ownerDocument
    const win = doc?.defaultView
    if (!doc || !win) return
    let frame: number | null = null
    const measure = (): void => {
      frame = null
      const next: Spots = { fixed: [], scrolled: [], scroller: null }
      form.labelTargets().forEach((el, i) => {
        const label = labels[i]
        if (!label || !el.isConnected) return
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        const scroller = form.clipFor(el) as HTMLElement | null
        if (scroller) {
          // Placed in the scrolling content, so scrolling moves it with its
          // control: a label re-placed on scroll events trails a smooth
          // scroll, which the compositor runs ahead of them.
          const box = scroller.getBoundingClientRect()
          next.scroller = scroller
          next.scrolled.push({
            label,
            left: Math.round(rect.left - box.left - scroller.clientLeft + scroller.scrollLeft - 6),
            top: Math.round(rect.top - box.top - scroller.clientTop + scroller.scrollTop - 7),
          })
          return
        }
        if (rect.bottom <= 0 || rect.top >= win.innerHeight || rect.right <= 0 || rect.left >= win.innerWidth) return
        next.fixed.push({ label, left: Math.round(Math.max(0, rect.left - 6)), top: Math.round(Math.max(0, rect.top - 7)) })
      })
      setSpots((prev) => (
        prev.scroller === next.scroller && sameList(prev.fixed, next.fixed) && sameList(prev.scrolled, next.scrolled) ? prev : next
      ))
    }
    const schedule = (): void => {
      if (frame === null) frame = win.requestAnimationFrame(measure)
    }
    measure()
    const stopLayout = form.subscribeLayout(schedule)
    // For a control in a scrolling box of its own inside the form; the
    // form's own scrolling changes no spot.
    doc.addEventListener('scroll', schedule, true)
    win.addEventListener('resize', schedule)
    return () => {
      stopLayout()
      doc.removeEventListener('scroll', schedule, true)
      win.removeEventListener('resize', schedule)
      if (frame !== null && !win.closed) win.cancelAnimationFrame(frame)
    }
  }, [form, shown, labels])

  const draw = (list: readonly Spot[]): ReactNode => list.map((spot) => (
    <div key={spot.label} className="absolute" style={{ left: spot.left, top: spot.top }}>
      <RowHint mode="command" label={spot.label} pending={pending} />
    </div>
  ))

  return (
    <>
      <div ref={layerRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
        {shown && draw(spots.fixed)}
      </div>
      {shown && spots.scroller?.isConnected && createPortal(
        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 h-0 w-0">
          {draw(spots.scrolled)}
        </div>,
        spots.scroller,
      )}
    </>
  )
}

/** The hint bar's hints for the control under the cursor: what h / l,
 *  Enter and a row's keys do to it. What can't be taken back (a danger
 *  button, a row's Remove) is pressed with dd, never Enter. */
export function VimFormCursorHints({ form, keymap }: { form: VimFormController; keymap: VimKeymap | null }) {
  const { kind, cells, danger, cellDanger } = useVimFormSnapshot(form)
  const caps = (...commands: string[]): string[] => vimKeyCaps(keymap, ...commands)
  switch (kind) {
    case 'toggle':
      return <Hint label="Switch" keys={caps('toggle', 'value-prev', 'value-next')} />
    case 'segment':
      return <Hint label="Choose" keys={caps('value-prev', 'value-next')} />
    case 'select':
      return (
        <>
          <Hint label="Choose" keys={caps('value-prev', 'value-next')} />
          <Hint label="List" keys={caps('activate')} />
        </>
      )
    case 'range':
      return (
        <>
          <Hint label="Slide" keys={caps('value-prev', 'value-next')} />
          <Hint label="By ten" keys={caps('value-prev-big', 'value-next-big')} />
        </>
      )
    case 'text':
      return <Hint label="Type" keys={caps('insert-mode')} />
    case 'button':
      return <Hint label="Press" keys={caps(danger ? 'row-remove' : 'activate')} />
    case 'row':
      return (
        <>
          {cells.length > 1 && <Hint label="Button" keys={caps('value-prev', 'value-next')} />}
          {!danger && !cellDanger && <Hint label="Press" keys={caps('activate')} />}
          {(cells.includes('remove') || cellDanger) && <Hint label="Remove" keys={caps('row-remove')} />}
          {cells.includes('copy') && <Hint label="Copy" keys={caps('row-copy')} />}
          {cells.includes('copy-password') && <Hint label="Password" keys={caps('row-copy-password')} />}
          {cells.includes('edit') && <Hint label="Edit" keys={caps('row-edit')} />}
        </>
      )
    default:
      return null
  }
}
