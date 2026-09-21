import type { RennWorld } from '@/types/world'
import { behaviorRegistryBindings } from '@/utils/behaviorRegistryBindings'
import {
  flattenPipeStageIds,
  getEntityPipeStack,
} from '@/utils/transformerPipeResolve'

/** Entities whose flat list or linked pipe stack references any of the registry stage ids. */
export function entitiesReferencingTransformerIds(
  world: RennWorld,
  transformerIds: string[],
): string[] {
  if (transformerIds.length === 0) return []
  const idSet = new Set(transformerIds)
  const pipes = world.transformerPipes ?? {}
  const out = new Set<string>()

  for (const entity of world.entities) {
    if (entity.transformers?.some((id) => idSet.has(id))) {
      out.add(entity.id)
      continue
    }
    for (const binding of getEntityPipeStack(entity)) {
      if (binding.mode === 'copy') continue
      const stageIds = flattenPipeStageIds(pipes, binding.pipeId)
      if (stageIds.some((id) => idSet.has(id))) {
        out.add(entity.id)
        break
      }
    }
  }
  return [...out]
}

export function entitiesUsingPipeIds(world: RennWorld, pipeIds: string[]): string[] {
  const out = new Set<string>()
  for (const pipeId of pipeIds) {
    for (const ref of behaviorRegistryBindings('pipes').entitiesUsing(world, pipeId)) {
      out.add(ref.id)
    }
  }
  return [...out]
}
