import { useCallback, useRef, type MutableRefObject } from 'react'
import { applyWorldEdit, type ApplyWorldEditDeps } from '@/editor/applyWorldEdit'
import { useExplorerSelection } from '@/hooks/useExplorerSelection'
import type { RennWorld } from '@/types/world'
import {
  addToGroup,
  createGroupFromSelection,
  dissolveGroup,
  expandGroupSelection,
  findGroupContaining,
  getGroups,
  removeFromGroup,
  renameGroup,
  setGroupCollapsed,
} from '@/utils/entityGroups'
import { uiLogger } from '@/utils/uiLogger'

export type BuilderSelectEntityOptions = {
  additive?: boolean
  range?: boolean
  orderedVisibleEntityIds?: readonly string[]
}

export interface UseBuilderExplorerSelectionParams {
  world: RennWorld
  worldEditDeps: ApplyWorldEditDeps
  recordEntityWorkHistory: (entityId: string) => void
}

export interface UseBuilderExplorerSelectionResult {
  selectedEntityIds: string[]
  selectedGroupIds: string[]
  setSelectedEntityIds: ReturnType<typeof useExplorerSelection>['setSelectedEntityIds']
  setSelectedGroupIds: ReturnType<typeof useExplorerSelection>['setSelectedGroupIds']
  selectionAnchorEntityIdRef: ReturnType<typeof useExplorerSelection>['selectionAnchorEntityIdRef']
  handleSelectEntity: ReturnType<typeof useExplorerSelection>['handleSelectEntity']
  reconcileAfterSnapshot: ReturnType<typeof useExplorerSelection>['reconcileAfterSnapshot']
  handleSelectGroup: (groupId: string, options?: { additive?: boolean }) => void
  handleCreateGroupFromSelection: () => void
  handleUngroup: (groupId: string) => void
  handleAddSelectedToGroup: (groupId: string) => void
  handleRemoveSelectedFromGroup: () => void
  handleToggleGroupCollapsed: (groupId: string, collapsed: boolean) => void
  handleRenameGroup: (groupId: string, name: string) => void
  clearSelection: ReturnType<typeof useExplorerSelection>['clearSelection']
  groupShortcutHandlersRef: MutableRefObject<{
    onGroup: () => void
    onUngroup: () => void
  }>
}

export function useBuilderExplorerSelection({
  world,
  worldEditDeps,
  recordEntityWorkHistory,
}: UseBuilderExplorerSelectionParams): UseBuilderExplorerSelectionResult {
  const {
    selectedEntityIds,
    selectedGroupIds,
    setSelectedEntityIds,
    setSelectedGroupIds,
    selectionAnchorEntityIdRef,
    handleSelectEntity,
    clearSelection,
    reconcileAfterSnapshot,
  } = useExplorerSelection({ recordEntityWorkHistory })

  const handleSelectGroup = useCallback(
    (groupId: string, options?: { additive?: boolean }) => {
      const additive = Boolean(options?.additive)
      const expanded = expandGroupSelection(world, [groupId])
      uiLogger.click('Builder', 'Select group', { groupId, entityCount: expanded.length, additive })
      if (additive) {
        setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]))
        setSelectedEntityIds((prev) => {
          const set = new Set(prev)
          for (const id of expanded) set.add(id)
          return Array.from(set)
        })
      } else {
        selectionAnchorEntityIdRef.current = expanded[0] ?? null
        setSelectedGroupIds([groupId])
        setSelectedEntityIds(expanded)
      }
    },
    [selectionAnchorEntityIdRef, setSelectedEntityIds, setSelectedGroupIds, world],
  )

  const handleCreateGroupFromSelection = useCallback(() => {
    const ids = [...selectedEntityIds, ...selectedGroupIds]
    if (ids.length < 2) return
    let createdGroupId: string | null = null
    applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'none' }, (prev) => {
      const { world: nextWorld, group } = createGroupFromSelection(prev, ids)
      if (!group) return prev
      createdGroupId = group.id
      return nextWorld
    })
    if (createdGroupId) {
      uiLogger.click('Builder', 'Create group', { groupId: createdGroupId, members: ids })
      setSelectedGroupIds([createdGroupId])
    }
  }, [selectedEntityIds, selectedGroupIds, setSelectedGroupIds, worldEditDeps])

  const handleUngroup = useCallback(
    (groupId: string) => {
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'none' }, (prev) => dissolveGroup(prev, groupId))
      setSelectedGroupIds((prev) => prev.filter((id) => id !== groupId))
      uiLogger.click('Builder', 'Ungroup', { groupId })
    },
    [setSelectedGroupIds, worldEditDeps],
  )

  const handleAddSelectedToGroup = useCallback(
    (groupId: string) => {
      if (selectedEntityIds.length === 0) return
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'none' }, (prev) =>
        addToGroup(prev, groupId, selectedEntityIds),
      )
      uiLogger.click('Builder', 'Add to group', { groupId, entityIds: selectedEntityIds })
    },
    [selectedEntityIds, worldEditDeps],
  )

  const handleRemoveSelectedFromGroup = useCallback(() => {
    if (selectedEntityIds.length === 0) return
    applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'none' }, (prev) => {
      let nextWorld = prev
      for (const groupId of getGroups(prev).map((g) => g.id)) {
        const inThisGroup = selectedEntityIds.filter((eid) => {
          const parent = findGroupContaining(nextWorld, eid)
          return parent?.id === groupId
        })
        if (inThisGroup.length > 0) {
          nextWorld = removeFromGroup(nextWorld, groupId, inThisGroup)
        }
      }
      return nextWorld
    })
    uiLogger.click('Builder', 'Remove from group', { entityIds: selectedEntityIds })
  }, [selectedEntityIds, worldEditDeps])

  const handleToggleGroupCollapsed = useCallback(
    (groupId: string, collapsed: boolean) => {
      applyWorldEdit(worldEditDeps, { undo: 'skip', scene: 'none' }, (prev) =>
        setGroupCollapsed(prev, groupId, collapsed),
      )
    },
    [worldEditDeps],
  )

  const handleRenameGroup = useCallback(
    (groupId: string, name: string) => {
      applyWorldEdit(worldEditDeps, { undo: 'push', scene: 'none' }, (prev) => renameGroup(prev, groupId, name))
      uiLogger.change('Builder', 'Rename group', { groupId, name })
    },
    [worldEditDeps],
  )

  const groupShortcutHandlersRef = useRef<{
    onGroup: () => void
    onUngroup: () => void
  }>({ onGroup: () => {}, onUngroup: () => {} })

  groupShortcutHandlersRef.current = {
    onGroup: handleCreateGroupFromSelection,
    onUngroup: () => {
      if (selectedEntityIds.length === 0 && selectedGroupIds.length === 1) {
        handleUngroup(selectedGroupIds[0]!)
      }
    },
  }

  return {
    selectedEntityIds,
    selectedGroupIds,
    setSelectedEntityIds,
    setSelectedGroupIds,
    selectionAnchorEntityIdRef,
    handleSelectEntity,
    reconcileAfterSnapshot,
    handleSelectGroup,
    handleCreateGroupFromSelection,
    handleUngroup,
    handleAddSelectedToGroup,
    handleRemoveSelectedFromGroup,
    handleToggleGroupCollapsed,
    handleRenameGroup,
    clearSelection,
    groupShortcutHandlersRef,
  }
}
