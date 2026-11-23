export type ThemeChoice = 'light' | 'dark' | 'system'

// ── Layout density ──
// Controls vertical breathing room between sidebar rows (tabs, groups).
// `compact` is the current/legacy look; `normal` adds gaps roughly the
// size of the toolbar button spacing so rows feel less cramped.

export type Density = 'compact' | 'normal'

export const DENSITIES: readonly { id: Density; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'Roomy rows with toolbar-style padding.' },
  { id: 'compact', label: 'Compact', hint: 'Tight rows, fits more tabs on screen.' },
] as const

export const DEFAULT_DENSITY: Density = 'normal'

export function normalizeDensity(value: string | undefined): Density {
  return value === 'compact' ? 'compact' : 'normal'
}

export function applyDensity(density: Density): void {
  document.documentElement.setAttribute('data-density', density)
}
