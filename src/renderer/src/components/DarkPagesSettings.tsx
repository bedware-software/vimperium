// Settings → Dark pages: when pages are dark, how they're darkened, the
// comfort sliders, and the sites with rules of their own. Live — it changes
// the pages behind the window as you go, with no Save (src/main/dark-pages.ts
// keeps it, and Cloud Sync carries it).

import { useMemo, useState } from 'react'
import { Moon, Plus, Sparkles, Palette, Trash2, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { darkPagesActions, useDarkPages } from '../lib/dark-pages'
import { actionHint, type HintSettings } from '../lib/shortcut-hints'
import { ComfortSliders, DarkPagePreview, DarkPagesModeSwitch, acceleratorCaps } from './DarkPagesControls'
import { darkPagesGloballyOn, normalizeSiteKey, type DarkPagesRule, type DarkPagesStyle } from '../../../shared/dark-pages'
import { Badge, Button, ChoiceCards, Kbd, Panel, PanelRow, InputField as TextField, IconButton } from '@bedware/ui'

const STYLES: { id: DarkPagesStyle; title: string; icon: typeof Sparkles; body: string }[] = [
  {
    id: 'smart',
    title: 'Smart',
    icon: Sparkles,
    body: "A site's own dark theme where it has one; Chromium darkens everything else as it paints — photos kept, no white flash, frames included.",
  },
  {
    id: 'native',
    title: "Sites' own themes only",
    icon: Palette,
    body: 'Only sites with a dark theme of their own turn dark; nothing is repainted. Sites you make always dark are still darkened.',
  },
]

/** A site's rule. Its two choices are its row's first two buttons for Vim's
 *  form keys (h / l between them, Enter picks): each wears data-vim-cell,
 *  which the package's Segmented can't put on its options — so it's drawn here. */
function RulePicker({ rule, onPick, site }: { rule: DarkPagesRule; onPick: (rule: DarkPagesRule) => void; site: string }) {
  return (
    <div className="flex h-7 items-center rounded-md bg-secondary p-0.5" role="radiogroup" aria-label={`Rule for ${site}`}>
      {(['dark', 'light'] as const).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          data-vim-cell={r}
          aria-checked={rule === r}
          onClick={() => onPick(r)}
          title={r === 'dark' ? `${site} is always dark` : `${site} is never darkened`}
          className={cn(
            'flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors',
            rule === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {r === 'dark' ? <Moon size={11} fill={rule === r ? 'currentColor' : 'none'} /> : null}
          {r === 'dark' ? 'Always dark' : 'Never dark'}
        </button>
      ))}
    </div>
  )
}

function Caps({ keys }: { keys: string[] }) {
  if (keys.length === 0) return <span className="text-muted-foreground/70">unbound</span>
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium">
      {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
    </span>
  )
}

export function DarkPagesSettings({ hintSettings }: { hintSettings: HintSettings }) {
  const dp = useDarkPages()
  const { config } = dp
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const on = darkPagesGloballyOn(config, dp.appDark)
  const sites = useMemo(
    () => Object.entries(config.sites).sort(([a], [b]) => a.localeCompare(b)),
    [config.sites],
  )

  const status =
    config.mode === 'off' ? 'Off — pages look as their sites made them, but for the sites below that are always dark.'
      : config.mode === 'on' ? 'On — every page is dark, but for the sites below that are never dark.'
        : on ? "On now: Vimperium's theme is dark."
          : "Off now: Vimperium's theme is light. Pages turn dark with it."

  const add = (rule: DarkPagesRule): void => {
    const site = normalizeSiteKey(draft)
    if (!site) {
      setError('Type a site like github.com, or paste its address.')
      return
    }
    darkPagesActions.setSite(site, rule)
    setDraft('')
    setError(null)
  }

  const keysFor = (action: string, fallback: string): string[] => {
    const hint = actionHint(hintSettings, action, fallback)
    if (!hint) return []
    return hint.kind === 'vim' ? [hint.keys] : acceleratorCaps(hint.accelerator)
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Moon size={13} fill="currentColor" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Dark pages</h3>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Vimperium's own dark mode for web pages — done by Chromium as the page paints, so it's instant on every
          page, its frames included, and never slows a page down. Changes apply right away.
        </p>
        <DarkPagesModeSwitch vimItem="dark:mode" />
        <p className="mt-2 text-[11px] text-muted-foreground">{status}</p>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Style</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">How a page turns dark.</p>
        <ChoiceCards
          label="Style"
          data-vim-item="dark:style"
          value={config.style}
          onChange={(style) => darkPagesActions.set({ style })}
          options={STYLES.map(({ id, title, icon: Icon, body }) => ({
            value: id,
            title: (
              <span className="flex items-center gap-1.5">
                <Icon size={13} className="shrink-0 text-muted-foreground" />
                {title}
                {id === 'smart' && <Badge tone="accent">Recommended</Badge>}
              </span>
            ),
            description: body,
          }))}
        />
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Comfort</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Tone dark pages down — brightness, contrast, a warm tint for the night. Double-click a slider to put it back.
        </p>
        <div className="flex items-start gap-5">
          <DarkPagePreview className="w-[248px] shrink-0" />
          <div className="min-w-0 flex-1 pt-1">
            <ComfortSliders vimItems />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Sites</h3>
          {sites.length > 0 && (
            <Button
              variant="quiet-danger"
              icon={<Trash2 size={12} />}
              data-vim-item="dark:clear-sites"
              data-vim-danger
              onClick={() => darkPagesActions.resetSites()}
            >
              Clear all
            </Button>
          )}
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          A site's rule beats the switch above, and covers its subdomains too. Set one for the site you're on with the
          moon in the address bar, or <Caps keys={keysFor('dark-pages-site', 'Alt+Shift+A')} />.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <TextField
            data-vim-item="dark:site-input"
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') add('dark') }}
            placeholder="github.com"
            spellCheck={false}
            boxClassName="min-w-[180px] flex-1"
          />
          <Button variant="primary" icon={<Plus size={14} />} data-vim-item="dark:add-dark" onClick={() => add('dark')}>
            Always dark
          </Button>
          <Button variant="secondary" icon={<Plus size={14} />} data-vim-item="dark:add-light" onClick={() => add('light')}>
            Never dark
          </Button>
        </div>
        {error && <p className="-mt-1 mb-3 text-[11px] text-destructive">{error}</p>}
        {sites.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No site rules yet — every page follows the switch.
          </p>
        ) : (
          <Panel>
            {sites.map(([site, rule]) => (
              <PanelRow key={site} data-vim-item={`dark-site:${site}`} data-vim-kind="row">
                {/* Not PanelRow's title: that one doesn't truncate, and a long address would push the buttons out. */}
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{site}</span>
                <RulePicker site={site} rule={rule} onPick={(r) => darkPagesActions.setSite(site, r)} />
                <IconButton
                  danger
                  data-vim-cell="remove"
                  onClick={() => darkPagesActions.setSite(site, null)}
                  title={`Drop the rule: ${site} follows the switch`}
                  label={`Remove ${site}`}
                >
                  <X size={14} />
                </IconButton>
              </PanelRow>
            ))}
          </Panel>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Keys</h3>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">On / off everywhere <Caps keys={keysFor('dark-pages', 'Alt+Shift+D')} /></span>
          <span className="flex items-center gap-2">This site <Caps keys={keysFor('dark-pages-site', 'Alt+Shift+A')} /></span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Rebind them in the Vim keymap, under Keyboard Shortcuts.
        </p>
      </div>
    </div>
  )
}
