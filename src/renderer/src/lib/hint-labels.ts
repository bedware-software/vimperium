// Vimium-style hints for Vim mode's lists: in COMMAND each row wears a
// label of one, two or three letters, as few as the rows allow — home-row
// letters first, and only letters the list's
// keymap leaves free, so a label never shadows a command — and typing it
// picks the row. The labels go into the keymap as `hint-<n>` commands, so
// the usual sequencer runs them (the first letter shows as pending until the
// second comes, however long after; Esc drops it) — in a popup, in the
// window, and in a tab's page, which runs the window's COMMAND keys itself.
//
// In the main window several things can wear labels at once: each (the
// group page) registers its rows here with useHintTargets, App numbers them
// all in one go (useHintKeymap) and runs the picked one.
//
// A label says what it names where it can: drawn from the row's name —
// "work" w, "fun" f, "Ubuntu" ub, "Тестовое собеседование" ts — from the
// letters the keymap leaves free, else the next free label in reach order.
// A row keeps the label it had while its name still gives it. And one thing
// wears one label: a tab listed both in the Sidebar and on its group's page
// registers under one id ("tab:<id>") from each, and the two rows show the
// same label.

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { hintAlphabet, hintLabels, withHints } from '@bedware/ui/vim-form'
import type { VimKeymap } from '../../../shared/vim-keys'

// The labels themselves — the letters, a row's label from its name, a popup's
// rows — are @bedware/ui's; the main window's registry below is the app's.
export { hintAlphabet, hintLabels, withHints, hintIndex, usePopupHints, type HintName } from '@bedware/ui/vim-form'

// Keys a page drawn in the page area keeps for itself ahead of the keymap
// (lib/vim-mode.ts usePageKeys' intercept — c on a group's page, w g t p on
// Search Everything): no label starts with one while the page is up, or
// typing the label would run the page's key instead.
const reservedKeys = new Map<object, readonly string[]>()
const reservedListeners = new Set<() => void>()
let reservedSnapshot = ''

function rebuildReserved(): void {
  const next = [...new Set([...reservedKeys.values()].flat())].sort().join('')
  if (next === reservedSnapshot) return
  reservedSnapshot = next
  reservedListeners.forEach((l) => l())
}

/** Keeps `keys` (single letters) out of the labels while the caller is
 *  mounted. */
export function useReservedHintKeys(keys: readonly string[]): void {
  const joined = keys.join('')
  useEffect(() => {
    if (!joined) return
    const token = {}
    reservedKeys.set(token, [...joined])
    rebuildReserved()
    return () => {
      reservedKeys.delete(token)
      rebuildReserved()
    }
  }, [joined])
}

// ── The main window's hint targets ──

export interface HintTarget {
  /** One per thing: the same thing listed twice ("tab:<id>" in the Sidebar
   *  and on its group's page) registers the same id, and wears one label. */
  id: string
  activate: () => void
  /** What its row reads, for a label that says it. */
  name?: string
}

interface Provider {
  order: number
  targets: HintTarget[]
}

interface TargetSnapshot {
  targets: HintTarget[]
}

const providers = new Map<string, Provider>()
let snapshot: TargetSnapshot = { targets: [] }
const targetListeners = new Set<() => void>()
let labelById = new Map<string, string>()
const labelListeners = new Set<() => void>()

function rebuildTargets(): void {
  const shown = [...providers.values()]
  // A thing listed by two providers is one row to label: the first's.
  const seen = new Set<string>()
  const targets = shown.sort((a, b) => a.order - b.order).flatMap((p) => p.targets).filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
  snapshot = { targets }
  targetListeners.forEach((l) => l())
}

/**
 * Registers `targets` (null: none) as `name`'s rows wanting labels, ahead of
 * providers with a higher `order`. Only a change of which rows (their ids)
 * renumbers; the rows' actions are kept current without one.
 */
export function useHintTargets(name: string, order: number, targets: HintTarget[] | null): void {
  const ids = targets ? targets.map((t) => `${t.id}\t${t.name ?? ''}`).join('\n') : null
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  useEffect(() => {
    const current = targetsRef.current
    if (!current || current.length === 0) return
    // Each one runs whatever its row does at the time it's picked.
    providers.set(name, {
      order,
      targets: current.map((t) => ({ id: t.id, name: t.name, activate: () => targetsRef.current?.find((x) => x.id === t.id)?.activate() })),
    })
    rebuildTargets()
    return () => {
      providers.delete(name)
      rebuildTargets()
    }
  }, [name, order, ids])
}

function useTargetSnapshot(): TargetSnapshot {
  return useSyncExternalStore(
    (l) => {
      targetListeners.add(l)
      return () => { targetListeners.delete(l) }
    },
    () => snapshot,
  )
}

/** Every registered row, in label order (App). */
export function useHintTargetList(): HintTarget[] {
  return useTargetSnapshot().targets
}

/** App: the window's COMMAND keymap with a label on every registered row,
 *  and those labels published for the rows to wear. */
export function useHintKeymap(keymap: VimKeymap | null): { keymap: VimKeymap | null; targets: HintTarget[] } {
  const { targets } = useTargetSnapshot()
  const reserved = useSyncExternalStore(
    (l) => {
      reservedListeners.add(l)
      return () => { reservedListeners.delete(l) }
    },
    () => reservedSnapshot,
  )
  const alphabet = useMemo(
    () => hintAlphabet(keymap).filter((k) => !reserved.includes(k)),
    [keymap, reserved],
  )
  // Each row keeps the label it wore while its name still gives it.
  const previousRef = useRef(new Map<string, string>())
  const labels = useMemo(() => {
    if (!keymap) return []
    return hintLabels(targets.map((t) => t.name), alphabet, targets.map((t) => previousRef.current.get(t.id)))
  }, [keymap, targets, alphabet])
  const merged = useMemo(() => {
    if (!keymap) return null
    return withHints(keymap, labels)
  }, [keymap, labels])
  useEffect(() => {
    const next = new Map<string, string>()
    labels.forEach((label, i) => { if (targets[i]) next.set(targets[i].id, label) })
    labelById = next
    // Merged, not replaced: a row out of sight a while (COMMAND left, a
    // popup up) finds its label again.
    previousRef.current = new Map([...previousRef.current, ...next])
    labelListeners.forEach((l) => l())
  }, [labels, targets])
  return { keymap: merged, targets }
}

/** The labels the registered rows wear now, by their ids. */
export function useHintLabels(): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    (l) => {
      labelListeners.add(l)
      return () => { labelListeners.delete(l) }
    },
    () => labelById,
  )
}
