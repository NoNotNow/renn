import type { TransformerConfig } from '@/types/transformer'
import type { Entity, RennWorld } from '@/types/world'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import {
  getEntityStructuralSceneKey,
  worldChangesRequireSceneRebuild,
} from '@/utils/sceneDependencyKey'

export type LogicVerificationEntityPatch = {
  add?: Entity[]
  update?: Record<string, Partial<Entity>>
  remove?: string[]
}

export type LogicVerificationWorldPatch = {
  /** Partial updates keyed by transformer registry id (e.g. `car_tf1`). */
  transformers?: Record<string, Partial<TransformerConfig>>
  entities?: LogicVerificationEntityPatch
  /** Required when the patch would trigger a full scene rebuild (entity add/remove, structural edits). */
  allowSceneRebuild?: boolean
}

export type ApplyLogicVerificationWorldPatchSuccess = {
  ok: true
  affectedEntityIds: string[]
  nextWorld: RennWorld
  mode: 'transformers' | 'entity-metadata' | 'entity-scene'
  removedEntityIds?: string[]
  addedEntities?: Entity[]
  physicsRebuiltEntityIds?: string[]
}

export type ApplyLogicVerificationWorldPatchResult =
  | ApplyLogicVerificationWorldPatchSuccess
  | { ok: false; message: string; requiresSceneRebuild?: boolean }

/** Returned from host/MCP after the live scene applies the patch. */
export type ApplyLogicVerificationWorldPatchHostResult =
  | { ok: true; affectedEntityIds: string[] }
  | { ok: false; message: string; requiresSceneRebuild?: boolean }

function mergeTransformerDef(
  prev: TransformerConfig | undefined,
  patch: Partial<TransformerConfig>,
): TransformerConfig | undefined {
  if (!prev) return undefined
  const next = { ...prev, ...patch } as TransformerConfig
  if (patch.params !== undefined) {
    next.params =
      patch.params && prev.params ?
        { ...(prev.params as Record<string, unknown>), ...(patch.params as Record<string, unknown>) }
      : (patch.params as TransformerConfig['params'])
  }
  return next
}

function mergeEntityPatch(prev: Entity, patch: Partial<Entity>): Entity {
  const next: Entity = { ...prev, ...patch }
  if (patch.shape !== undefined) {
    next.shape =
      patch.shape == null ? undefined : ({ ...prev.shape, ...patch.shape } as Entity['shape'])
  }
  return next
}

function entityNeedsPhysicsRebuild(prev: Entity, next: Entity): boolean {
  return (
    prev.bodyType !== next.bodyType ||
    prev.mass !== next.mass ||
    JSON.stringify(prev.shape) !== JSON.stringify(next.shape) ||
    prev.model !== next.model
  )
}

function entityStructuralKeyChanged(prev: Entity, next: Entity): boolean {
  return getEntityStructuralSceneKey(prev) !== getEntityStructuralSceneKey(next)
}

export function applyLogicVerificationWorldPatch(
  prev: RennWorld,
  patch: LogicVerificationWorldPatch,
): ApplyLogicVerificationWorldPatchResult {
  const hasTransformers = Boolean(
    patch.transformers && Object.keys(patch.transformers).length > 0,
  )
  const entityPatch = patch.entities
  const hasEntityAdd = (entityPatch?.add?.length ?? 0) > 0
  const hasEntityRemove = (entityPatch?.remove?.length ?? 0) > 0
  const hasEntityUpdate = Boolean(
    entityPatch?.update && Object.keys(entityPatch.update).length > 0,
  )
  const hasEntities = hasEntityAdd || hasEntityRemove || hasEntityUpdate

  if (!hasTransformers && !hasEntities) {
    return {
      ok: false,
      message: 'Patch must include transformer and/or entity changes',
    }
  }

  const nextWorld = structuredClone(prev) as RennWorld
  nextWorld.transformers = nextWorld.transformers ?? {}
  nextWorld.entities = [...nextWorld.entities]

  const removedEntityIds: string[] = []
  const addedEntities: Entity[] = []
  const physicsRebuiltEntityIds: string[] = []
  const metadataUpdatedIds: string[] = []
  let entitySceneMutation = false

  if (hasEntities && entityPatch) {
    if (entityPatch.remove) {
      for (const id of entityPatch.remove) {
        if (!nextWorld.entities.some((e) => e.id === id)) {
          return { ok: false, message: `Unknown entity id to remove: ${id}` }
        }
      }
    }

    if (entityPatch.add) {
      for (const ent of entityPatch.add) {
        if (!ent.id) {
          return { ok: false, message: 'Entity add requires id' }
        }
        if (nextWorld.entities.some((e) => e.id === ent.id)) {
          return { ok: false, message: `Entity id already exists: ${ent.id}` }
        }
      }
    }

    if (entityPatch.update) {
      for (const [id, partial] of Object.entries(entityPatch.update)) {
        const idx = nextWorld.entities.findIndex((e) => e.id === id)
        if (idx < 0) {
          return { ok: false, message: `Unknown entity id: ${id}` }
        }
        const prevEntity = nextWorld.entities[idx]!
        const merged = mergeEntityPatch(prevEntity, partial)
        if (entityNeedsPhysicsRebuild(prevEntity, merged) || entityStructuralKeyChanged(prevEntity, merged)) {
          entitySceneMutation = true
          physicsRebuiltEntityIds.push(id)
        } else {
          metadataUpdatedIds.push(id)
        }
        nextWorld.entities[idx] = merged
      }
    }

    if (hasEntityAdd || hasEntityRemove) {
      entitySceneMutation = true
    }

    if (entitySceneMutation && !patch.allowSceneRebuild) {
      return {
        ok: false,
        message: 'Patch requires scene rebuild; set allowSceneRebuild: true',
        requiresSceneRebuild: true,
      }
    }

    if (entityPatch.remove?.length) {
      const removeSet = new Set(entityPatch.remove)
      nextWorld.entities = nextWorld.entities.filter((e) => !removeSet.has(e.id))
      removedEntityIds.push(...entityPatch.remove)
    }

    if (entityPatch.add?.length) {
      for (const ent of entityPatch.add) {
        const cloned = structuredClone(ent) as Entity
        nextWorld.entities.push(cloned)
        addedEntities.push(cloned)
      }
    }
  }

  const patchedTransformerIds: string[] = []
  if (hasTransformers && patch.transformers) {
    for (const [tfId, tfPatch] of Object.entries(patch.transformers)) {
      const prevDef = nextWorld.transformers![tfId]
      if (!prevDef) {
        return { ok: false, message: `Unknown transformer id: ${tfId}` }
      }
      if (typeof tfPatch.code === 'string') {
        const message = validateCustomTransformerSource(tfPatch.code, tfId)
        if (message) {
          return { ok: false, message }
        }
      }
      const merged = mergeTransformerDef(prevDef, tfPatch)
      if (!merged) {
        return { ok: false, message: `Failed to merge transformer: ${tfId}` }
      }
      nextWorld.transformers![tfId] = merged
      patchedTransformerIds.push(tfId)
    }
  }

  if (
    worldChangesRequireSceneRebuild(prev, nextWorld) &&
    !entitySceneMutation &&
    !patch.allowSceneRebuild
  ) {
    return {
      ok: false,
      message: 'Patch requires scene rebuild; set allowSceneRebuild: true',
      requiresSceneRebuild: true,
    }
  }

  const affectedFromTransformers = nextWorld.entities
    .filter((entity) => entity.transformers?.some((id) => patchedTransformerIds.includes(id)))
    .map((entity) => entity.id)

  if (hasTransformers && affectedFromTransformers.length === 0 && !hasEntities) {
    return { ok: false, message: 'No entities reference the patched transformers' }
  }

  const affectedEntityIds = [
    ...new Set([
      ...affectedFromTransformers,
      ...metadataUpdatedIds,
      ...physicsRebuiltEntityIds,
      ...addedEntities.map((e) => e.id),
      ...removedEntityIds,
    ]),
  ]

  let mode: 'transformers' | 'entity-metadata' | 'entity-scene' = 'transformers'
  if (entitySceneMutation) {
    mode = 'entity-scene'
  } else if (hasEntities && !hasTransformers) {
    mode = 'entity-metadata'
  } else if (hasEntities && hasTransformers) {
    mode = entitySceneMutation ? 'entity-scene' : 'transformers'
  }

  return {
    ok: true,
    affectedEntityIds,
    nextWorld,
    mode,
    removedEntityIds: removedEntityIds.length ? removedEntityIds : undefined,
    addedEntities: addedEntities.length ? addedEntities : undefined,
    physicsRebuiltEntityIds: physicsRebuiltEntityIds.length ? physicsRebuiltEntityIds : undefined,
  }
}
