import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
} from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import {
  flattenPipeMembers,
  getEntityPipeStack,
  normalizePipeMembers,
  TransformerPipeCycleError,
} from '@/utils/transformerPipeResolve'
import { isBindingEnabled, isMemberEnabled } from '@/utils/pipeNavResolve'
import {
  mergeParamScopeLayers,
  pipeScopeKeyFromPath,
  resolveLocalScopeParams,
} from '@/utils/paramScopes'

export { isStackRootScopePath, pipeScopeKeyFromPath } from '@/utils/paramScopes'

/** Stack index from a pipe-nav path (first `stack` segment). */
export function stackIndexFromScopePath(path: PipeNavPathSegment[]): number | undefined {
  const stackSeg = path.find((seg) => seg.kind === 'stack')
  return stackSeg?.kind === 'stack' ? stackSeg.index : undefined
}

type StageRuntimeContext = {
  /** Pipe binding params for this stage (nested scope layers within the same binding only). */
  mergedParams: Record<string, unknown>
  /** False when any ancestor pipe scope or the stage member is disabled. */
  effectivelyEnabled: boolean
}

/**
 * One entity's resolved pipe-tree walk: merged params and the enable cascade, queried by
 * flat index, stage id, or nav scope path. Build once per (world, entity) and reuse —
 * every query is a map lookup, never another walk.
 */
export interface EntityStageRuntime {
  /** False when any ancestor pipe scope in `path` is disabled. */
  isScopeEnabled(path: PipeNavPathSegment[]): boolean
  /** Enable cascade for a stage at its index in `entity.transformers`. */
  isStageEnabledAt(flatIndex: number): boolean
  /** Enable cascade for a stage omitted from the flatten (UI grey-out). */
  isStageEnabledById(stageId: string): boolean
  /** Three-scope merged runtime params for a stage index, or `undefined` when unknown. */
  mergedParamsAt(flatIndex: number): Record<string, unknown> | undefined
  /** Ids to write back to `entity.transformers`: all stages when flat, enabled flatten when piped. */
  syncedStageIds(): string[]
  /** Merged runtime configs for the transformer chain (enabled stages only). */
  runtimeConfigs(): TransformerConfig[] | null
}

type WalkState = {
  registry: Record<string, TransformerPipe>
  worldTransformers: Record<string, TransformerConfig>
  paramLayers: Record<string, unknown>[]
  scopeEffectiveEnabled: Map<string, boolean>
  /** Aligns with indices in `entity.transformers` after pipe sync. */
  stageContext: Map<number, StageRuntimeContext>
  /** Disabled stages omitted from `entity.transformers` (UI grey-out). */
  stageContextByStageId: Map<string, StageRuntimeContext>
  flatEnabledStageIds: string[]
  flatIndexCounter: { current: number }
}

function visitMembers(
  pipe: TransformerPipe,
  binding: TransformerPipeBinding,
  stackPath: PipeNavPathSegment[],
  state: WalkState,
  ancestorPipeEnabled: boolean,
  visited: Set<string>,
): void {
  if (visited.has(pipe.id)) throw new TransformerPipeCycleError(pipe.id)
  visited.add(pipe.id)

  const scopeKey = pipeScopeKeyFromPath(stackPath)
  const scopeEnabled = ancestorPipeEnabled
  if (!state.scopeEffectiveEnabled.has(scopeKey)) {
    state.scopeEffectiveEnabled.set(scopeKey, scopeEnabled)
  }

  const layersWithPipe = [...state.paramLayers, resolveLocalScopeParams(binding, stackPath)]

  const members = normalizePipeMembers(pipe)
  for (let memberIndex = 0; memberIndex < members.length; memberIndex++) {
    const member = members[memberIndex]!
    const memberEnabled = scopeEnabled && isMemberEnabled(member)

    if (member.kind === 'stage') {
      const stageConfig = state.worldTransformers[member.stageId]
      const stageMemberEnabled = memberEnabled && (stageConfig?.enabled !== false)
      const stageParamLayer = stageConfig?.params ? [stageConfig.params] : []
      const ctx: StageRuntimeContext = {
        mergedParams: mergeParamScopeLayers([...stageParamLayer, ...layersWithPipe]),
        effectivelyEnabled: stageMemberEnabled,
      }
      if (stageMemberEnabled) {
        const flatIndex = state.flatIndexCounter.current
        state.stageContext.set(flatIndex, ctx)
        state.flatEnabledStageIds.push(member.stageId)
        state.flatIndexCounter.current += 1
      } else {
        state.stageContextByStageId.set(member.stageId, ctx)
      }
      continue
    }

    const child = state.registry[member.pipeId]
    if (!child) continue
    const childPath: PipeNavPathSegment[] = [
      ...stackPath,
      { kind: 'member', pipeId: pipe.id, memberIndex },
    ]
    const childScopeKey = pipeScopeKeyFromPath(childPath)
    state.scopeEffectiveEnabled.set(childScopeKey, memberEnabled)

    visitMembers(
      child,
      binding,
      childPath,
      {
        ...state,
        paramLayers: memberEnabled ?
            [...layersWithPipe, resolveLocalScopeParams(binding, childPath)]
          : layersWithPipe,
      },
      memberEnabled,
      visited,
    )
  }
}

function walkCopyBindingStages(
  binding: TransformerPipeBinding,
  stackPath: PipeNavPathSegment[],
  worldTransformers: Record<string, TransformerConfig>,
  state: Pick<WalkState, 'stageContext' | 'stageContextByStageId' | 'flatEnabledStageIds' | 'flatIndexCounter'>,
  scopeEffectiveEnabled: Map<string, boolean>,
): void {
  const scopeKey = pipeScopeKeyFromPath(stackPath)
  scopeEffectiveEnabled.set(scopeKey, true)
  const layers = [resolveLocalScopeParams(binding, stackPath)]
  for (const stageId of binding.localStageIds ?? []) {
    const config = worldTransformers[stageId]
    const effectivelyEnabled = config?.enabled !== false
    const stageParamLayer = config?.params ? [config.params] : []
    const ctx: StageRuntimeContext = {
      mergedParams: mergeParamScopeLayers([...stageParamLayer, ...layers]),
      effectivelyEnabled,
    }
    if (effectivelyEnabled) {
      const flatIndex = state.flatIndexCounter.current
      state.stageContext.set(flatIndex, ctx)
      state.flatEnabledStageIds.push(stageId)
      state.flatIndexCounter.current += 1
    } else {
      state.stageContextByStageId.set(stageId, ctx)
    }
  }
}

type StageRuntimeWalk = {
  stageContext: Map<number, StageRuntimeContext>
  stageContextByStageId: Map<string, StageRuntimeContext>
  scopeEffectiveEnabled: Map<string, boolean>
  flatEnabledStageIds: string[]
}

/**
 * Walk the entity pipe tree and collect per-stage merged params + effective enabled flags.
 * Disabled ancestor pipes cascade: descendants are effectively disabled and omitted from flatten.
 */
function walkEntityStageRuntime(world: RennWorld, entity: Entity): StageRuntimeWalk {
  const registry = world.transformerPipes ?? {}
  const worldTransformers = world.transformers ?? {}
  const stack = getEntityPipeStack(entity)
  const stageContext = new Map<number, StageRuntimeContext>()
  const stageContextByStageId = new Map<string, StageRuntimeContext>()
  const scopeEffectiveEnabled = new Map<string, boolean>()
  const flatEnabledStageIds: string[] = []

  if (stack.length === 0) {
    for (let flatIndex = 0; flatIndex < (entity.transformers ?? []).length; flatIndex++) {
      const stageId = entity.transformers![flatIndex]!
      const config = worldTransformers[stageId]
      stageContext.set(flatIndex, {
        mergedParams: { ...(config?.params ?? {}) },
        effectivelyEnabled: config?.enabled !== false,
      })
    }
    const enabledIds = [...(entity.transformers ?? [])].filter(
      (_, flatIndex) => stageContext.get(flatIndex)?.effectivelyEnabled,
    )
    return { stageContext, stageContextByStageId, scopeEffectiveEnabled, flatEnabledStageIds: enabledIds }
  }

  for (let stackIndex = 0; stackIndex < stack.length; stackIndex++) {
    const binding = stack[stackIndex]!
    const stackPath: PipeNavPathSegment[] = [{ kind: 'stack', index: stackIndex }]
    const stackEnabled = isBindingEnabled(binding)
    scopeEffectiveEnabled.set(pipeScopeKeyFromPath(stackPath), stackEnabled)

    const pipe = registry[binding.pipeId]
    if (!pipe) continue

    const walkBase: WalkState = {
      registry,
      worldTransformers,
      paramLayers: [],
      scopeEffectiveEnabled,
      stageContext,
      stageContextByStageId,
      flatEnabledStageIds,
      flatIndexCounter: { current: flatEnabledStageIds.length },
    }

    if (!stackEnabled) {
      visitMembers(pipe, binding, stackPath, walkBase, false, new Set())
      continue
    }

    if (binding.mode === 'copy' && binding.localStageIds?.length) {
      walkCopyBindingStages(
        binding,
        stackPath,
        worldTransformers,
        walkBase,
        scopeEffectiveEnabled,
      )
      continue
    }

    visitMembers(pipe, binding, stackPath, walkBase, true, new Set())
  }

  return { stageContext, stageContextByStageId, scopeEffectiveEnabled, flatEnabledStageIds }
}

/** Start index in `entity.transformers` for stages contributed by one stack binding. */
export function flatIndexOffsetForStackBinding(
  world: RennWorld,
  entity: Entity,
  stackIndex: number,
): number {
  const stack = getEntityPipeStack(entity)
  const registry = world.transformerPipes ?? {}
  let offset = 0
  for (let i = 0; i < stackIndex; i++) {
    const binding = stack[i]
    if (!binding || binding.enabled === false) continue
    if (binding.mode === 'copy' && binding.localStageIds?.length) {
      offset += binding.localStageIds.length
      continue
    }
    const pipe = registry[binding.pipeId]
    if (pipe) offset += flattenPipeMembers(pipe, registry).length
  }
  return offset
}

/**
 * Resolve one entity's stage runtime: merged params plus the enable cascade, as a queryable
 * snapshot. Callers that need more than one answer (UI rows, chain build) must hold the
 * snapshot rather than call this per question — the walk is O(pipes × depth).
 */
export function resolveEntityStageRuntime(world: RennWorld, entity: Entity): EntityStageRuntime {
  const walk = walkEntityStageRuntime(world, entity)
  const isPiped = getEntityPipeStack(entity).length > 0

  return {
    isScopeEnabled: (path) => walk.scopeEffectiveEnabled.get(pipeScopeKeyFromPath(path)) ?? true,
    isStageEnabledAt: (flatIndex) => walk.stageContext.get(flatIndex)?.effectivelyEnabled ?? true,
    isStageEnabledById: (stageId) =>
      walk.stageContextByStageId.get(stageId)?.effectivelyEnabled ?? true,
    mergedParamsAt: (flatIndex) => walk.stageContext.get(flatIndex)?.mergedParams,
    syncedStageIds: () =>
      isPiped ? walk.flatEnabledStageIds : [...(entity.transformers ?? [])],
    runtimeConfigs: () => {
      const stageIds = entity.transformers
      if (!stageIds?.length) return null
      const configs: TransformerConfig[] = []
      for (let flatIndex = 0; flatIndex < stageIds.length; flatIndex++) {
        const base = world.transformers?.[stageIds[flatIndex]!]
        if (!base) continue
        const ctx = walk.stageContext.get(flatIndex)
        if (!ctx?.effectivelyEnabled) continue
        configs.push({ ...base, params: ctx.mergedParams, enabled: base.enabled !== false })
      }
      return configs.length > 0 ? configs : null
    },
  }
}

/** Merged runtime configs for live `syncEntityTransformers` (enabled stages only). */
export function resolveMergedTransformerConfigsForEntitySync(
  world: RennWorld,
  entityId: string,
): TransformerConfig[] | undefined {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity?.transformers?.length) return undefined
  return resolveEntityStageRuntime(world, entity).runtimeConfigs() ?? undefined
}
