import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { VimMode } from '../lib/vim-mode'
import { isSidesEdge, useVimEdge, useVimEdgeEverywhere, useVimEdgeTiming, vimEdgePace, type VimEdge } from '../lib/vim-edge'

interface Props {
  /** Null while Vim mode is off: no edge. */
  mode: VimMode | null
  /** The look, when not the one chosen in Settings (Settings' previews). */
  edge?: VimEdge
  /** The address bar's, shown by default; any other field's only while
   *  Settings asks for it on every field. */
  addressBar?: boolean
  /** Its own pace in seconds, when not Settings' (lib/vim-edge.ts's
   *  vimEdgePace); a constant object, or the pace is made anew each render. */
  pace?: { speed: number; rest: number }
}

/** Vim's mode on the edge of the field it's put in — the address bar,
 *  InputField: INSERT wears a ring in the plate's colours, the way Settings →
 *  Appearance says (.mode-edge in globals.css); COMMAND has no edge, so its
 *  layer isn't drawn and the ring fades as the mode changes. No glow round
 *  the ring either: the glow's box isn't drawn. The field must be positioned
 *  and must not clip what spills past it. */
export function ModeEdge({ mode, edge, addressBar = false, pace: ownPace }: Props) {
  const chosen = useVimEdge()
  const everywhere = useVimEdgeEverywhere()
  const timing = useVimEdgeTiming()
  const look = edge ?? chosen
  const pace = useMemo(() => {
    const { speed, ease } = vimEdgePace(look, (ownPace ?? timing).speed, (ownPace ?? timing).rest)
    return { '--speed': speed, ...(ease ? { '--pass-ease': ease } : {}) } as CSSProperties
  }, [look, timing, ownPace])
  const shown = mode !== null && look !== 'off' && (addressBar || everywhere || edge !== undefined)
  const ref = useRef<HTMLSpanElement>(null)

  // The layer cuts the field's own shape out of itself, so it needs its
  // radius — whatever the field's classes make it.
  useLayoutEffect(() => {
    const el = ref.current
    const field = el?.parentElement
    if (!el || !field) return
    const radius = parseFloat(getComputedStyle(field).borderTopLeftRadius) || 0
    el.style.setProperty('--r', `${radius}px`)
  }, [look, shown])

  if (!shown) return null
  // The ring, a clipping box. A turning look has one mover in it. A comet
  // resting at the sides (an old look) slides strips past instead: a window
  // with the top's and the bottom's in it, then the left end's and the right
  // end's. Keyed by which, so a change of look makes the box anew.
  const ring = isSidesEdge(look)
    ? <i key="ring-strips"><i><i /><i /></i><i /><i /></i>
    : <i key="ring"><i /></i>
  return (
    <span ref={ref} className="mode-edge" data-edge={look} style={pace} aria-hidden="true">
      <span data-for="insert" data-on={mode === 'insert' ? '' : undefined}>{ring}</span>
    </span>
  )
}
