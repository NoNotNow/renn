import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
  TransformerPipeMember,
} from '@/types/transformer'
import type { Entity } from '@/types/world'

const LEGACY_ENTITY_PIPE_KEY = 'transformerPipe'

function entityRecord(entity: Entity): Record<string, unknown> {
  return entity as unknown as Record<string, unknown>
}

export function legacyEntityPipeId(entity: Entity): string | undefined {
  const value = entityRecord(entity)[LEGACY_ENTITY_PIPE_KEY]
  return typeof value === 'string' ? value : undefined
}

/** Test / fixture helper: entity with legacy single-pipe field only (pre-stack migration). */
export function entityWithLegacyTransformerPipe(entity: Entity, pipeId: string): Entity {
  const next = { ...entity }
  entityRecord(next)[LEGACY_ENTITY_PIPE_KEY] = pipeId
  return next
}

/** Pipe-stack fields for entity updates (does not reference deprecated legacy pipe key). */
export function pipeStackBindingFields(
  stack: TransformerPipeBinding[],
): Pick<Entity, 'transformerPipeStack'> {
  return { transformerPipeStack: stack.length > 0 ? stack : undefined }
}

/** Entity copy with the given stack and legacy single-pipe link removed. */
export function withPipeStackBindings(entity: Entity, stack: TransformerPipeBinding[]): Entity {
  const next: Entity = { ...entity, ...pipeStackBindingFields(stack) }
  delete entityRecord(next)[LEGACY_ENTITY_PIPE_KEY]
  return next
}
export class TransformerPipeCycleError extends Error {
  constructor(pipeId: string) {
    super(`Circular transformer pipe reference: ${pipeId}`)
    this.name = 'TransformerPipeCycleError'
  }
}

/** Resolve entity pipe stack, including legacy single `transformerPipe`. */
export function getEntityPipeStack(
  entity: Pick<Entity, 'transformerPipeStack' | 'transformerPipe'>,
): TransformerPipeBinding[] {
  if (entity.transformerPipeStack && entity.transformerPipeStack.length > 0) {
    return entity.transformerPipeStack
  }
  const legacyPipeId = legacyEntityPipeId(entity as Entity)
  if (legacyPipeId) {
    return [{ pipeId: legacyPipeId }]
  }
  return []
}

export function entityUsesPipe(entity: Entity, pipeId: string): boolean {
  return getEntityPipeStack(entity).some((b) => b.pipeId === pipeId)
}

/** Normalize legacy `stageIds`-only pipes to manifold members. */
export function normalizePipeMembers(pipe: TransformerPipe): TransformerPipeMember[] {
  if (pipe.members && pipe.members.length > 0) return pipe.members
  return pipe.stageIds.map((stageId) => ({ kind: 'stage' as const, stageId }))
}

/**
 * Flatten one pipe object (and nested manifolds) to ordered stage registry ids.
 * Called on assign/edit only — runtime reads `entity.transformers` directly.
 */
export function flattenPipeMembers(
  pipe: TransformerPipe,
  registry: Record<string, TransformerPipe>,
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(pipe.id)) throw new TransformerPipeCycleError(pipe.id)
  visited.add(pipe.id)

  const ids: string[] = []
  for (const member of normalizePipeMembers(pipe)) {
    if (member.kind === 'stage') {
      ids.push(member.stageId)
    } else {
      const child = registry[member.pipeId]
      if (child) ids.push(...flattenPipeMembers(child, registry, visited))
    }
  }
  return ids
}

/** Flatten by registry id (returns [] when pipe is missing). */
export function flattenPipeStageIds(
  registry: Record<string, TransformerPipe>,
  pipeId: string,
  visited: Set<string> = new Set(),
): string[] {
  const pipe = registry[pipeId]
  if (!pipe) return []
  return flattenPipeMembers(pipe, registry, visited)
}

/** Flatten an entity's pipe stack to stage ids (linked bindings only). */
export function flattenEntityPipeStackStageIds(
  registry: Record<string, TransformerPipe>,
  stack: TransformerPipeBinding[],
): string[] {
  const ids: string[] = []
  for (const binding of stack) {
    if (binding.mode === 'copy') continue
    ids.push(...flattenPipeStageIds(registry, binding.pipeId))
  }
  return ids
}

/**
 * Collect leaf stage configs for copy-mode assignment (walks nested manifolds).
 * Prefers `world.transformers` registry entries; falls back to inline `pipe.stages`.
 */
export function collectPipeStageConfigsForCopy(
  pipeRegistry: Record<string, TransformerPipe>,
  worldTransformers: Record<string, TransformerConfig>,
  pipe: TransformerPipe,
  visited: Set<string> = new Set(),
): TransformerConfig[] {
  if (visited.has(pipe.id)) throw new TransformerPipeCycleError(pipe.id)
  visited.add(pipe.id)

  const configs: TransformerConfig[] = []
  for (const member of normalizePipeMembers(pipe)) {
    if (member.kind === 'stage') {
      const fromRegistry = worldTransformers[member.stageId]
      if (fromRegistry) {
        configs.push(fromRegistry)
      } else {
        const idx = pipe.stageIds.indexOf(member.stageId)
        const snapshot = idx >= 0 ? pipe.stages[idx] : undefined
        if (snapshot) configs.push(snapshot)
      }
    } else {
      const child = pipeRegistry[member.pipeId]
      if (child) {
        configs.push(
          ...collectPipeStageConfigsForCopy(pipeRegistry, worldTransformers, child, visited),
        )
      }
    }
  }
  return configs
}

/** Build initial binding.params from paramDefs schema defaults + optional overrides. */
export function buildInitialBindingParams(
  pipe: TransformerPipe,
  overrides?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const fromDefs: Record<string, unknown> = {}
  for (const def of pipe.paramDefs ?? []) {
    if (def.default !== undefined) fromDefs[def.key] = def.default
  }
  const merged = { ...fromDefs, ...(overrides ?? {}) }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/** Whether entity pipe stack references a pipe (linked bindings only). */
export function entityLinksPipe(entity: Entity, pipeId: string): boolean {
  return getEntityPipeStack(entity).some((b) => b.pipeId === pipeId && b.mode !== 'copy')
}

export function removePipeFromEntityStack(
  entity: Entity,
  pipeId: string,
): Pick<Entity, 'transformerPipeStack'> {
  const stack = getEntityPipeStack(entity).filter((b) => b.pipeId !== pipeId)
  return pipeStackBindingFields(stack)
}

export function replacePipeIdInEntityStack(
  entity: Entity,
  oldId: string,
  newId: string,
): Pick<Entity, 'transformerPipeStack'> {
  const stack = getEntityPipeStack(entity).map((b) =>
    b.pipeId === oldId ? { ...b, pipeId: newId } : b,
  )
  return pipeStackBindingFields(stack)
}
