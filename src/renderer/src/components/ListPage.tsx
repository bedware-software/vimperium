// What the pages that list rows in the page area share — a group's page,
// Search Everything — so they look and move alike: the page itself scrolls,
// its bar at the window's right edge and its room always kept (no row or
// header shifts as the bar comes and goes); the header stays put at the
// top, the rows passing under it — a title's row, then a row of the page's
// controls with the columns' switch at its end, both the list's width
// (ColumnsSwitch.tsx' pageWidthClass), so their edges are in one line. And
// the rows' icons, drawn top to bottom in the mode's colours — the ones
// the light round the address bar's edge has.

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
      <EntityIconDefs />
      <div className={cn('mx-auto mb-3 mt-5 flex h-8 w-full min-w-0 items-center gap-3 px-4', width)}>{title}</div>
      <div className={cn('mx-auto mb-4 flex h-8 w-full items-center gap-1.5 whitespace-nowrap px-4', width)}>{children}</div>
    </div>
  )
}

const GRADIENT_ID = { command: 'entity-icon-command', insert: 'entity-icon-insert' } as const

/** The gradients the rows' icons are drawn with, one per mode: the edge's
 *  three colours, top to bottom. In the icon's own units (a 24 px box), not
 *  each stroke's bounding box — a level line has no height to spread one
 *  over. */
function EntityIconDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        {(['command', 'insert'] as const).map((mode) => (
          <linearGradient key={mode} id={GRADIENT_ID[mode]} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22">
            <stop offset="0" style={{ stopColor: `var(--vim-edge-${mode}-1)` }} />
            <stop offset="0.5" style={{ stopColor: `var(--vim-edge-${mode}-2)` }} />
            <stop offset="1" style={{ stopColor: `var(--vim-edge-${mode}-3)` }} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  )
}

/** A row's icon (a lucide one), drawn in the mode's gradient; in its plain
 *  colour while Vim mode is off. `style` wins: an icon with a colour of its
 *  own (a group's) passes its stroke. */
export function EntityIcon({ icon: Icon, mode, size = 16, className, style }: {
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
  mode: VimMode | null
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <Icon
      size={size}
      className={cn(!mode && 'text-muted-foreground/60', className)}
      style={{ ...(mode ? { stroke: `url(#${GRADIENT_ID[mode]})` } : null), ...style }}
    />
  )
}
