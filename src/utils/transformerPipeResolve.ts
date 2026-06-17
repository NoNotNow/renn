import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
  TransformerPipeMember,
} from '@/types/transformer'
import type { Entity } from '@/types/world'

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

/** Per-entity binding params for one stack entry (no shared defaults). */
export function resolvePipeBindingParams(binding: TransformerPipeBinding): Record<string, unknown> {
  return { ...(binding.params ?? {}) }
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
