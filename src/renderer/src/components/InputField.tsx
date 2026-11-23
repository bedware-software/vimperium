// @bedware/ui's InputField with Vim's mode on it, for the keyboard popups —
// the address editor, Find in Page, the Command Palette, the pickers: the
// mode's cap at its right end and the mode's light round its edge.

import { InputField as Field, type InputFieldProps } from '@bedware/ui'
import { cn } from '../lib/utils'
import type { VimMode } from '../lib/vim-mode'
import { VimModeBadge } from './VimModeBadge'
import { ModeEdge } from './ModeEdge'

interface Props extends InputFieldProps {
  /** Null while Vim mode is off, or for a field that has no modes. */
  mode: VimMode | null
  /** Keys typed so far of an unfinished sequence. */
  pending?: string
  /** The address's own field: the mode's light runs round its edge by
   *  default, not only with Settings' "every field". */
  addressBar?: boolean
}

export function InputField({ mode, pending, addressBar = false, trailing, boxClassName, ...field }: Props) {
  return (
    <Field
      {...field}
      boxClassName={cn(mode && 'pr-0', boxClassName)}
      trailing={mode || trailing ? <>{trailing}{mode && <VimModeBadge mode={mode} pending={pending} size="field" />}</> : undefined}
    >
      <ModeEdge mode={mode} addressBar={addressBar} />
    </Field>
  )
}
