// A blank tab (about:blank — a new tab before it has gone anywhere): a
// panel in the middle of the page area — the app's mark, big, on its left;
// its name, the version and the mode beside it; how much is open, here, in
// this profile and everywhere (Settings → About's rows); and the keys to
// get going. The mark wears Vim's mode — COMMAND's blue-violet, INSERT's
// green-yellow — and tears once as the page comes up, once as the mode
// changes, and again whenever the pointer comes onto it; still the rest of
// the time.
//
// WebviewPanel takes the tab's own (empty) view off screen while this
// shows, as it does for a page load's error.

import { useEffect, useState } from 'react'
import { BrandMark } from './BrandMark'
import { WorkspaceStatsCard } from './WorkspaceStats'
import { vimKeyCaps } from './KeyHints'
import { useWindowVimKeymap } from '../lib/window-vim-keymap'
import type { VimMode } from '../lib/vim-mode'

/** What gets you going from a blank tab, with the command whose key it is. */
const KEYS: ReadonlyArray<readonly [command: string, label: string]> = [
  ['focus-url', 'address'],
  ['pick-tab', 'tabs'],
  ['reopen-closed-tab', 'reopen closed'],
  ['help', 'keys'],
]

export function BlankPage({ vimMode }: { vimMode: VimMode | null }) {
  const keymap = useWindowVimKeymap()?.main ?? null
  const [version, setVersion] = useState('')
  useEffect(() => {
    let alive = true
    window.electronAPI.getAppVersion?.()
      .then((v: string) => { if (alive) setVersion(v) })
      .catch(() => { /* no version to show */ })
    return () => { alive = false }
  }, [])

  const keys = KEYS
    .map(([command, label]) => ({ label, cap: vimKeyCaps(keymap, command)[0] }))
    .filter((k) => !!k.cap)
  const under = [version && `v${version}`, vimMode && vimMode.toUpperCase()].filter(Boolean).join(' · ')

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-auto bg-background p-8 text-foreground select-none">
      {/* A touch above dead-centre, as the error page's block is. */}
      <div className="flex w-full max-w-[640px] -translate-y-[4vh] items-center gap-7 rounded-2xl border border-border bg-card p-7">
        <BrandMark variant="full" size={168} mode={vimMode} glitchOnMount glitchOnHover />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-light tracking-wide">Vimperium</h1>
          {under && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{under}</p>}
          <div className="mt-3 border-t border-border">
            <WorkspaceStatsCard bare />
          </div>
          {keys.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
              {keys.map(({ label, cap }) => (
                <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
                  <kbd className="font-mono">{cap}</kbd>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
