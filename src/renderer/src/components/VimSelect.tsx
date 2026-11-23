// @bedware/ui's Select with Vim's form keys (lib/vim-form.ts) on it: closed,
// h / l step its value; open, the form's keys go to the list, as the
// keyboard never leaves the form's window in Vim mode.

import { useContext, useEffect, useRef, useState } from 'react'
import { Select, type SelectHandle, type SelectOption } from '@bedware/ui'
import { VimFormContext, setItemStepper } from '../lib/vim-form'

export type VimSelectOption<T extends string> = SelectOption<T>

interface Props<T extends string> {
  value: T
  options: ReadonlyArray<SelectOption<T>>
  onChange: (value: T) => void
  /** What's being chosen, for screen readers. */
  label: string
  title?: string
  disabled?: boolean
  /** Its data-vim-item id, for Vim's form keys. */
  vimItem?: string
  className?: string
}

export function VimSelect<T extends string>({ vimItem, ...select }: Props<T>) {
  const form = useContext(VimFormContext)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const handle = useRef<SelectHandle>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const el = triggerRef.current
    if (!el) return
    setItemStepper(el, (delta) => handle.current?.step(delta))
    return () => setItemStepper(el, null)
  }, [])

  useEffect(() => {
    if (!open || !form) return
    return form.openOverlay({
      command: (command) => {
        const list = handle.current
        switch (command) {
          case 'cursor-down':
          case 'value-next':
            list?.move(1)
            break
          case 'cursor-up':
          case 'value-prev':
            list?.move(-1)
            break
          case 'half-page-down':
          case 'value-next-big':
            list?.move(5)
            break
          case 'half-page-up':
          case 'value-prev-big':
            list?.move(-5)
            break
          case 'cursor-first':
            list?.moveTo('first')
            break
          case 'cursor-last':
            list?.moveTo('last')
            break
          case 'activate':
          case 'toggle':
            list?.pick(false)
            break
        }
        // Whatever else the form's keys would do waits till the list closes.
        return true
      },
      escape: () => handle.current?.close(false),
    })
  }, [open, form])

  return (
    <Select
      {...select}
      ref={triggerRef}
      handle={handle}
      onOpenChange={setOpen}
      data-vim-item={vimItem}
      data-vim-kind="select"
    />
  )
}
