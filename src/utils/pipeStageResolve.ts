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
  resolvePipeBindingParams,
  TransformerPipeCycleError,
} from '@/utils/transformerPipeResolve'
import { isBindingEnabled, isMemberEnabled } from '@/utils/pipeNavResolve'

/** Stack index from a pipe-nav path (first `stack` segment). */
export function stackIndexFromScopePath(path: PipeNavPathSegment[]): number | undefined {
  const stackSeg = path.find((seg) => seg.kind === 'stack')
  return stackSeg?.kind === 'stack' ? stackSeg.index : undefined
}

/** True when overrides belong on `binding.params` (stack root), not `scopeParams`. */
export function isStackRootScopePath(path: PipeNavPathSegment[]): boolean {
  return path.length === 1 && path[0]?.kind === 'stack'
}

export type StageRuntimeContext = {
  /** Pipe binding params for this stage (nested scope layers within the same binding only). */
  mergedParams: Record<string, unknown>
  /** False when any ancestor pipe scope or the stage member is disabled. */
  effectivelyEnabled: boolean
}

/** Merge param layers; later layers override earlier keys, earlier fill gaps. */
export function mergePipeParamLayers(layers: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) out[key] = value
    }
  }
  return out
}

/** Stable scope key for per-entity nested pipe overrides on a binding. */
export function pipeScopeKeyFromPath(path: PipeNavPathSegment[]): string {
  if (path.length === 0) return ''
  return path
    .map((seg) =>
      seg.kind === 'stack' ? `stack:${seg.index}` : `member:${seg.pipeId}:${seg.memberIndex}`,
    )
    .join('/')
}

/** Params shown/edited in the pipe params UI for one nav scope (binding storage only). */
export function resolveEditableScopeParams(
  binding: TransformerPipeBinding | undefined,
  _pipe: TransformerPipe | undefined,
  scopePath?: PipeNavPathSegment[],
): Record<string, unknown> {
  if (!binding) return {}
  const path = scopePath ?? []
  if (path.length === 0) return resolvePipeBindingParams(binding)
  const scopeKey = pipeScopeKeyFromPath(path)
  if (isStackRootScopePath(path)) {
    return {
      ...(binding.params ?? {}),
      ...(binding.scopeParams?.[scopeKey] ?? {}),
    }
  }
  return binding.scopeParams?.[scopeKey] ?? {}
}

function scopeOverrideParams(
  binding: TransformerPipeBinding,
  scopeKey: string,
): Record<string, unknown> {
  if (scopeKey.startsWith('stack:')) {
    return {
      ...(binding.params ?? {}),
      ...(binding.scopeParams?.[scopeKey] ?? {}),
    }
  }
  return binding.scopeParams?.[scopeKey] ?? {}
}

function pipeLayerParams(binding: TransformerPipeBinding, scopeKey: string): Record<string, unknown> {
  return scopeOverrideParams(binding, scopeKey)
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

  const layersWithPipe = [...state.paramLayers, pipeLayerParams(binding, scopeKey)]

  const members = normalizePipeMembers(pipe)
  for (let memberIndex = 0; memberIndex < members.length; memberIndex++) {
    const member = members[memberIndex]!
    const memberEnabled = scopeEnabled && isMemberEnabled(member)

    if (member.kind === 'stage') {
      const stageConfig = state.worldTransformers[member.stageId]
      const stageMemberEnabled = memberEnabled && (stageConfig?.enabled !== false)
      const ctx: StageRuntimeContext = {
        mergedParams: mergePipeParamLayers(layersWithPipe),
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
            [...layersWithPipe, pipeLayerParams(binding, childScopeKey)]
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
  const layers = [pipeLayerParams(binding, scopeKey)]
  for (const stageId of binding.localStageIds ?? []) {
    const config = worldTransformers[stageId]
    const effectivelyEnabled = config?.enabled !== false
    const ctx: StageRuntimeContext = {
      mergedParams: mergePipeParamLayers(layers),
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

/**
 * Walk the entity pipe tree and collect per-stage merged params + effective enabled flags.
 * Disabled ancestor pipes cascade: descendants are effectively disabled and omitted from flatten.
 */
export function buildEntityStageRuntimeContext(
  world: RennWorld,
  entity: Entity,
): {
  stageContext: Map<number, StageRuntimeContext>
  stageContextByStageId: Map<string, StageRuntimeContext>
  scopeEffectiveEnabled: Map<string, boolean>
  flatEnabledStageIds: string[]
} {
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

/** Flatten order of enabled stages; respects disabled ancestor pipe cascade. */
export function syncEntityTransformerIdsFromPipeTree(world: RennWorld, entity: Entity): string[] {
  const { flatEnabledStageIds } = buildEntityStageRuntimeContext(world, entity)
  const stack = getEntityPipeStack(entity)
  if (stack.length === 0) return [...(entity.transformers ?? [])]
  return flatEnabledStageIds
}

export function isPipeScopeEffectivelyEnabled(
  world: RennWorld,
  entity: Entity,
  path: PipeNavPathSegment[],
): boolean {
  const { scopeEffectiveEnabled } = buildEntityStageRuntimeContext(world, entity)
  return scopeEffectiveEnabled.get(pipeScopeKeyFromPath(path)) ?? true
}

export function isStageEffectivelyEnabled(
  world: RennWorld,
  entity: Entity,
  stageId: string,
  flatIndex?: number,
): boolean {
  const snapshot = buildEntityStageRuntimeContext(world, entity)
  if (flatIndex !== undefined) {
    return snapshot.stageContext.get(flatIndex)?.effectivelyEnabled ?? true
  }
  return snapshot.stageContextByStageId.get(stageId)?.effectivelyEnabled ?? true
}

/** Entity ids that need a merged-param runtime sync after a pipe param edit. */
export function entityIdsAffectedByPipeParamChange(
  _world: RennWorld,
  opts: { entityId?: string },
): string[] {
  return opts.entityId ? [opts.entityId] : []
}

/** Merged runtime configs for live `syncEntityTransformers` (enabled stages only). */
export function resolveMergedTransformerConfigsForEntitySync(
  world: RennWorld,
  entityId: string,
): TransformerConfig[] | undefined {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity?.transformers?.length) return undefined
  return resolveEntityTransformerConfigsForRuntime(world, entity) ?? undefined
}

/** Resolve runtime configs with merged pipe params (build-time projection). */
export function resolveEntityTransformerConfigsForRuntime(
  world: RennWorld,
  entity: Entity,
): TransformerConfig[] | null {
  if (!entity.transformers?.length) return null
  const { stageContext } = buildEntityStageRuntimeContext(world, entity)
  const configs: TransformerConfig[] = []
  for (let flatIndex = 0; flatIndex < entity.transformers.length; flatIndex++) {
    const stageId = entity.transformers[flatIndex]!
    const base = world.transformers?.[stageId]
    if (!base) continue
    const ctx = stageContext.get(flatIndex)
    if (!ctx?.effectivelyEnabled) continue
    configs.push({
      ...base,
      params: ctx.mergedParams,
      enabled: base.enabled !== false,
    })
  }
  return configs.length > 0 ? configs : null
}
