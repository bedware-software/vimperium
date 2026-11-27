// Removes the 1px accent-colored border DWM draws around every window on Windows 11
// when "Show accent color on title bars and window borders" is on; CSS can't reach it.
import type { BrowserWindow } from 'electron'

type SetAttr = (hwnd: bigint, attr: number, value: Buffer, size: number) => number

const DWMWA_BORDER_COLOR = 34
const DWMWA_COLOR_NONE = 0xfffffffe
const WM_SETTINGCHANGE = 0x001a
const WM_DWMCOLORIZATIONCOLORCHANGED = 0x0320

let setAttr: SetAttr | null | undefined

// Lazy require: koffi is only loaded on Windows, and a failure to load it must not
// take a window down with it — the border is cosmetic.
function dwmSetWindowAttribute(): SetAttr | null {
  if (setAttr !== undefined) return setAttr
  setAttr = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const dwmapi = koffi.load('dwmapi.dll')
    setAttr = dwmapi.func(
      'long __stdcall DwmSetWindowAttribute(uintptr_t hwnd, uint32_t attr, void *value, uint32_t size)'
    ) as SetAttr
  } catch (err) {
    console.warn('[window-border] dwmapi unavailable:', err)
  }
  return setAttr
}

function apply(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const fn = dwmSetWindowAttribute()
  if (!fn) return
  const handle = win.getNativeWindowHandle()
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0))
  const color = Buffer.alloc(4)
  color.writeUInt32LE(DWMWA_COLOR_NONE)
  fn(hwnd, DWMWA_BORDER_COLOR, color, 4)
}

// Setting it once is not enough: Electron (>= 37, NativeWindowViews::UpdateWindowAccentColor)
// rewrites DWMWA_BORDER_COLOR on every activation change and on accent/theme setting changes,
// right after emitting 'focus'/'blur'. So re-apply on those, deferred past Electron's write.
// accentColor: false doesn't help — it sets DWMWA_COLOR_DEFAULT, which is the accent border
// when the setting is on. Don't swap this for thickFrame: false: that also drops the shadow,
// rounded corners and Snap. Windows 10 ignores attribute 34 — harmless.
export function removeWindowBorder(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  const later = (): void => {
    setImmediate(() => apply(win))
  }
  apply(win)
  win.on('show', later)
  win.on('focus', later)
  win.on('blur', later)
  win.hookWindowMessage(WM_DWMCOLORIZATIONCOLORCHANGED, later)
  win.hookWindowMessage(WM_SETTINGCHANGE, later)
}
