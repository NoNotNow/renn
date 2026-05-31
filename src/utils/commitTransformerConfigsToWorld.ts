import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { syncPriorities } from '@/transformers/transformerUtils'

/** Map registry ids from one entity to another (same `_tfN` suffix). */
export function mapTransformerRegistryIdsToEntity(ids: string[], targetEntityId: string): string[] {
  return ids.map((id) => {
    const idx = id.indexOf('_tf')
    const suffix = idx >= 0 ? id.slice(idx) : '_tf0'
    return `${targetEntityId}${suffix}`
  })
}

export function allocateTransformerRegistryId(
  entityId: string,
  registry: Record<string, TransformerConfig>,
  used: Set<string>,
): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `${entityId}_tf${i}`
    if (!used.has(id) && registry[id] === undefined) return id
  }
  return `${entityId}_tf${Date.now()}`
}

/**
 * Duplicate transformer registry entries for a cloned entity.
 *
 * The cloned entity's `transformers` ID array points to the same registry keys as the source.
 * This function creates fresh registry entries (new IDs) for the clone so that edits to one
 * entity's transformers do not affect the other.
 *
 * Returns the updated world and the new transformer IDs for the cloned entity.
 */
export function cloneEntityTransformersIntoWorld(
  world: RennWorld,
  clonedEntity: { id: string; transformers?: string[] },
): { world: RennWorld; newTransformerIds: string[] } {
  const sourceIds = clonedEntity.transformers ?? []
  if (sourceIds.length === 0) return { world, newTransformerIds: [] }

  const nextWorldTransformers = { ...(world.transformers ?? {}) }
  const used = new Set(Object.keys(nextWorldTransformers))
  const newIds: string[] = []

  for (const sourceId of sourceIds) {
    const config = nextWorldTransformers[sourceId]
    const newId = allocateTransformerRegistryId(clonedEntity.id, nextWorldTransformers, used)
    used.add(newId)
    nextWorldTransformers[newId] = config ? JSON.parse(JSON.stringify(config)) : ({} as TransformerConfig)
    newIds.push(newId)
  }

  return { world: { ...world, transformers: nextWorldTransformers }, newTransformerIds: newIds }
}

/**
 * Persist an ordered transformer stack for one entity into `world.transformers`.
 *
 * When `orderedRegistryIds` is provided (pipeline reorder, code commit from Workspace),
 * each config is written to that registry key and `entity.transformers` follows that order.
 * Without it, falls back to reusing prior ids by index (in-place edits only — not reorder-safe).
 */
export function commitTransformerConfigsToWorld(
  world: RennWorld,
  entityId: string,
  configs: TransformerConfig[],
  orderedRegistryIds?: string[],
): RennWorld {
  const synced = syncPriorities(configs)
  const entity = world.entities.find((e) => e.id === entityId)
  const prevIds = entity?.transformers ?? []
  const nextWorldTransformers = { ...(world.transformers ?? {}) }

  const ids: string[] = []
  const used = new Set<string>()

  for (let i = 0; i < synced.length; i++) {
    let id = orderedRegistryIds?.[i]
    if (id == null || used.has(id)) {
      const fallback = prevIds[i]
      id =
        fallback && !used.has(fallback)
          ? fallback
          : allocateTransformerRegistryId(entityId, nextWorldTransformers, used)
    }
    used.add(id)
    ids.push(id)
    nextWorldTransformers[id] = synced[i]!
  }

  for (const oldId of prevIds) {
    if (!ids.includes(oldId)) {
      delete nextWorldTransformers[oldId]
    }
  }

  const nextEntities = world.entities.map((e) => (e.id === entityId ? { ...e, transformers: ids } : e))
  return { ...world, transformers: nextWorldTransformers, entities: nextEntities }
}

/** Assign a pipe to an entity. Linked mode shares registry IDs; Copy mode clones configs. */
export function assignPipeToEntity(
  world: RennWorld,
  entityId: string,
  pipe: TransformerPipe,
  mode: 'linked' | 'copy',
): RennWorld {
  if (mode === 'linked') {
    return {
      ...world,
      entities: world.entities.map((e) =>
        e.id === entityId
          ? {
              ...e,
              transformers: [...pipe.stageIds],
              transformerPipe: pipe.id,
            }
          : e,
      ),
    }
  }

  // Copy mode: create fresh registry entries from pipe.stages
  const nextWorldTransformers = { ...(world.transformers ?? {}) }
  const used = new Set(Object.keys(nextWorldTransformers))
  const newIds: string[] = []

  for (const config of pipe.stages) {
    const newId = allocateTransformerRegistryId(entityId, nextWorldTransformers, used)
    used.add(newId)
    nextWorldTransformers[newId] = JSON.parse(JSON.stringify(config))
    newIds.push(newId)
  }

  return {
    ...world,
    transformers: nextWorldTransformers,
    entities: world.entities.map((e) =>
      e.id === entityId
        ? {
            ...e,
            transformers: newIds,
            transformerPipe: undefined,
          }
        : e,
    ),
  }
}

/** Clones shared registry entries to make them unique to this entity, then clears the pipe link. */
export function decoupleEntityFromPipe(world: RennWorld, entityId: string): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  const { world: nextWorld, newTransformerIds } = cloneEntityTransformersIntoWorld(world, entity)
  return {
    ...nextWorld,
    entities: nextWorld.entities.map((e) =>
      e.id === entityId
        ? {
            ...e,
            transformers: newTransformerIds,
            transformerPipe: undefined,
          }
        : e,
    ),
  }
}

/** Removes a pipe from the world and clears all entity links to it. */
export function deletePipeFromWorld(world: RennWorld, pipeId: string): RennWorld {
  const nextPipes = { ...(world.transformerPipes ?? {}) }
  delete nextPipes[pipeId]

  const nextEntities = world.entities.map((e) =>
    e.transformerPipe === pipeId
      ? {
          ...e,
          transformerPipe: undefined,
        }
      : e,
  )

  return { ...world, transformerPipes: nextPipes, entities: nextEntities }
}

/** Creates a new pipe from an entity's current pipeline. */
export function savePipeFromEntity(
  world: RennWorld,
  entityId: string,
  pipeName: string,
  mode: 'linked' | 'copy',
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  const stageIds = entity.transformers ?? []
  const stages = stageIds.map((id) => world.transformers?.[id]).filter(Boolean) as TransformerConfig[]

  const pipeId = `pipe_${Date.now()}`
  const newPipe: TransformerPipe = {
    id: pipeId,
    name: pipeName,
    stageIds: [...stageIds],
    stages: JSON.parse(JSON.stringify(stages)),
    createdAt: Date.now(),
  }

  const nextWorld = {
    ...world,
    transformerPipes: {
      ...(world.transformerPipes ?? {}),
      [pipeId]: newPipe,
    },
  }

  if (mode === 'linked') {
    return {
      ...nextWorld,
      entities: nextWorld.entities.map((e) =>
        e.id === entityId
          ? {
              ...e,
              transformerPipe: pipeId,
            }
          : e,
      ),
    }
  }

  return nextWorld
}
