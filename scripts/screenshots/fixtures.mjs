// Invented sample data for the screenshots. Nothing here comes from a real
// machine: the sites, tabs, files, paths and the user "alex" are made up.

/** A flat square tile with a letter — stands in for a site's own icon. */
function tile(letter, colour) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="6" fill="${colour}"/>` +
    `<text x="16" y="22" font-family="Arial, sans-serif" font-size="17" font-weight="700" ` +
    `text-anchor="middle" fill="#ffffff">${letter}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const SITES = {
  docs: ['D', '#2f6fde'],
  forge: ['F', '#1f2933'],
  mail: ['M', '#c2410c'],
  wiki: ['W', '#52525b'],
  maps: ['K', '#15803d'],
  video: ['V', '#be123c'],
  news: ['N', '#0369a1'],
  shop: ['S', '#7c3aed'],
  board: ['B', '#0f766e'],
  cal: ['C', '#b45309'],
}

let nextId = 0
const tab = (site, title, url, comment) => {
  const [letter, colour] = SITES[site]
  return { id: `t${++nextId}`, title, url, favicon: tile(letter, colour), ...(comment ? { comment } : {}) }
}
const group = (name, color, tabs, isCollapsed = false) => ({ id: `g${++nextId}`, name, color, tabs, isCollapsed })
const workspace = (id, name, tabs, tabGroups) => ({
  id,
  name,
  tabs,
  tabGroups,
  // Loose tabs first, then the groups, as the Sidebar lists them.
  sidebarOrder: [...tabs.map((t) => t.id), ...tabGroups.map((g) => g.id)],
})

/** The page the main window's frames stand on. */
export const WEB_TAB = 't1'

function profiles() {
  nextId = 0
  const web = tab('docs', 'Getting started — Lumen docs', 'https://docs.lumen.example/guide/getting-started?lang=en#install')
  const project = workspace('w1', 'Lumen', [
    web,
    tab('mail', 'Inbox (3) — Cobalt Mail', 'https://mail.cobalt.example/inbox'),
    tab('cal', 'Week 48 — Fjord Calendar', 'https://calendar.fjord.example/week'),
  ], [
    group('Release 2.4', '#5681B8', [
      tab('forge', 'lumen/lumen: pull request #482', 'https://forge.example/lumen/lumen/pull/482', 'waiting for review'),
      tab('forge', 'Milestone 2.4 — issues', 'https://forge.example/lumen/lumen/milestone/24'),
      tab('board', 'Sprint board — Birch', 'https://board.birch.example/lumen/sprint-12'),
      tab('docs', 'Changelog — Lumen docs', 'https://docs.lumen.example/changelog'),
    ]),
    group('Reading', '#C4A140', [
      tab('wiki', 'Cascade layers — Openpedia', 'https://openpedia.example/wiki/Cascade_layers'),
      tab('news', 'How we cut cold start in half', 'https://news.harbor.example/posts/cold-start'),
      tab('video', 'Keyboard-first interfaces (talk)', 'https://video.ember.example/watch/keyboard-first'),
    ]),
    group('Travel', '#7AAFAF', [
      tab('maps', 'Lisbon to Porto — Compass Maps', 'https://maps.compass.example/route/lisbon-porto'),
      tab('shop', 'Rail pass — Delta Tickets', 'https://tickets.delta.example/pass'),
    ], true),
  ])
  const home = workspace('w2', 'Home', [
    tab('news', 'Front page — Harbor News', 'https://news.harbor.example/'),
    tab('shop', 'Order #20418 — Delta Shop', 'https://shop.delta.example/orders/20418'),
  ], [
    group('Garden', '#B488C9', [
      tab('wiki', 'Tomato — Openpedia', 'https://openpedia.example/wiki/Tomato'),
      tab('video', 'Pruning in ten minutes', 'https://video.ember.example/watch/pruning'),
    ]),
  ])
  const client = workspace('w3', 'Atlas client', [
    tab('board', 'Roadmap — Birch', 'https://board.birch.example/atlas/roadmap'),
    tab('mail', 'Drafts — Cobalt Mail', 'https://mail.cobalt.example/drafts'),
  ], [])
  return [
    { id: 'p1', name: 'Personal', partition: 'persist:personal', workspaces: [project, home] },
    { id: 'p2', name: 'Work', partition: 'persist:work', workspaces: [client] },
  ]
}

/** The saved state main would load, with the active tab showing `url` — a
 *  web page by default, or one of the app's own pages (vimperium://…). */
export function stateFor(url) {
  const all = profiles()
  const ws = all[0].workspaces[0]
  if (url) {
    const page = url.startsWith('vimperium://') ? url.slice('vimperium://'.length) : ''
    const title = page ? page[0].toUpperCase() + page.slice(1) : 'New Tab'
    ws.tabs[0] = { ...ws.tabs[0], url, title, favicon: '' }
  }
  ws.lastActiveTabId = WEB_TAB
  return { profiles: all, activeProfileId: 'p1', activeWorkspaceId: 'w1', activeTabGroupId: null, activeTabId: WEB_TAB }
}

const HOME = 'C:\\Users\\alex'
const MB = 1024 * 1024
const HOUR = 3600_000
// A fixed moment, so the frames don't change from run to run.
const NOW = Date.UTC(2026, 10, 25, 10, 30)

const download = (id, filename, mimeType, totalBytes, state, ago, extra = {}) => ({
  id,
  url: `https://files.lumen.example/download/${filename}`,
  filename,
  savePath: `${HOME}\\Downloads\\${filename}`,
  mimeType,
  totalBytes,
  receivedBytes: totalBytes,
  state,
  startedAt: NOW - ago,
  endedAt: NOW - ago + 40_000,
  originUrl: 'https://docs.lumen.example/downloads',
  partition: 'persist:personal',
  fileExists: true,
  ...extra,
})

const downloads = [
  download('d1', 'lumen-2.4.0-win-x64.zip', 'application/zip', 184 * MB, 'progressing', 60_000, { receivedBytes: 121 * MB, endedAt: undefined, bytesPerSecond: 6.4 * MB, fileExists: undefined }),
  download('d2', 'design-review.mp4', 'video/mp4', 412 * MB, 'paused', 9 * 60_000, { receivedBytes: 96 * MB, endedAt: undefined, fileExists: undefined }),
  download('d3', 'release-notes-2.4.pdf', 'application/pdf', 1.8 * MB, 'completed', 2 * HOUR),
  download('d4', 'sprint-12-board.png', 'image/png', 640 * 1024, 'completed', 5 * HOUR),
  download('d5', 'rail-pass.pdf', 'application/pdf', 210 * 1024, 'completed', 26 * HOUR),
  download('d6', 'dataset-2025.csv', 'text/csv', 48 * MB, 'interrupted', 28 * HOUR, { receivedBytes: 12 * MB, fileExists: undefined }),
  download('d7', 'garden-plan.xlsx', 'application/vnd.ms-excel', 96 * 1024, 'completed', 50 * HOUR, { fileExists: false }),
  download('d8', 'lumen-2.3.2-win-x64.zip', 'application/zip', 181 * MB, 'completed', 9 * 24 * HOUR),
]

const bang = (trigger, name, url, category, enabled = true, labels) => ({
  id: `builtin:${trigger}`, trigger, name, url, category, enabled, ...(labels ? { labels } : {}),
})
const bangs = [
  bang('w', 'Openpedia', 'https://openpedia.example/wiki/Special:Search?search=%s', 'Research', true, ['ref']),
  bang('d', 'Lumen docs', 'https://docs.lumen.example/search?q=%s', 'Tech', true, ['dev']),
  bang('f', 'Forge', 'https://forge.example/search?q=%s', 'Tech', true, ['dev']),
  bang('m', 'Compass Maps', 'https://maps.compass.example/search/%s', 'Travel'),
  bang('v', 'Ember Video', 'https://video.ember.example/results?q=%s', 'Entertainment'),
  bang('n', 'Harbor News', 'https://news.harbor.example/search?q=%s', 'News', false),
  bang('s', 'Delta Shop', 'https://shop.delta.example/s?k=%s', 'Shopping'),
  bang('t', 'Delta Tickets', 'https://tickets.delta.example/find?q=%s', 'Travel'),
  bang('b', 'Birch boards', 'https://board.birch.example/search?q=%s', 'Tech', true, ['dev']),
  bang('c', 'Fjord Calendar', 'https://calendar.fjord.example/find?q=%s', 'Tools'),
]

const reading = (id, site, title, url, ago, extra = {}) => ({
  id, url, title, favicon: tile(...SITES[site]), status: 'toread', addedAt: NOW - ago, ...extra,
})
const bookshelf = {
  groups: [
    { id: 'rg1', name: 'Interfaces', color: '#5681B8', isCollapsed: false },
    { id: 'rg2', name: 'Performance', color: '#D08866', isCollapsed: false },
  ],
  readings: [
    reading('r1', 'news', 'How we cut cold start in half', 'https://news.harbor.example/posts/cold-start', 3 * HOUR, { groupId: 'rg2' }),
    reading('r2', 'wiki', 'Cascade layers — Openpedia', 'https://openpedia.example/wiki/Cascade_layers', 20 * HOUR, { groupId: 'rg1' }),
    reading('r3', 'video', 'Keyboard-first interfaces (talk)', 'https://video.ember.example/watch/keyboard-first', 30 * HOUR, { groupId: 'rg1' }),
    reading('r4', 'docs', 'Writing a keymap — Lumen docs', 'https://docs.lumen.example/guide/keymap', 2 * 24 * HOUR, { groupId: 'rg1' }),
    reading('r5', 'news', 'A field guide to render loops', 'https://news.harbor.example/posts/render-loops', 3 * 24 * HOUR, { groupId: 'rg2' }),
    reading('r6', 'wiki', 'Modal editing — Openpedia', 'https://openpedia.example/wiki/Modal_editing', 4 * 24 * HOUR),
    reading('r7', 'docs', 'Release checklist — Lumen docs', 'https://docs.lumen.example/guide/release', 5 * 24 * HOUR),
    reading('r8', 'news', 'Notes on small tools', 'https://news.harbor.example/posts/small-tools', 9 * 24 * HOUR, { status: 'archived' }),
    reading('r9', 'video', 'Colour for interfaces', 'https://video.ember.example/watch/colour', 12 * 24 * HOUR, { status: 'archived' }),
  ],
}

const passwords = [
  ['forge.example', 'alex'], ['mail.cobalt.example', 'alex@cobalt.example'], ['board.birch.example', 'alex.m'],
  ['shop.delta.example', 'alex@cobalt.example'], ['video.ember.example', 'alexm'],
].map(([host, username], i) => ({
  id: `pw${i}`, partition: 'persist:personal', origin: `https://${host}`, name: host, username,
  createdAt: NOW - (40 + i) * 24 * HOUR, updatedAt: NOW - (9 + i) * 24 * HOUR, lastUsedAt: NOW - (1 + i) * HOUR,
}))

/** What main keeps in settings.json by default (main/settings-store.ts
 *  DEFAULT_SETTINGS), with the frame's own choices over it. */
export function settingsFor(overrides = {}) {
  return {
    theme: 'dark',
    lightVariant: 'light-default',
    darkVariant: 'dark-default',
    density: 'normal',
    newTabFocus: 'site',
    pageFocus: 'ignore',
    urlEditorClickMode: 'insert',
    urlEditorNewTabMode: 'insert',
    urlEditorEditMode: 'command',
    vimMode: true,
    hideSidebarInInsert: false,
    vimIndicator: 'quiet',
    vimEdge: 'glint',
    vimEdgeEverywhere: false,
    vimEdgeSpeed: 10,
    vimEdgeRest: 3,
    motion: null,
    vimKeymap: null,
    defaultPageUrl: '',
    searchEngine: 'https://www.google.com/search?q=%s',
    searchSuggestions: true,
    bangsEnabled: true,
    proxy: { mode: 'system', proxyRules: '', proxyBypassRules: '<-loopback>' },
    dohMode: 'automatic',
    authServerAllowlist: '',
    passwordManager: { enabled: true, offerToSave: true, autofill: 'automatic' },
    keybindings: {},
    permissionDefaults: { microphone: 'ask', camera: 'ask', geolocation: 'ask', notifications: 'ask', clipboard: 'ask', midi: 'ask' },
    ...overrides,
  }
}

export function fixtures({ version }) {
  return {
    version,
    bangs,
    downloads,
    bookshelf,
    passwords,
    paths: { userData: `${HOME}\\AppData\\Roaming\\Vimperium`, cache: `${HOME}\\AppData\\Local\\Vimperium\\Cache`, logs: `${HOME}\\AppData\\Roaming\\Vimperium\\logs`, appName: 'Vimperium' },
    openWindows: [{ profileId: 'p1', workspaceId: 'w1' }],
    darkPages: undefined,
    cloudSync: {
      enabled: false, folderPath: '', deviceId: 'sample-device',
      categories: { state: true, bookshelf: true, settings: true, history: false, permissions: true, extensions: true, darkPages: true },
      state: 'disabled', lastSync: 0, error: null, progress: null,
    },
  }
}
