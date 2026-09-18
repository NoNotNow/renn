import type { Entity } from '@/types/world'
import type { WorkspaceTarget } from '@/types/workspace'
import {
  mergeWorkspaceEntryForEntity,
  type WorkspaceEntityMemory,
} from '@/utils/workspaceSessionMemory'
import {
  intersectScriptIdsAcrossEntities,
  intersectTransformerIdsAcrossEntities,
} from '@/utils/entityInspectorMerge'

export type WorldTransformersLookup = Record<string, { type?: string } | undefined>

export function isWorkspaceTargetItemValid(
  entry: Pick<WorkspaceTarget, 'tab' | 'itemId'>,
  tfIds: string[],
  scIds: string[],
): boolean {
  if (entry.tab === 'scripts') {
    return !entry.itemId || scIds.includes(entry.itemId)
  }
  if (entry.tab === 'transformers') {
    return !entry.itemId || tfIds.includes(entry.itemId)
  }
  return true
}

export function buildDefaultWorkspaceTargetForEntity(
  entityId: string,
  tfIds: string[],
  scIds: string[],
  worldTransformers: WorldTransformersLookup,
): WorkspaceTarget {
  const tab: WorkspaceTarget['tab'] =
    tfIds.length === 0 && scIds.length > 0 ? 'scripts' : 'transformers'
  const itemId =
    tab === 'scripts'
      ? scIds[0]
      : tfIds.find((id) => worldTransformers[id]?.type === 'custom') ?? tfIds[0]
  return { entityId, tab, itemId }
}

export function tryReusePrevWorkspaceEntry(
  prev: WorkspaceTarget | null | undefined,
  entityId: string,
  tfIdsIntersect: string[],
  scIdsIntersect: string[],
): WorkspaceTarget | null {
  if (prev?.entityId !== entityId) return null

  if (prev.tab === 'scripts' && (!prev.itemId || scIdsIntersect.includes(prev.itemId))) {
    return { ...prev, entityId }
  }
  if (prev.tab === 'transformers') {
    const itemStillValid = !prev.itemId || tfIdsIntersect.includes(prev.itemId)
    if (itemStillValid) {
      return { ...prev, entityId }
    }
  }
  if (prev.tab === 'organize') {
    return { ...prev, entityId }
  }
  return null
}

export function resolveWorkspaceTargetForEntity(
  entityId: string,
  tfIds: string[],
  scIds: string[],
  worldTransformers: WorldTransformersLookup,
  memory: WorkspaceEntityMemory | undefined,
): WorkspaceTarget {
  const fallback = buildDefaultWorkspaceTargetForEntity(
    entityId,
    tfIds,
    scIds,
    worldTransformers,
  )
  const restored = mergeWorkspaceEntryForEntity(entityId, memory, fallback)
  return isWorkspaceTargetItemValid(restored, tfIds, scIds)
    ? restored
    : { ...fallback, entityId }
}

export type ResolveWorkspaceOpenTargetInput = {
  selectedEntityIds: string[]
  entities: Entity[]
  worldTransformers: WorldTransformersLookup
  prevEntry: WorkspaceTarget | null
  loadMemory: (entityId: string) => WorkspaceEntityMemory | undefined
}

/** Resolves the workspace entry when opening the shell (toolbar / shortcut). */
export function resolveWorkspaceOpenTarget(input: ResolveWorkspaceOpenTargetInput): WorkspaceTarget {
  const { selectedEntityIds, entities, worldTransformers, prevEntry, loadMemory } = input
  const entityId = selectedEntityIds[0]

  if (!entityId) {
    return { tab: 'organize' }
  }

  const tfIdsIntersect = intersectTransformerIdsAcrossEntities(entities)
  const scIdsIntersect = intersectScriptIdsAcrossEntities(entities)

  const reused = tryReusePrevWorkspaceEntry(prevEntry, entityId, tfIdsIntersect, scIdsIntersect)
  if (reused) return reused

  const memory = loadMemory(entityId)
  if (memory) {
    const restored = mergeWorkspaceEntryForEntity(entityId, memory, {
      entityId,
      tab: memory.tab ?? 'transformers',
      itemId: memory.itemId,
    })
    if (isWorkspaceTargetItemValid(restored, tfIdsIntersect, scIdsIntersect)) {
      return restored
    }
  }

  return buildDefaultWorkspaceTargetForEntity(
    entityId,
    tfIdsIntersect,
    scIdsIntersect,
    worldTransformers,
  )
}
