import { Button, IconButton, Progress } from '@bedware/ui'
import { useEffect, useRef, type ReactNode } from 'react'
import { Download, RefreshCw, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

export type UpdateToastStatus =
  | { phase: 'checking' }
  | { phase: 'not-available'; version: string }
  | { phase: 'available'; version: string; releaseNotes?: string | null }
  | { phase: 'downloading'; version: string; percent: number; bytesPerSecond: number }
  | { phase: 'downloaded'; version: string; releaseNotes?: string | null }
  | { phase: 'error'; message: string }

export function UpdateToastContent({
  status,
  onClose,
  onInstall,
  onMeasured,
}: {
  status: UpdateToastStatus
  onClose: () => void
  onInstall: () => void
  onMeasured?: (size: { width: number; height: number }) => void
}): React.JSX.Element {
  if (status.phase === 'checking') {
    return (
      <Shell onClose={onClose} onMeasured={onMeasured}>
        <Loader2 size={16} className="text-muted-foreground shrink-0 animate-spin" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Checking for updates...</div>
        </div>
      </Shell>
    )
  }

  if (status.phase === 'not-available') {
    return (
      <Shell onClose={onClose} onMeasured={onMeasured}>
        <CheckCircle2 size={16} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">You're up to date</div>
          <div className="text-[11px] text-muted-foreground">Running v{status.version}</div>
        </div>
      </Shell>
    )
  }

  if (status.phase === 'error') {
    return (
      <Shell onClose={onClose} onMeasured={onMeasured}>
        <AlertTriangle size={16} className="text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Update check failed</div>
          <div className="text-[11px] text-muted-foreground truncate" title={status.message}>
            {status.message}
          </div>
        </div>
      </Shell>
    )
  }

  if (status.phase === 'available') {
    return (
      <Shell onClose={onClose} onMeasured={onMeasured}>
        <Download size={16} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Update available</div>
          <div className="text-[11px] text-muted-foreground">
            v{status.version} - downloading...
          </div>
        </div>
      </Shell>
    )
  }

  if (status.phase === 'downloading') {
    return (
      <Shell onClose={onClose} onMeasured={onMeasured}>
        <Download size={16} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Downloading update</div>
          <Progress label="Downloading update" value={status.percent} className="mt-1 w-full" />
          <div className="text-[11px] text-muted-foreground mt-1">
            v{status.version} - {status.percent}%
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell onClose={onClose} onMeasured={onMeasured}>
      <CheckCircle2 size={16} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">Update ready</div>
        <div className="text-[11px] text-muted-foreground">
          v{status.version} will install on quit, or restart now.
        </div>
      </div>
      <Button variant="primary"
        onClick={onInstall}
        className="shrink-0"
      >
        <RefreshCw size={12} />
        Restart
      </Button>
    </Shell>
  )
}

function Shell({
  children,
  onClose,
  onMeasured,
}: {
  children: ReactNode
  onClose: () => void
  onMeasured?: (size: { width: number; height: number }) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !onMeasured) return
    let lastW = 0
    let lastH = 0
    const measure = (): void => {
      const w = Math.max(el.offsetWidth, el.scrollWidth)
      const h = Math.max(el.offsetHeight, el.scrollHeight)
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h
      onMeasured({ width: w, height: h })
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [onMeasured])

  return (
    <div
      ref={ref}
      className="w-80 max-w-full bg-popover border border-border rounded-lg shadow-lg p-3 flex items-start gap-2"
    >
      {children}
      <IconButton size={20}
        onClick={onClose}
        label="Dismiss"
        className="shrink-0"
      >
        <X size={12} />
      </IconButton>
    </div>
  )
}
