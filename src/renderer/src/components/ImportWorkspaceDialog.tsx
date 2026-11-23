import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Folder, Import, Layers } from 'lucide-react'
import type { WorkspaceCandidate } from '../store/types'
import { DetachedWindow } from './DetachedWindow'
import { vimKeyCaps } from './KeyHints'
import { useChecklistKeys } from '../lib/dialog-keys'
import { useWindowVimKeymap } from '../lib/window-vim-keymap'
import { Button, Checkbox, Hint, HintBar, Dot } from '@bedware/ui'

/** The keys of Import's and Export's lists (lib/dialog-keys.ts
 *  useChecklistKeys), along the bottom: Vim mode's when it's on. */
export function ChecklistHints({ vim, confirmLabel }: { vim: boolean; confirmLabel: string }) {
  const parsed = useWindowVimKeymap()
  const move = vim && parsed ? vimKeyCaps(parsed.main, 'scroll-down', 'scroll-up') : []
  const fold = vim && parsed ? vimKeyCaps(parsed.main, 'forward', 'back') : []
  return (
    <HintBar>
      <Hint label="Move" keys={move.length ? move : ['↓', '↑']} />
      <Hint label="Tick" keys={['Space']} />
      <Hint label="Preview" keys={fold.length ? fold : ['→', '←']} />
      <Hint label={confirmLabel} keys={['Enter']} />
      <Hint label="Close" keys={['Esc']} />
    </HintBar>
  )
}

interface Props {
  open: boolean
  candidates: WorkspaceCandidate[]
  onConfirm: (selected: WorkspaceCandidate[]) => void
  onCancel: () => void
}

export function ImportWorkspaceDialog({ open, candidates, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Reset selection state whenever a fresh set of candidates arrives.
  useEffect(() => {
    if (!open) return
    setSelected(new Set(candidates.map((c) => c.id)))
    setExpanded(new Set())
    setTimeout(() => confirmRef.current?.focus(), 50)
  }, [open, candidates])

  const allSelected = candidates.length > 0 && selected.size === candidates.length
  const noneSelected = selected.size === 0

  const totals = useMemo(() => {
    let tabs = 0
    let groups = 0
    for (const c of candidates) {
      if (!selected.has(c.id)) continue
      tabs += c.tabs.length
      for (const g of c.tabGroups) tabs += g.tabs.length
      groups += c.tabGroups.length
    }
    return { tabs, groups }
  }, [selected, candidates])

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (): void => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(candidates.map((c) => c.id)))
  }

  const handleImport = (): void => {
    const picked = candidates.filter((c) => selected.has(c.id))
    if (picked.length === 0) return
    onConfirm(picked)
  }

  // The keyboard: a cursor through the workspaces (lib/dialog-keys.ts).
  const [popup, setPopup] = useState<Window | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const keys = useChecklistKeys({
    popup,
    open,
    count: candidates.length,
    onToggle: (i) => { if (candidates[i]) toggleSelect(candidates[i].id) },
    onFold: (i, unfold) => {
      const c = candidates[i]
      if (c && expanded.has(c.id) !== unfold) toggleExpand(c.id)
    },
    onConfirm: handleImport,
    defaultButton: confirmRef,
  })
  useEffect(() => {
    listRef.current?.querySelector(`[data-row-index="${keys.cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [keys.cursor])

  if (!open) return null

  return (
    <DetachedWindow
      open={open}
      title="Import Workspaces - Vimperium"
      width={560}
      height={560}
      onClose={onCancel}
      onWindowChange={setPopup}
    >
      <div className="h-full bg-popover text-popover-foreground border border-border rounded-lg overflow-hidden flex flex-col">
        <div
          data-detached-drag-handle
          className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0"
        >
          <Import size={16} className="text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Import Workspaces</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {candidates.length === 0
                ? 'No valid workspaces found in this file.'
                : `${candidates.length} workspace${candidates.length === 1 ? '' : 's'} found — open one to preview it`}
            </div>
          </div>
          {candidates.length > 0 && (
            <Button variant="ghost"
              data-detached-no-drag
              onClick={toggleAll}
              className="shrink-0"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          )}
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {candidates.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              This file does not contain any folders that match a workspace
              shape (tabs and at most one level of tab-group folders).
            </div>
          )}
          {candidates.map((c, index) => {
            const isSelected = selected.has(c.id)
            const isExpanded = expanded.has(c.id)
            const tabCount = c.tabs.length + c.tabGroups.reduce((n, g) => n + g.tabs.length, 0)
            return (
              <div key={c.id} className="px-2">
                <div
                  data-row-index={index}
                  className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer ${
                    isSelected ? 'bg-accent/40' : 'hover:bg-accent/30'
                  } ${keys.shown && keys.cursor === index ? 'ring-1 ring-inset ring-primary' : ''}`}
                  onMouseDown={() => keys.setCursor(index)}
                  onClick={() => toggleExpand(c.id)}
                >
                  <Checkbox
                    aria-label={`Select ${c.name}`}
                    checked={isSelected}
                    // The row's own click folds it.
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                    onChange={() => toggleSelect(c.id)}
                    // A button: useChecklistKeys leaves it its Enter, which
                    // would tick; Enter goes ahead from anywhere in the list.
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.metaKey || e.altKey || e.ctrlKey) return
                      e.preventDefault()
                      handleImport()
                    }}
                  />
                  <ChevronRight
                    size={14}
                    className={`text-muted-foreground shrink-0 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                  <Folder size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.path}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    {c.tabGroups.length} group{c.tabGroups.length === 1 ? '' : 's'} · {tabCount} tab{tabCount === 1 ? '' : 's'}
                  </div>
                </div>
                {isExpanded && (() => {
                  const tabMap = new Map(c.tabs.map((t) => [t.id, t]))
                  const groupMap = new Map(c.tabGroups.map((g) => [g.id, g]))
                  return (
                    <div className="ml-8 mb-1 pl-2 border-l border-border/60">
                      {c.sidebarOrder.map((id) => {
                        const tab = tabMap.get(id)
                        if (tab) {
                          return (
                            <div
                              key={tab.id}
                              className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground"
                              title={tab.url}
                            >
                              <Dot className="shrink-0" />
                              <span className="truncate">{tab.title}</span>
                            </div>
                          )
                        }
                        const group = groupMap.get(id)
                        if (!group) return null
                        return (
                          <div key={group.id} className="py-1">
                            <div className="flex items-center gap-2 px-2 text-[11px] text-foreground">
                              <Layers size={11} className="shrink-0" style={{ color: group.color }} />
                              <span className="truncate">{group.name}</span>
                              <span className="text-muted-foreground ml-auto shrink-0">
                                {group.tabs.length} tab{group.tabs.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <div className="ml-5 mt-0.5">
                              {group.tabs.map((t) => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 px-2 py-0.5 text-[11px] text-muted-foreground"
                                  title={t.url}
                                >
                                  <Dot className="shrink-0" />
                                  <span className="truncate">{t.title}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>

        <div
          data-detached-drag-handle
          className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border shrink-0"
        >
          <div className="text-[10px] text-muted-foreground">
            {noneSelected
              ? 'Select workspaces to import'
              : `${selected.size} selected · ${totals.groups} groups · ${totals.tabs} tabs`}
          </div>
          <div className="flex gap-2" data-detached-no-drag>
            <Button variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button variant="primary"
              ref={confirmRef}
              onClick={handleImport}
              disabled={noneSelected}
            >
              Import {noneSelected ? '' : `(${selected.size})`}
            </Button>
          </div>
        </div>
        <ChecklistHints vim={keys.vim} confirmLabel="Import" />
      </div>
    </DetachedWindow>
  )
}
