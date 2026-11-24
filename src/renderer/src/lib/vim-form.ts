// Vim keys for a form (Settings): @bedware/ui's mechanism (its vim-form
// entry), with the app's log for its warnings and Settings' close warning.

import { useCallback, useRef, useState } from 'react'
import { useVimForm as useVimFormIn, type VimFormController } from '@bedware/ui/vim-form'
import { log } from './log'

export {
  VimFormController, VimFormContext, useVimFormSnapshot, useVimFormLabelCount, setItemStepper,
  inferItemKind, stepIndex, stepRangeValue, nearestCell,
  type VimItemKind, type KindSource, type VimFormOverlay, type VimFormSnapshot,
} from '@bedware/ui/vim-form'

export function useVimForm(options: Omit<Parameters<typeof useVimFormIn>[0], 'warn'>): VimFormController {
  return useVimFormIn({ ...options, warn: log.warn })
}

/**
 * A form's "there are unsaved changes" warning, which closing shows first.
 * Once set it stays up until the form changes (`draft`, what Save would
 * keep), however the change was made: a key, the mouse, typing. So a second
 * close throws the changes away only when nothing changed since the
 * warning, and an edit made after it gets a fresh warning.
 */
export function useCloseWarning(draft: string): [boolean, (on: boolean) => void] {
  // The draft as it was when the warning went up.
  const [warnedDraft, setWarnedDraft] = useState<string | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  // Changed since: down, in this render, before anything reads it.
  if (warnedDraft !== null && warnedDraft !== draft) setWarnedDraft(null)
  const setWarning = useCallback((on: boolean) => setWarnedDraft(on ? draftRef.current : null), [])
  return [warnedDraft !== null && warnedDraft === draft, setWarning]
}
