import type { RennWorld } from '@/types/world'
import { flattenPipeMembers, getEntityPipeStack } from '@/utils/transformerPipeResolve'

export type PipeStageUsageSummary = {
  stageId: string
  type?: string
  name?: string
  entitiesUsingStageCount: number
  entityNamesSample: string[]
}

export type PipeAuthoringSummary = {
  pipeId: string
  pipeName?: string
  stageIds: string[]
  linkedEntities: Array<{
    entityId: string
    entityName?: string
    stackIndex: number
    bindingEnabled: boolean
    bindingParams?: Record<string, unknown>
    mode?: 'linked' | 'copy'
  }>
  stages: PipeStageUsageSummary[]
}

function countStageUsage(world: RennWorld): Map<string, { count: number; names: string[] }> {
  const map = new Map<string, { count: number; names: string[] }>()
  for (const entity of world.entities) {
    for (const stageId of entity.transformers ?? []) {
      const row = map.get(stageId) ?? { count: 0, names: [] }
      row.count += 1
      if (row.names.length < 8 && entity.name) {
        row.names.push(entity.name)
      }
      map.set(stageId, row)
    }
  }
  return map
}

export function buildPipeAuthoringSummary(world: RennWorld, pipeId: string): PipeAuthoringSummary {
  const trimmed = pipeId.trim()
  const pipe = world.transformerPipes?.[trimmed]
  if (!pipe) {
    throw new Error(`Pipe not found: ${trimmed}`)
  }

  const registry = world.transformerPipes ?? {}
  const stageIds =
    pipe.stageIds?.length > 0
      ? [...pipe.stageIds]
      : flattenPipeMembers(pipe, registry)

  const usage = countStageUsage(world)
  const linkedEntities: PipeAuthoringSummary['linkedEntities'] = []

  for (const entity of world.entities) {
    const stack = getEntityPipeStack(entity)
    stack.forEach((binding, stackIndex) => {
      if (binding.pipeId !== trimmed) return
      linkedEntities.push({
        entityId: entity.id,
        entityName: entity.name,
        stackIndex,
        bindingEnabled: binding.enabled !== false,
        bindingParams: binding.params,
        mode: binding.mode,
      })
    })
  }

  const stages: PipeStageUsageSummary[] = stageIds.map((stageId) => {
    const def = world.transformers?.[stageId]
    const u = usage.get(stageId)
    return {
      stageId,
      type: def?.type,
      name: def?.name,
      entitiesUsingStageCount: u?.count ?? 0,
      entityNamesSample: u?.names ?? [],
    }
  })

  return {
    pipeId: trimmed,
    pipeName: pipe.name,
    stageIds,
    linkedEntities,
    stages,
  }
}
