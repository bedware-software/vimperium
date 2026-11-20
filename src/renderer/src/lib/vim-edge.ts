// How a text field's edge shows Vim's mode — the address bar, and the
// keyboard popups' boxes (InputField) too when asked for: a light that keeps moving round the
// edge in the mode's colours, COMMAND cool and INSERT green, crossfading as
// the mode changes. A Settings → Appearance choice while Vim mode is on; the
// fields read it through useVimEdge, so every field follows a change at
// once, popups' included (they render from this window). The looks are
// .mode-edge's [data-edge] rules in globals.css; ModeEdge draws them.

import { useSyncExternalStore } from 'react'

export type VimEdge = 'comet-rail' | 'comet-rail-sides' | 'comet' | 'comet-sides' | 'aurora' | 'living' | 'glint' | 'ember' | 'off'

export const VIM_EDGES: readonly { id: VimEdge; label: string; hint: string }[] = [
  { id: 'comet-rail', label: 'Comet on rail', hint: 'A comet runs round the edge over a faint ring in the mode\'s colours.' },
  { id: 'comet-rail-sides', label: 'Comet on rail, resting at the sides', hint: 'A small comet with a long tail over the ring: it rests at the left and right ends and passes quickly along the top and the bottom.' },
  { id: 'comet', label: 'Comet', hint: 'A lone comet runs round the edge; the rest of it stays dark.' },
  { id: 'comet-sides', label: 'Comet, resting at the sides', hint: 'The small comet alone: it rests at the left and right ends and passes quickly along the top and the bottom.' },
  { id: 'aurora', label: 'Aurora', hint: 'The mode\'s three colours slowly circle the edge, with a soft halo.' },
  { id: 'living', label: 'Living border', hint: 'The colours drift in place while the glow slowly swells and fades.' },
  { id: 'glint', label: 'Glint', hint: 'A ring in the mode\'s colours with a glint passing along it now and then.' },
  { id: 'ember', label: 'Ember', hint: 'A still ring with a glow, in the orange Go marks its pick with; green while typing.' },
  { id: 'off', label: 'Off', hint: 'A plain edge: the mode\'s key cap alone shows the mode.' },
] as const

export const DEFAULT_VIM_EDGE: VimEdge = 'comet-rail'

export function normalizeVimEdge(value: string | undefined): VimEdge {
  return VIM_EDGES.some((v) => v.id === value) ? (value as VimEdge) : DEFAULT_VIM_EDGE
}

/** Where it shows: the address bar alone (the default), or every field
 *  that shows the mode — the popups' boxes, Find, the address editor. */
export const DEFAULT_VIM_EDGE_EVERYWHERE = false

/** Its pace, in seconds: how long a lap of the light takes (the turning
 *  looks' turn, the drifting ones' drift), and how long a comet resting at
 *  the sides stays in each end — on top of the lap, so the run between the
 *  ends keeps its speed whatever the rest. Settings' sliders; main keeps
 *  them in the same range (settings-store.ts). */
export const VIM_EDGE_SPEED = { min: 4, max: 30, step: 1, default: 10 } as const
export const VIM_EDGE_REST = { min: 0, max: 10, step: 0.5, default: 3 } as const

function seconds(value: unknown, range: { min: number; max: number; default: number }): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : range.default
}
export const normalizeVimEdgeSpeed = (value: unknown): number => seconds(value, VIM_EDGE_SPEED)
export const normalizeVimEdgeRest = (value: unknown): number => seconds(value, VIM_EDGE_REST)

/** The glow's size, in percent of the designed one (.mode-edge's --halo):
 *  0 is the ring alone. Main keeps the same range (settings-store.ts). */
export const VIM_EDGE_GLOW = { min: 0, max: 200, step: 10, default: 100 } as const
export const normalizeVimEdgeGlow = (value: unknown): number => seconds(value, VIM_EDGE_GLOW)

export function isSidesEdge(edge: VimEdge): boolean {
  return edge.endsWith('-sides')
}

/** cubic-bezier(x1, 0, x2, 1) at time t. */
function eased(x1: number, x2: number, t: number): number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  let lo = 0, hi = 1, m = t
  for (let i = 0; i < 30; i++) {
    m = (lo + hi) / 2
    if (((ax * m + bx) * m + cx) * m < t) lo = m
    else hi = m
  }
  return (3 - 2 * m) * m * m
}

/** What .mode-edge is told of the pace (globals.css): --speed, the period —
 *  for a comet resting at the sides the lap and its two rests — and for
 *  that comet --pass-ease, each half period's timing: still for the rest,
 *  then the eased run to the other end. A linear() of the run's curve,
 *  since a keyframe's own offsets can't follow a setting. */
export function vimEdgePace(edge: VimEdge, speed: number, rest: number): { speed: string; ease?: string } {
  if (!isSidesEdge(edge) || rest <= 0) return { speed: `${speed}s` }
  const half = speed / 2 + rest
  const hold = rest / half
  const pct = (v: number): string => `${+(v * 100).toFixed(3)}%`
  const stops = [`0 ${pct(hold)}`]
  const steps = 48
  for (let i = 1; i < steps; i++) {
    stops.push(`${+eased(0.7, 0.3, i / steps).toFixed(4)} ${pct(hold + (1 - hold) * (i / steps))}`)
  }
  return { speed: `${half * 2}s`, ease: `linear(0, ${stops.join(', ')}, 1)` }
}

let current: VimEdge = DEFAULT_VIM_EDGE
let everywhere = DEFAULT_VIM_EDGE_EVERYWHERE
let timing: { speed: number; rest: number } = { speed: VIM_EDGE_SPEED.default, rest: VIM_EDGE_REST.default }
let glow: number = VIM_EDGE_GLOW.default
const listeners = new Set<() => void>()

export function applyVimEdge(edge: VimEdge, onEveryField: boolean, speed?: number, rest?: number, glowSize?: number): void {
  const nextSpeed = normalizeVimEdgeSpeed(speed)
  const nextRest = normalizeVimEdgeRest(rest)
  const nextGlow = normalizeVimEdgeGlow(glowSize)
  if (edge === current && onEveryField === everywhere && nextSpeed === timing.speed && nextRest === timing.rest && nextGlow === glow) return
  current = edge
  everywhere = onEveryField
  glow = nextGlow
  if (nextSpeed !== timing.speed || nextRest !== timing.rest) timing = { speed: nextSpeed, rest: nextRest }
  listeners.forEach((listener) => listener())
}

// The window's in use or not, from main (the renderer's own focus goes to
// the page's view whenever the page has the keys): the edge stands still in
// a window that isn't, shown by data-window-inactive on the root.
if (typeof window !== 'undefined') {
  window.electronAPI?.onWindowActive?.((active) => {
    document.documentElement.toggleAttribute('data-window-inactive', !active)
  })
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useVimEdge(): VimEdge {
  return useSyncExternalStore(subscribe, () => current)
}

export function useVimEdgeEverywhere(): boolean {
  return useSyncExternalStore(subscribe, () => everywhere)
}

export function useVimEdgeGlow(): number {
  return useSyncExternalStore(subscribe, () => glow)
}

export function useVimEdgeTiming(): { speed: number; rest: number } {
  return useSyncExternalStore(subscribe, () => timing)
}
