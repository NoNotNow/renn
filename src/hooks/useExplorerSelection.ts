import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { RennWorld } from '@/types/world'
import { sliceEntityIdsInRange } from '@/utils/builderEntityRangeSelection'
import { uiLogger } from '@/utils/uiLogger'

export interface ExplorerEntitySelectOptions {
  additive?: boolean
  range?: boolean
  orderedVisibleEntityIds?: readonly string[]
}

export interface UseExplorerSelectionParams {
  recordEntityWorkHistory: (entityId: string) => void
}

export interface UseExplorerSelectionResult {
  selectedEntityIds: string[]
  selectedGroupIds: string[]
  setSelectedEntityIds: Dispatch<SetStateAction<string[]>>
  setSelectedGroupIds: Dispatch<SetStateAction<string[]>>
  /** Anchor for Shift-range selection in the entity explorer (Explorer-style lists). */
  selectionAnchorEntityIdRef: MutableRefObject<string | null>
  handleSelectEntity: (
    id: string | null,
    options?: ExplorerEntitySelectOptions,
  ) => void
  /** Escape / keyboard clear — does not log (matches Builder keyboard shortcut). */
  clearSelection: () => void
  /** Drop entity/group ids that no longer exist after undo/redo world snapshot. */
  reconcileAfterSnapshot: (world: Pick<RennWorld, 'entities' | 'groups'>) => void
}

export function useExplorerSelection({
  recordEntityWorkHistory,
}: UseExplorerSelectionParams): UseExplorerSelectionResult {
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const selectionAnchorEntityIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (selectedEntityIds.length === 0) {
      selectionAnchorEntityIdRef.current = null
    } else if (selectedEntityIds.length === 1) {
      selectionAnchorEntityIdRef.current = selectedEntityIds[0]!
    }
  }, [selectedEntityIds])

  const clearSelection = useCallback(() => {
    selectionAnchorEntityIdRef.current = null
    setSelectedEntityIds([])
    setSelectedGroupIds([])
  }, [])

  const handleSelectEntity = useCallback(
    (id: string | null, options?: ExplorerEntitySelectOptions) => {
      const additive = Boolean(options?.additive)
      const range = Boolean(options?.range)
      const order = options?.orderedVisibleEntityIds

      if (id === null) {
        clearSelection()
        uiLogger.click('Builder', 'Clear entity selection', {})
        return
      }

      recordEntityWorkHistory(id)

      if (range && order && order.length > 0) {
        setSelectedGroupIds([])
        setSelectedEntityIds((prev) => {
          const anchorId = selectionAnchorEntityIdRef.current ?? prev[0] ?? id
          return sliceEntityIdsInRange(order, anchorId, id)
        })
        uiLogger.click('Builder', 'Select entity', { entityId: id, range: true })
        return
      }

      if (!additive) {
        selectionAnchorEntityIdRef.current = id
        setSelectedGroupIds([])
        setSelectedEntityIds([id])
        uiLogger.click('Builder', 'Select entity', { entityId: id, additive: false })
        return
      }

      setSelectedEntityIds((prev) => {
        const idx = prev.indexOf(id)
        if (idx >= 0) return prev.filter((x) => x !== id)
        return [...prev, id]
      })
      uiLogger.click('Builder', 'Select entity', { entityId: id, additive: true })
    },
    [clearSelection, recordEntityWorkHistory],
  )

  const reconcileAfterSnapshot = useCallback((world: Pick<RennWorld, 'entities' | 'groups'>) => {
    setSelectedEntityIds((ids) => ids.filter((id) => world.entities.some((e) => e.id === id)))
    setSelectedGroupIds((gids) =>
      gids.filter((gid) => (world.groups ?? []).some((g) => g.id === gid)),
    )
  }, [])

  return {
    selectedEntityIds,
    selectedGroupIds,
    setSelectedEntityIds,
    setSelectedGroupIds,
    selectionAnchorEntityIdRef,
    handleSelectEntity,
    clearSelection,
    reconcileAfterSnapshot,
  }
}
