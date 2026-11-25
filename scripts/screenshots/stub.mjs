// Runs inside the page before the renderer's own code: stands in for the
// preload script. `window.electronAPI` answers from the data it is handed —
// no main process behind it, nothing leaves the page.
//
// Kept self-contained: Playwright serialises this function into the page.
export function installStub(data) {
  // Platform-specific rows and key names go by navigator.platform; the
  // frames show the Windows build wherever they are taken.
  Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
  // A popup's frame (below) gets this script too: the API is the window's.
  if (window.top !== window) return

  // The Sidebar's width is the window's own saved choice (Sidebar.tsx).
  localStorage.setItem('vimperium-sidebar-width', String(data.sidebarWidth))

  const listeners = {}
  let state = data.state
  let settings = data.settings
  const shots = {
    emit: (name, payload) => listeners[name]?.(payload),
    has: (name) => name in listeners,
    /** Where the renderer asked main to put the page's own view. */
    pageBounds: null,
    /** Sizes the renderer asked for its popups, in opening order. */
    popups: [],
    calls: [],
  }
  window.__shots = shots

  const known = {
    loadState: async () => state,
    saveState: async (next) => { state = next },
    loadSettings: async () => settings,
    saveSettings: async (next) => { settings = { ...settings, ...next } },
    getAppVersion: async () => data.version,
    getAppPaths: async () => data.paths,
    getOpenWorkspaceWindows: async () => data.openWindows,
    getLastUsedWorkspace: async () => null,
    bangsList: async () => data.bangs,
    bangsSave: async (bangs) => bangs,
    downloadsList: async () => data.downloads,
    downloadsRefresh: async () => data.downloads,
    downloadsFileIcon: async () => null,
    bookshelfList: async () => data.bookshelf,
    listExtensions: async () => [],
    listExtensionCommands: async () => [],
    getBrowserActionState: async () => ({ partition: null, state: { actions: [] } }),
    getSidePanelState: async () => ({ extensionId: null }),
    darkPagesGet: async () => data.darkPages,
    darkPagesSet: async () => data.darkPages,
    getUpdaterStatus: async () => ({ phase: 'idle' }),
    checkForUpdates: async () => ({ phase: 'idle' }),
    cloudSyncGetInfo: async () => data.cloudSync,
    cloudSyncClaimSetupPrompt: async () => null,
    permissionsList: async () => [],
    passwordsList: async () => data.passwords,
    passkeysList: async () => [],
    savedCredentialsList: async () => [],
    edgePasswordsDetect: async () => ({ available: false, profiles: [] }),
    getDefaultBrowserStatus: async () => ({ isDefault: true, canSet: true }),
    otherBrowserGet: async () => null,
    otherBrowserList: async () => [],
    historyQuery: async () => ({ items: [], inline: null }),
    omniboxSuggest: async () => [],
    clipboardReadText: async () => '',
    getCertInfo: async () => null,
    tabGetState: async () => ({ isLoading: false, url: '', canGoBack: true, canGoForward: false }),
    tabZoom: async () => 1,
    detachedWindowDragStart: async () => false,
    detachedWindowDragEnd: async () => null,
    tabSetBounds: (bounds) => { shots.pageBounds = bounds },
  }

  window.electronAPI = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name]
      if (typeof name !== 'string') return undefined
      // Subscriptions: remember the callback so the script can play main's
      // part (`__shots.emit('onTabEvent', …)`), hand back an unsubscribe.
      if (name.startsWith('on')) {
        return (cb) => {
          listeners[name] = cb
          return () => {
            if (listeners[name] === cb) delete listeners[name]
          }
        }
      }
      return async () => undefined
    },
  })

  // A popup is a window.open('') the renderer draws into (DetachedWindow).
  // Here it is a frame of the size asked for, in the middle of the window:
  // a headless popup page never finishes loading the fonts copied into it.
  window.open = (_url, _target, features = '') => {
    const num = (key) => Number(new RegExp(`(?:^|,)${key}=([0-9]+)`).exec(features)?.[1] ?? 0)
    const width = num('width')
    const height = num('height')
    const frame = document.createElement('iframe')
    frame.dataset.shotsPopup = String(shots.popups.length)
    frame.style.cssText = `position:fixed;z-index:2147483000;border:0;width:${width}px;height:${height}px;` +
      `left:${Math.max(0, Math.round((innerWidth - width) / 2))}px;top:${Math.max(0, Math.round((innerHeight - height) / 2))}px`
    document.body.appendChild(frame)
    const win = frame.contentWindow
    win.close = () => { win.dispatchEvent(new Event('beforeunload')); frame.remove() }
    win.resizeTo = (w, h) => { frame.style.width = `${w}px`; frame.style.height = `${h}px` }
    shots.popups.push({ width, height })
    win.focus()
    return win
  }
}
