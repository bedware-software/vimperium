// What the pages that list rows in the page area share — a group's page,
// Search Everything — so they look and move alike: the page itself scrolls,
// its bar at the window's right edge and its room always kept (no row or
// header shifts as the bar comes and goes); the header stays put at the
// top, the rows passing under it — a title's row, then a row of the page's
// controls with the columns' switch at its end, both the list's width
// (ColumnsSwitch.tsx' pageWidthClass), so their edges are in one line. And
// the rows' icons: one colour each, the list's icons together running
// through the mode's colours from the first row to the last — the ones the
// light round the address bar's edge has.

import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { pageWidthClass, type Columns } from './ColumnsSwitch'
import type { VimMode } from '../lib/vim-mode'
import { cn } from '../lib/utils'

/** The page's root: the scroller. */
export const LIST_PAGE_ROOT = 'absolute inset-0 z-50 overflow-y-auto [scrollbar-gutter:stable] bg-background text-foreground select-none'

/** On a row: scrolled to by the keys, it stops clear of the header it would
 *  otherwise sit under (the header's height, and a little air). */
export const LIST_ROW_SCROLL = 'scroll-mb-4 scroll-mt-[7.75rem]'

/** The list's box under the header: the page's width, the same padding
 *  above and below; a grid in two columns. */
export function listBoxClass(columns: Columns, grid = true): string {
  return cn('mx-auto w-full px-4 py-4', pageWidthClass(columns), grid && columns === 2 && 'grid grid-cols-2 content-start gap-x-2')
}

/** The header: `title` (an icon and a heading, a group's pill) on the first
 *  row, the page's controls on the second. Above the rows' labels (z-10),
 *  which pass under it too. */
export function ListPageHeader({ columns, title, children }: {
  columns: Columns
  title: ReactNode
  children: ReactNode
}) {
  const width = pageWidthClass(columns)
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background">
      <div className={cn('mx-auto mb-3 mt-5 flex h-8 w-full min-w-0 items-center gap-3 px-4', width)}>{title}</div>
      <div className={cn('mx-auto mb-4 flex h-8 w-full items-center gap-1.5 whitespace-nowrap px-4', width)}>{children}</div>
    </div>
  )
}

/** Where `at` (0 at the list's first row, 1 at its last) falls in the
 *  mode's three colours. */
function gradientColour(mode: VimMode, at: number): string {
  const t = Math.min(1, Math.max(0, at))
  const [from, to, share] = t < 0.5 ? [1, 2, t * 2] : [2, 3, (t - 0.5) * 2]
  return `color-mix(in oklch, var(--vim-edge-${mode}-${to}) ${Math.round(share * 100)}%, var(--vim-edge-${mode}-${from}))`
}

/** A row's icon (a lucide one), in its place's colour of the mode's
 *  gradient: the icons down the list run from the first colour to the
 *  last. Its plain colour while Vim mode is off. `style` wins: an icon
 *  with a colour of its own (a group's) passes it. */
export function EntityIcon({ icon: Icon, mode, index, count, size = 16, className, style }: {
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
  mode: VimMode | null
  /** The row's place in its list, from 0, and how many rows there are. */
  index: number
  count: number
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <Icon
      size={size}
      className={cn(!mode && 'text-muted-foreground/60', className)}
      style={{ ...(mode ? { color: gradientColour(mode, count > 1 ? index / (count - 1) : 0) } : null), ...style }}
    />
  )
}
