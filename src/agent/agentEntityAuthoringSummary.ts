import type { TransformerConfig, TransformerPipeBinding } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { getEntityPipeStack } from '@/utils/transformerPipeResolve'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'

export type EntityAuthoringStageSummary = {
  registryId: string
  flatIndex: number
  type: string
  name?: string
  enabled: boolean
  effectivelyEnabled: boolean
  priority?: number
  params?: Record<string, unknown>
  code?: string
  codePreview?: string
}

export type EntityPipeStackEntrySummary = {
  stackIndex: number
  pipeId: string
  pipeName?: string
  bindingEnabled: boolean
  mode?: TransformerPipeBinding['mode']
  params?: Record<string, unknown>
}

export type EntityAuthoringSummary = {
  entityId: string
  entityName?: string
  transformerIds: string[]
  pipeStack: EntityPipeStackEntrySummary[]
  stages: EntityAuthoringStageSummary[]
  runtimeStageOrder: Array<{
    type: string
    name?: string
    enabled: boolean
    priority?: number
  }>
}

export type WorldAuthoringSnapshot = {
  version: string
  entityCount: number
  transformerRegistryCount: number
  pipeDefinitionCount: number
  entities?: EntityAuthoringSummary[]
}

const DEFAULT_CODE_PREVIEW = 240

function summarizeCode(
  code: string | undefined,
  includeCode: boolean,
  maxChars: number,
): Pick<EntityAuthoringStageSummary, 'code' | 'codePreview'> {
  if (!code) return {}
  if (includeCode) return { code }
  const trimmed = code.trim()
  if (trimmed.length <= maxChars) return { codePreview: trimmed }
  return { codePreview: `${trimmed.slice(0, maxChars)}…` }
}

function summarizeStageDef(
  registryId: string,
  flatIndex: number,
  def: TransformerConfig | undefined,
  effectivelyEnabled: boolean,
  mergedParams: Record<string, unknown> | undefined,
  options: { includeCode: boolean; codeMaxChars: number },
): EntityAuthoringStageSummary {
  const enabled = def?.enabled !== false
  return {
    registryId,
    flatIndex,
    type: def?.type ?? '(missing)',
    name: def?.name,
    enabled,
    effectivelyEnabled: effectivelyEnabled && enabled,
    priority: def?.priority,
    params: mergedParams ?? def?.params,
    ...summarizeCode(def?.code, options.includeCode, options.codeMaxChars),
  }
}

export function buildEntityAuthoringSummary(
  world: RennWorld,
  entityId: string,
  options?: { includeCode?: boolean; codeMaxChars?: number },
): EntityAuthoringSummary {
  const includeCode = options?.includeCode ?? false
  const codeMaxChars = options?.codeMaxChars ?? DEFAULT_CODE_PREVIEW
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`)
  }

  const pipeDefs = world.transformerPipes ?? {}
  const stack = getEntityPipeStack(entity)
  const pipeStack: EntityPipeStackEntrySummary[] = stack.map((binding, stackIndex) => ({
    stackIndex,
    pipeId: binding.pipeId,
    pipeName: pipeDefs[binding.pipeId]?.name,
    bindingEnabled: binding.enabled !== false,
    mode: binding.mode,
    params: binding.params,
  }))

  const stageIds = entity.transformers ?? []
  const runtime = resolveEntityStageRuntime(world, entity)
  const stages = stageIds.map((registryId, flatIndex) => {
    const def = world.transformers?.[registryId]
    return summarizeStageDef(
      registryId,
      flatIndex,
      def,
      runtime.isStageEnabledAt(flatIndex),
      runtime.mergedParamsAt(flatIndex),
      { includeCode, codeMaxChars },
    )
  })

  const runtimeConfigs = runtime.runtimeConfigs() ?? []

  return {
    entityId: entity.id,
    entityName: entity.name,
    transformerIds: [...stageIds],
    pipeStack,
    stages,
    runtimeStageOrder: runtimeConfigs.map((c) => ({
      type: c.type,
      name: c.name,
      enabled: c.enabled !== false,
      priority: c.priority,
    })),
  }
}

export function buildWorldAuthoringSnapshot(
  world: RennWorld,
  options?: {
    entityIds?: string[]
    includeCode?: boolean
    codeMaxChars?: number
    maxEntities?: number
  },
): WorldAuthoringSnapshot {
  const maxEntities = options?.maxEntities ?? 32
  let entities = world.entities
  if (options?.entityIds?.length) {
    const wanted = new Set(options.entityIds)
    entities = entities.filter((e) => wanted.has(e.id))
  }
  const slice = entities.slice(0, maxEntities)
  return {
    version: world.version,
    entityCount: world.entities.length,
    transformerRegistryCount: Object.keys(world.transformers ?? {}).length,
    pipeDefinitionCount: Object.keys(world.transformerPipes ?? {}).length,
    entities: slice.map((e) =>
      buildEntityAuthoringSummary(world, e.id, {
        includeCode: options?.includeCode,
        codeMaxChars: options?.codeMaxChars,
      }),
    ),
  }
}
