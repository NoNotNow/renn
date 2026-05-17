import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'

/**
 * Persist an ordered transformer stack for one entity into `world.transformers` keyed as
 * `${entityId}_tf${i}`, and rewrite `entity.transformers` as that ID array.
 */
export function commitTransformerConfigsToWorld(
  world: RennWorld,
  entityId: string,
  configs: TransformerConfig[],
): RennWorld {
  const nextWorldTransformers = { ...(world.transformers ?? {}) }
  const ids: string[] = configs.map((cfg, i) => {
    const id = `${entityId}_tf${i}`
    nextWorldTransformers[id] = cfg
    return id
  })
  const nextEntities = world.entities.map((e) => (e.id === entityId ? { ...e, transformers: ids } : e))
  return { ...world, transformers: nextWorldTransformers, entities: nextEntities }
}
