import { useCallback, useEffect, useRef, useState } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import { effectiveCustomTransformerCode } from '@/transformers/customCodeTransformer'

/** Debounce before committing custom transformer Monaco edits to the world. */
export const TRANSFORMER_CODE_DEBOUNCE_MS = 350

export interface TransformerCodeDraftFlushContext {
  selectedId: string | null
  registryIds: string[]
  configs: TransformerConfig[]
}

export interface TransformerCodeDraftTimerDeps {
  setTimer?: (fn: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}

export interface UseTransformerCodeDraftParams {
  syncCodeKey: string
  selectedConfig: TransformerConfig | null
  selectedId: string | null
  getFlushContext: () => TransformerCodeDraftFlushContext
  onCommit: (text: string) => void
  undo?: { pushBeforeEdit(): void } | null
  debounceMs?: number
  timers?: TransformerCodeDraftTimerDeps
}

export interface TransformerCodeDraftResult {
  codeDraft: string
  handleCodeChange: (text: string) => void
  flushPendingCode: () => void
}

/**
 * Local Monaco draft for a custom transformer stage: sync from world on selection change,
 * debounced commit, and flush-before-navigation.
 */
export function useTransformerCodeDraft({
  syncCodeKey,
  selectedConfig,
  selectedId,
  getFlushContext,
  onCommit,
  undo,
  debounceMs = TRANSFORMER_CODE_DEBOUNCE_MS,
  timers = {},
}: UseTransformerCodeDraftParams): TransformerCodeDraftResult {
  const timerDepsRef = useRef(timers)
  timerDepsRef.current = timers
  const setTimer = useCallback(
    (fn: () => void, ms: number) =>
      (timerDepsRef.current.setTimer ?? ((f, d) => window.setTimeout(f, d)))(fn, ms),
    [],
  )
  const clearTimer = useCallback(
    (id: number) => (timerDepsRef.current.clearTimer ?? ((i) => window.clearTimeout(i)))(id),
    [],
  )

  const [codeDraft, setCodeDraft] = useState('')
  const debounceTimerRef = useRef<number | null>(null)
  const codeDraftRef = useRef(codeDraft)
  codeDraftRef.current = codeDraft
  const codeUndoPrimedRef = useRef(false)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const getFlushContextRef = useRef(getFlushContext)
  getFlushContextRef.current = getFlushContext
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const selectedConfigRef = useRef(selectedConfig)
  selectedConfigRef.current = selectedConfig

  const flushPendingCode = useCallback(() => {
    if (debounceTimerRef.current != null) {
      clearTimer(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const ctx = getFlushContextRef.current()
    const sid = selectedIdRef.current
    const idx = ctx.registryIds.indexOf(sid ?? '')
    if (idx < 0 || ctx.configs[idx]?.type !== 'custom') return
    const text = codeDraftRef.current
    const prevEffective = effectiveCustomTransformerCode(ctx.configs[idx]!)
    if (text === prevEffective) return
    onCommitRef.current(text)
  }, [clearTimer])

  useEffect(() => {
    if (debounceTimerRef.current != null) {
      clearTimer(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const config = selectedConfigRef.current
    if (config?.type !== 'custom') {
      setCodeDraft('')
      return
    }
    const worldCode = effectiveCustomTransformerCode(config)
    if (codeDraftRef.current === worldCode) return
    setCodeDraft(worldCode)
    codeUndoPrimedRef.current = false
  }, [syncCodeKey, clearTimer])

  const scheduleCodeCommit = useCallback(
    (text: string) => {
      if (debounceTimerRef.current != null) clearTimer(debounceTimerRef.current)
      debounceTimerRef.current = setTimer(() => {
        debounceTimerRef.current = null
        onCommitRef.current(text)
      }, debounceMs)
    },
    [clearTimer, debounceMs, setTimer],
  )

  const handleCodeChange = useCallback(
    (text: string) => {
      if (!codeUndoPrimedRef.current) {
        undo?.pushBeforeEdit()
        codeUndoPrimedRef.current = true
      }
      setCodeDraft(text)
      scheduleCodeCommit(text)
    },
    [scheduleCodeCommit, undo],
  )

  return { codeDraft, handleCodeChange, flushPendingCode }
}
