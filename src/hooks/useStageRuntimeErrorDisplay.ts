import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  getCustomTransformerRuntimeErrors,
  runtimeErrorTargetKey,
  subscribeCustomTransformerRuntimeError,
  type CustomTransformerRuntimeErrorSnapshot,
} from '@/runtime/customTransformerErrorBridge'
import type { TransformerRuntimeErrorDisplay } from '@/components/workspace/TransformerCodeErrorOverlay'

/** Grace period a cleared runtime error stays on screen, dimmed, before it is dropped. */
export const STAGE_RUNTIME_ERROR_KEEP_MS = 10_000

export interface StageRuntimeErrorDisplay {
  /** Live error for the current selection. Identity is stable while its fields are unchanged. */
  error: TransformerRuntimeErrorDisplay | null
  /** What to render: the live error, or the last one during its keep window. */
  displayed: TransformerRuntimeErrorDisplay | null
  /** False while a kept error is shown after the runtime stopped reporting it (render dimmed). */
  active: boolean
  /** True when any selected entity has a runtime error at `flatStackIndex` (stage card badges). */
  hasErrorAt: (flatStackIndex: number) => boolean
}

/**
 * Runtime errors published by custom transformers, projected onto the selected stage.
 *
 * `entityIds` is the current selection; `flatStackIndex` is the index in `entity.transformers`
 * (the runtime's `configStackIndex`). Both are used as memo inputs, so pass the same array
 * instance the caller already memoises.
 *
 * A live error renders at full opacity for as long as the runtime keeps reporting it; once the
 * runtime clears it, the message stays dimmed for {@link STAGE_RUNTIME_ERROR_KEEP_MS} so an error
 * from a single bad frame is still readable.
 */
export function useStageRuntimeErrorDisplay(
  entityIds: string[],
  flatStackIndex: number,
): StageRuntimeErrorDisplay {
  const errorsByTarget = useSyncExternalStore(
    subscribeCustomTransformerRuntimeError,
    getCustomTransformerRuntimeErrors,
    () => new Map(),
  )

  /** Downstream memos key off this identity, so an unchanged error must return the same object. */
  const lastErrorRef = useRef<TransformerRuntimeErrorDisplay | null>(null)
  const error = useMemo(() => {
    let snapshot: CustomTransformerRuntimeErrorSnapshot | undefined
    for (const entityId of entityIds) {
      const err = errorsByTarget.get(runtimeErrorTargetKey(entityId, flatStackIndex))
      if (err) {
        snapshot = err
        break
      }
    }

    if (snapshot == null) {
      lastErrorRef.current = null
      return null
    }

    const next: TransformerRuntimeErrorDisplay = {
      message: snapshot.message,
      stack: snapshot.stack,
      code: snapshot.code,
      lineNumber: snapshot.lineNumber,
    }

    const last = lastErrorRef.current
    if (
      last &&
      last.message === next.message &&
      last.stack === next.stack &&
      last.code === next.code &&
      last.lineNumber === next.lineNumber
    ) {
      return last
    }

    lastErrorRef.current = next
    return next
  }, [errorsByTarget, entityIds, flatStackIndex])

  const [displayed, setDisplayed] = useState<TransformerRuntimeErrorDisplay | null>(error)
  const displayedRef = useRef(displayed)
  displayedRef.current = displayed
  const keepTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (error) {
      if (keepTimerRef.current != null) {
        window.clearTimeout(keepTimerRef.current)
        keepTimerRef.current = null
      }
      setDisplayed(error)
      return
    }
    // Live traces re-run this effect often, so an armed keep timer must never be restarted.
    if (displayedRef.current == null || keepTimerRef.current != null) return
    keepTimerRef.current = window.setTimeout(() => {
      keepTimerRef.current = null
      setDisplayed(null)
    }, STAGE_RUNTIME_ERROR_KEEP_MS)
  }, [error])

  useEffect(() => {
    return () => {
      if (keepTimerRef.current != null) window.clearTimeout(keepTimerRef.current)
    }
  }, [])

  const hasErrorAt = useCallback(
    (flatIdx: number) => entityIds.some((id) => errorsByTarget.has(runtimeErrorTargetKey(id, flatIdx))),
    [errorsByTarget, entityIds],
  )

  return useMemo(
    () => ({ error, displayed, active: error != null, hasErrorAt }),
    [error, displayed, hasErrorAt],
  )
}
