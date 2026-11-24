// The app's mark, the app icon's drawing. Its glitch is .brand-mark in globals.css.

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Its side in px. Under 32 it is the icon's simplified drawing. */
  size: number
  glitchOnHover?: boolean
  glitchOnMount?: boolean
  /** A change of it glitches the mark once. */
  glitchKey?: string | number | null
}

// Copied from bedware-design/brand/icons/vimperium-s3-win.svg and
// vimperium-s3-win-small.svg (built by its tools/build-icons.mjs): redraw there,
// then copy here. The colours are the mark's own, not theme tokens.
const ART_SCALE = 'scale(1.24272)'

function FullArt() {
  return (
    <svg viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="#000000" />
      <g transform={ART_SCALE}>
        <polygon points="120,110 292,200 412,548 532,200 704,110 474,736 350,736" fill="#ffde5d" />
        <polygon points="120,110 206,155 412,642 412,736 350,736" fill="#e5c440" />
        <polygon points="704,110 618,155 412,642 412,736 474,736" fill="#b7974e" />
        <polygon points="96,590 400,452 736,300 440,486" fill="#ffbf68" />
      </g>
    </svg>
  )
}

function SmallArt() {
  return (
    <svg viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="#000000" />
      <g transform={ART_SCALE}>
        <polygon points="60,90 280,190 412,520 544,190 764,90 490,760 334,760" fill="#ffde5d" />
        <polygon points="60,90 170,140 412,640 412,760 334,760" fill="#e5c440" />
        <polygon points="764,90 654,140 412,640 412,760 490,760" fill="#b7974e" />
      </g>
    </svg>
  )
}

export function BrandMark({ size, glitchOnHover = false, glitchOnMount = false, glitchKey = null }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const first = useRef(true)
  const [hovers, setHovers] = useState(0)

  useEffect(() => {
    if (first.current) {
      first.current = false
      if (!glitchOnMount) return
    }
    const el = ref.current
    // The mark's own window: Settings → About is a window of its own.
    if (!el || el.ownerDocument.documentElement.hasAttribute('data-window-inactive')) return
    // Restart the animation even if the last burst is still running.
    el.removeAttribute('data-glitch')
    void el.offsetWidth
    el.setAttribute('data-glitch', '')
    const t = setTimeout(() => el.removeAttribute('data-glitch'), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glitchKey, hovers])

  const Art = size < 32 ? SmallArt : FullArt
  return (
    <span
      ref={ref}
      className="brand-mark"
      aria-hidden="true"
      style={{ width: size, height: size }}
      onPointerEnter={glitchOnHover ? () => setHovers((n) => n + 1) : undefined}
    >
      {/* Three copies: the glitch tears them apart. */}
      <Art />
      <Art />
      <Art />
    </span>
  )
}
