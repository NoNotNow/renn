import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import { pushEntityWorkHistory, pruneEntityWorkHistory } from '@/utils/entityWorkHistory'

export interface UseEntityWorkHistoryOptions {
  /** Called when MRU history changes from user selection (not load/reset/prune-only). */
  onDirty?: () => void
}

export interface UseEntityWorkHistoryResult {
  entityWorkHistory: string[]
  entityWorkHistoryRef: MutableRefObject<string[]>
  recordEntityWorkHistory: (entityId: string) => void
  /** Replace history from persistence; prunes to entities that exist in the loaded world. */
  replaceFromLoaded: (loaded: string[] | undefined, validIds: ReadonlySet<string>) => void
  reset: () => void
  /** Drop history entries for deleted entities; does not mark dirty (caller may already). */
  pruneToValidEntities: (validIds: ReadonlySet<string>) => void
}

/**
 * Per-project MRU entity ids for EntitySearchPicker (persisted on the project row, not in world JSON).
 */
export function useEntityWorkHistory({ onDirty }: UseEntityWorkHistoryOptions = {}): UseEntityWorkHistoryResult {
  const [entityWorkHistory, setEntityWorkHistory] = useState<string[]>([])
  const entityWorkHistoryRef = useRef<string[]>([])
  const onDirtyRef = useRef(onDirty)
  onDirtyRef.current = onDirty

  const sync = useCallback((next: string[]) => {
    entityWorkHistoryRef.current = next
    setEntityWorkHistory(next)
  }, [])

  const recordEntityWorkHistory = useCallback(
    (entityId: string) => {
      const next = pushEntityWorkHistory(entityWorkHistoryRef.current, entityId)
      if (next.join('\0') === entityWorkHistoryRef.current.join('\0')) return
      sync(next)
      onDirtyRef.current?.()
    },
    [sync],
  )

  const replaceFromLoaded = useCallback(
    (loaded: string[] | undefined, validIds: ReadonlySet<string>) => {
      sync(pruneEntityWorkHistory(loaded ?? [], validIds))
    },
    [sync],
  )

  const reset = useCallback(() => {
    sync([])
  }, [sync])

  const pruneToValidEntities = useCallback(
    (validIds: ReadonlySet<string>) => {
      const pruned = pruneEntityWorkHistory(entityWorkHistoryRef.current, validIds)
      if (pruned.length !== entityWorkHistoryRef.current.length) {
        sync(pruned)
      }
    },
    [sync],
  )

  return {
    entityWorkHistory,
    entityWorkHistoryRef,
    recordEntityWorkHistory,
    replaceFromLoaded,
    reset,
    pruneToValidEntities,
  }
}
