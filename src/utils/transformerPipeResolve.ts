import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
  TransformerPipeMember,
} from '@/types/transformer'
import type { Entity, RennWorld } from '@/types/world'

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
  if (entity.transformerPipe) {
    return [{ pipeId: entity.transformerPipe }]
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

/** Merge defaultParams + binding params for one stack entry. */
export function resolvePipeBindingParams(
  binding: TransformerPipeBinding,
  pipe: TransformerPipe | undefined,
): Record<string, unknown> {
  const defaults = pipe?.defaultParams ?? {}
  const overrides = binding.params ?? {}
  return { ...defaults, ...overrides }
}

/** Build per-pipe params map for runtime injection (stack order; later bindings do not override keys). */
export function resolveEntityPipeParamsByPipeId(
  world: RennWorld,
  entity: Entity,
): Record<string, Record<string, unknown>> {
  const registry = world.transformerPipes ?? {}
  const result: Record<string, Record<string, unknown>> = {}
  for (const binding of getEntityPipeStack(entity)) {
    result[binding.pipeId] = resolvePipeBindingParams(binding, registry[binding.pipeId])
  }
  return result
}

/** Whether entity pipe stack references a pipe (linked bindings only). */
export function entityLinksPipe(entity: Entity, pipeId: string): boolean {
  return getEntityPipeStack(entity).some((b) => b.pipeId === pipeId && b.mode !== 'copy')
}

export function removePipeFromEntityStack(
  entity: Entity,
  pipeId: string,
): Pick<Entity, 'transformerPipeStack' | 'transformerPipe'> {
  const stack = getEntityPipeStack(entity).filter((b) => b.pipeId !== pipeId)
  return {
    transformerPipeStack: stack.length > 0 ? stack : undefined,
    transformerPipe: undefined,
  }
}

export function replacePipeIdInEntityStack(
  entity: Entity,
  oldId: string,
  newId: string,
): Pick<Entity, 'transformerPipeStack' | 'transformerPipe'> {
  const stack = getEntityPipeStack(entity).map((b) =>
    b.pipeId === oldId ? { ...b, pipeId: newId } : b,
  )
  return { transformerPipeStack: stack, transformerPipe: undefined }
}
