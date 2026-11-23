// "Are you sure?" in a popup of its own: @bedware/ui's dialog filling a
// DetachedWindow. Its keys (Enter, y, n, Esc) are the dialog's own.

import { ConfirmDialog as Dialog } from '@bedware/ui'
import { DetachedWindow } from './DetachedWindow'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  tone?: 'destructive' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, tone, onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    // Esc is the dialog's: closing on it here too would cancel twice.
    <DetachedWindow open={open} title={title} width={460} height={260} resizable={false} closeOnEscape={false} onClose={onCancel}>
      <Dialog open title={title} message={message} confirmLabel={confirmLabel} tone={tone} onConfirm={onConfirm} onCancel={onCancel} placement="window" />
    </DetachedWindow>
  )
}
