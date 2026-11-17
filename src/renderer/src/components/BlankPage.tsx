// A blank tab (about:blank — a new tab before it has gone anywhere): the
// app's mark in the middle of the page area, its name under it. The mark
// wears Vim's mode — COMMAND's blue-violet, INSERT's green-yellow — and
// tears once as the page comes up, once as the mode changes, and again
// whenever the pointer comes onto it; still the rest of the time.
//
// WebviewPanel takes the tab's own (empty) view off screen while this
// shows, as it does for a page load's error.

import { BrandMark } from './BrandMark'
import type { VimMode } from '../lib/vim-mode'

export function BlankPage({ vimMode }: { vimMode: VimMode | null }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background text-foreground select-none">
      {/* A touch above dead-centre, as the error page's block is. */}
      <div className="flex -translate-y-[6vh] flex-col items-center gap-5">
        <BrandMark variant="full" size={112} mode={vimMode} glitchOnMount glitchOnHover />
        <h1 className="text-2xl font-semibold tracking-tight">Vimperium</h1>
      </div>
    </div>
  )
}
