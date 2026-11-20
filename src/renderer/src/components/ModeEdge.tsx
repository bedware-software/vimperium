import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { VimMode } from '../lib/vim-mode'
import { isSidesEdge, useVimEdge, useVimEdgeEverywhere, useVimEdgeGlow, useVimEdgeTiming, vimEdgePace, type VimEdge } from '../lib/vim-edge'

interface Props {
  /** Null while Vim mode is off: no edge. */
  mode: VimMode | null
  /** The look, when not the one chosen in Settings (Settings' previews). */
  edge?: VimEdge
  /** The address bar's, shown by default; any other field's only while
   *  Settings asks for it on every field. */
  addressBar?: boolean
}

/** Vim's mode as a light moving round the edge of the field it's put in —
 *  the address bar, InputField — in the mode's colours, the way Settings →
 *  Appearance says (.mode-edge in globals.css). The field must be
 *  positioned and must not clip what spills past it. A layer per mode, both
 *  running; the mode's layer shows, the change crossfading. */
export function ModeEdge({ mode, edge, addressBar = false }: Props) {
  const chosen = useVimEdge()
  const everywhere = useVimEdgeEverywhere()
  const timing = useVimEdgeTiming()
  const look = edge ?? chosen
  // The pace, from Settings: the period, and a resting comet's timing.
  const glow = useVimEdgeGlow()
  const pace = useMemo(() => {
    const { speed, ease } = vimEdgePace(look, timing.speed, timing.rest)
    return { '--speed': speed, '--halo': glow / 100, ...(ease ? { '--pass-ease': ease } : {}) } as CSSProperties
  }, [look, timing, glow])
  const shown = mode !== null && look !== 'off' && (addressBar || everywhere || edge !== undefined)
  const ref = useRef<HTMLSpanElement>(null)

  // The layers cut the field's own shape out of themselves, so they need
  // its radius — whatever the field's classes make it.
  useLayoutEffect(() => {
    const el = ref.current
    const field = el?.parentElement
    if (!el || !field) return
    const radius = parseFloat(getComputedStyle(field).borderTopLeftRadius) || 0
    el.style.setProperty('--r', `${radius}px`)
  }, [look, shown])

  if (!shown) return null
  // The ring and the glow, each a clipping box. A turning look has one mover
  // in it. A comet resting at the sides slides strips past instead: a
  // window with the top's and the bottom's in it, then the left end's and
  // the right end's. Keyed by which, so a change of look makes the boxes
  // anew and the strips start together.
  const strips = isSidesEdge(look)
  const box = (key: string) => strips
    ? <i key={`${key}-strips`}><i><i /><i /></i><i /><i /></i>
    : <i key={key}><i /></i>
  return (
    <span ref={ref} className="mode-edge" data-edge={look} style={pace} aria-hidden="true">
      {(['command', 'insert'] as const).map((layer) => (
        <span key={layer} data-for={layer} data-on={mode === layer ? '' : undefined}>
          {box('ring')}
          {box('glow')}
        </span>
      ))}
    </span>
  )
}
