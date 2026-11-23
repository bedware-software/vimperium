import { Switch } from '@bedware/ui'

interface Props {
  /** On while the list is narrowed to where the user is (this workspace or
   *  profile); off while it spans everything. */
  on: boolean
  /** What the switch reads in its current position, e.g. "All workspaces". */
  label: string
  onToggle: () => void
  title?: string
  /** Placement classes from the host row (e.g. `ml-auto`). */
  className?: string
}

/** The scope switch shared by the search window and the pickers, so both
 *  read and behave alike. Tab flips it in both places; each window handles
 *  that key itself, the ⇥ here only advertises it. */
export function ScopeSwitch({ on, label, onToggle, title, className = '' }: Props) {
  return (
    <label
      title={title}
      className={`flex items-center gap-1.5 h-6 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {label}
      <Switch checked={on} onChange={onToggle} label={label} />
      <span className="opacity-50">⇥</span>
    </label>
  )
}
