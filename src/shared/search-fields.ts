// What Search Everything's filter goes by, for each kind of thing it lists
// (Settings → Search). A tab by its title, comment and address; a group
// and a workspace by their name and where they are. `>` first in the
// filter searches by everything whatever is picked here; `=` first takes
// what's typed as it is, not its letters spread about (the two together too). Profiles have a
// name and nothing else.

export type SearchFieldKind = 'tab' | 'tabGroup' | 'workspace'

export interface SearchFieldOption {
  id: string
  label: string
  hint: string
  /** How much a match in it counts: a match in a field that counts more
   *  comes up higher. */
  weight: number
}

export const SEARCH_FIELD_KINDS: ReadonlyArray<{ kind: SearchFieldKind; label: string }> = [
  { kind: 'tab', label: 'Tabs' },
  { kind: 'tabGroup', label: 'Tab groups' },
  { kind: 'workspace', label: 'Workspaces' },
]

/** Each kind's fields in the order the search goes by them: the first
 *  counts most. Settings lists them in this order, numbered. */
export const SEARCH_FIELD_OPTIONS: Record<SearchFieldKind, readonly SearchFieldOption[]> = {
  tab: [
    { id: 'name', label: 'Title', hint: "The tab's title", weight: 1 },
    { id: 'comment', label: 'Comment', hint: 'The comment you gave it', weight: 0.9 },
    { id: 'path', label: 'Path', hint: "Its profile's, workspace's and group's names", weight: 0.7 },
    { id: 'url', label: 'Address', hint: "The page's address", weight: 0.5 },
  ],
  tabGroup: [
    { id: 'name', label: 'Name', hint: "The group's name", weight: 1 },
    { id: 'path', label: 'Path', hint: "Its profile's and workspace's names", weight: 0.7 },
  ],
  workspace: [
    { id: 'name', label: 'Name', hint: "The workspace's name", weight: 1 },
    { id: 'path', label: 'Path', hint: "Its profile's name", weight: 0.7 },
  ],
}

export type SearchFields = Record<SearchFieldKind, string[]>

export const DEFAULT_SEARCH_FIELDS: SearchFields = {
  tab: ['name', 'comment', 'url'],
  tabGroup: ['name', 'path'],
  workspace: ['name', 'path'],
}

/** Saved fields with only what exists, in the options' order; a kind with
 *  none left (or never saved) goes by its defaults. */
export function normalizeSearchFields(raw: unknown): SearchFields {
  const saved = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const out = {} as SearchFields
  for (const { kind } of SEARCH_FIELD_KINDS) {
    const list = Array.isArray(saved[kind]) ? saved[kind] as unknown[] : null
    const picked = list ? SEARCH_FIELD_OPTIONS[kind].map((o) => o.id).filter((id) => list.includes(id)) : []
    out[kind] = picked.length > 0 ? picked : [...DEFAULT_SEARCH_FIELDS[kind]]
  }
  return out
}
