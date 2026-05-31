import type { TransformerConfig } from '@/types/transformer'
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
