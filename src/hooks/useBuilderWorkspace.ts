import { useCallback, useRef, useState } from 'react'
import type { Entity, RennWorld } from '@/types/world'
import type { WorkspaceTarget } from '@/types/workspace'
import { WorkspaceSessionMemory } from '@/utils/workspaceSessionMemory'
import { resolveWorkspaceOpenTarget, resolveWorkspaceTargetForEntity } from '@/utils/workspaceOpenTarget'
import {
  intersectScriptIdsAcrossEntities,
  intersectTransformerIdsAcrossEntities,
} from '@/utils/entityInspectorMerge'
import { uiLogger } from '@/utils/uiLogger'

export type UseBuilderWorkspaceParams = {
  world: RennWorld
  selectedEntityIds: string[]
  handleSelectEntity: (id: string) => void
  collapseSideDrawers: () => void
}

export function useBuilderWorkspace({
  world,
  selectedEntityIds,
  handleSelectEntity,
  collapseSideDrawers,
}: UseBuilderWorkspaceParams) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceEntry, setWorkspaceEntry] = useState<WorkspaceTarget | null>(null)
  const workspaceSessionMemoryRef = useRef(new WorkspaceSessionMemory())

  const handleWorkspaceEntryChange = useCallback((next: WorkspaceTarget) => {
    if (next.entityId) {
      workspaceSessionMemoryRef.current.save(next.entityId, next)
    }
    setWorkspaceEntry(next)
  }, [])

  const handleOpenWorkspace = useCallback(() => {
    collapseSideDrawers()
    const entities = selectedEntityIds
      .map((id) => world.entities.find((e) => e.id === id))
      .filter((e): e is Entity => e != null)

    const entry = resolveWorkspaceOpenTarget({
      selectedEntityIds,
      entities,
      worldTransformers: world.transformers ?? {},
      prevEntry: workspaceEntry,
      loadMemory: (entityId) => workspaceSessionMemoryRef.current.load(entityId),
    })

    setWorkspaceEntry(entry)
    setWorkspaceOpen(true)
    uiLogger.click('Builder', 'Open workspace', {
      entityId: entry.entityId,
      tab: entry.tab,
      itemId: entry.itemId,
      pipeNavPath: entry.pipeNavPath,
    })
  }, [collapseSideDrawers, selectedEntityIds, world.entities, world.transformers, workspaceEntry])

  const handleSelectEntityFromWorkspace = useCallback(
    (id: string) => {
      if (workspaceEntry?.entityId) {
        workspaceSessionMemoryRef.current.save(workspaceEntry.entityId, workspaceEntry)
      }
      handleSelectEntity(id)
      const entities = [world.entities.find((e) => e.id === id)].filter((e): e is Entity => e != null)
      const tfIds = intersectTransformerIdsAcrossEntities(entities)
      const scIds = intersectScriptIdsAcrossEntities(entities)
      const next = resolveWorkspaceTargetForEntity(
        id,
        tfIds,
        scIds,
        world.transformers ?? {},
        workspaceSessionMemoryRef.current.load(id),
      )
      handleWorkspaceEntryChange(next)
    },
    [handleSelectEntity, handleWorkspaceEntryChange, workspaceEntry, world.entities, world.transformers],
  )

  const handleOpenWorkspaceAnchored = useCallback(
    (anchor: Pick<WorkspaceTarget, 'tab' | 'itemId'>) => {
      collapseSideDrawers()
      const entityId = selectedEntityIds[0]
      setWorkspaceEntry({ entityId, tab: anchor.tab, itemId: anchor.itemId })
      setWorkspaceOpen(true)
    },
    [collapseSideDrawers, selectedEntityIds],
  )

  const handleCloseWorkspace = useCallback(() => {
    if (workspaceEntry?.entityId) {
      workspaceSessionMemoryRef.current.save(workspaceEntry.entityId, workspaceEntry)
    }
    setWorkspaceOpen(false)
    uiLogger.click('Builder', 'Close workspace', {})
  }, [workspaceEntry])

  return {
    workspaceOpen,
    workspaceEntry,
    workspaceSessionMemoryRef,
    handleOpenWorkspace,
    handleCloseWorkspace,
    handleWorkspaceEntryChange,
    handleSelectEntityFromWorkspace,
    handleOpenWorkspaceAnchored,
  }
}
