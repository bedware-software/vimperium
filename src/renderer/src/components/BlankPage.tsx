// A blank tab (about:blank — a new tab before it has gone anywhere): a
// panel in the middle of the page area — the app's mark, big, on its left;
// its name, the version and the mode beside it; how much is open, here, in
// this profile and everywhere (Settings → About's rows). Along the bottom,
// in a hint bar of its own (the window's, BottomBar.tsx, comes below it):
// the key that shows every key. The mark wears Vim's mode — COMMAND's blue-violet, INSERT's
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
import { Hint, HintBar } from '@bedware/ui'

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

  // The one key worth saying here: the page that lists all the others.
  const helpKeys = vimKeyCaps(keymap, 'help')
  const under = [version && `v${version}`, vimMode && vimMode.toUpperCase()].filter(Boolean).join(' · ')

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background text-foreground select-none">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
      {/* A touch above dead-centre, as the error page's block is. */}
      <div className="flex w-full max-w-[780px] -translate-y-[4vh] items-center gap-7 rounded-2xl border border-border bg-card p-7">
        <BrandMark variant="full" size={168} mode={vimMode} glitchOnMount glitchOnHover />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Vimperium</h1>
          {under && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{under}</p>}
          <div className="mt-3 border-t border-border">
            <WorkspaceStatsCard bare />
          </div>
        </div>
      </div>
      </div>
      {/* How to see every key. A prefix typed (o, d, n…) puts what can
          follow it over this, in the same place. */}
      {helpKeys.length > 0 && (
        <HintBar>
          <Hint label="All keys" keys={helpKeys} />
        </HintBar>
      )}
    </div>
  )
}
