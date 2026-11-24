// How Vim's mode label (VimModeBadge) looks — a Settings → Appearance
// choice. The labels read it through useVimIndicator, so every one follows a
// change at once, popups' included (they render from this window). The looks
// are .vim-mode's [data-indicator] rules in globals.css.

import { useSyncExternalStore } from 'react'

export type VimIndicator = 'quiet' | 'outline'

export const VIM_INDICATORS: readonly { id: VimIndicator; label: string; hint: string }[] = [
  { id: 'quiet', label: 'Quiet', hint: 'COMMAND is muted grey; INSERT a yellow plate.' },
  { id: 'outline', label: 'Outline', hint: 'COMMAND is yellow in a yellow frame; INSERT a yellow plate.' },
] as const

export const DEFAULT_VIM_INDICATOR: VimIndicator = 'quiet'

/** Anything else — the looks before these two — reads as Quiet. */
export function normalizeVimIndicator(value: string | undefined): VimIndicator {
  return value === 'outline' ? 'outline' : DEFAULT_VIM_INDICATOR
}

let current: VimIndicator = DEFAULT_VIM_INDICATOR
const listeners = new Set<() => void>()

export function applyVimIndicator(indicator: VimIndicator): void {
  if (indicator === current) return
  current = indicator
  listeners.forEach((listener) => listener())
}

export function useVimIndicator(): VimIndicator {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    () => current,
  )
}
