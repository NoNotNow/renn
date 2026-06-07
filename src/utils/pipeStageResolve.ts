import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
  TransformerPipeMember,
} from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import {
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
  /** Merged pipe params + stage params (narrower scope wins). */
  mergedParams: Record<string, unknown>
  /** False when any ancestor pipe scope or the stage member is disabled. */
  effectivelyEnabled: boolean
}

/** Merge param layers outside-in; later layers override earlier keys, earlier fill gaps. */
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

/** Params shown/edited in the pipe config UI for one nav scope. */
export function resolveEditableScopeParams(
  binding: TransformerPipeBinding | undefined,
  pipe: TransformerPipe | undefined,
  scopePath?: PipeNavPathSegment[],
  sharedDefaults?: boolean,
): Record<string, unknown> {
  if (sharedDefaults || !binding) return pipe?.defaultParams ?? {}
  const path = scopePath ?? []
  if (path.length === 0) return resolvePipeBindingParams(binding, pipe)
  const scopeKey = pipeScopeKeyFromPath(path)
  if (isStackRootScopePath(path)) {
    return {
      ...(pipe?.defaultParams ?? {}),
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

function pipeLayerParams(
  pipe: TransformerPipe,
  binding: TransformerPipeBinding,
  scopeKey: string,
): Record<string, unknown> {
  return {
    ...(pipe.defaultParams ?? {}),
    ...scopeOverrideParams(binding, scopeKey),
  }
}

type WalkState = {
  registry: Record<string, TransformerPipe>
  worldTransformers: Record<string, TransformerConfig>
  paramLayers: Record<string, unknown>[]
  scopeEffectiveEnabled: Map<string, boolean>
  stageContext: Map<string, StageRuntimeContext>
  flatEnabledStageIds: string[]
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

  const layersWithPipe = [...state.paramLayers, pipeLayerParams(pipe, binding, scopeKey)]

  const members = normalizePipeMembers(pipe)
  for (let memberIndex = 0; memberIndex < members.length; memberIndex++) {
    const member = members[memberIndex]!
    const memberEnabled = scopeEnabled && isMemberEnabled(member)

    if (member.kind === 'stage') {
      const stageConfig = state.worldTransformers[member.stageId]
      const stageParams = (stageConfig?.params ?? {}) as Record<string, unknown>
      const stageMemberEnabled = memberEnabled && (stageConfig?.enabled !== false)
      state.stageContext.set(member.stageId, {
        mergedParams: mergePipeParamLayers([...layersWithPipe, stageParams]),
        effectivelyEnabled: stageMemberEnabled,
      })
      if (stageMemberEnabled) state.flatEnabledStageIds.push(member.stageId)
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
            [...layersWithPipe, pipeLayerParams(child, binding, childScopeKey)]
          : layersWithPipe,
      },
      memberEnabled,
      visited,
    )
  }
}

function walkCopyBindingStages(
  binding: TransformerPipeBinding,
  pipe: TransformerPipe,
  stackPath: PipeNavPathSegment[],
  worldTransformers: Record<string, TransformerConfig>,
  stageContext: Map<string, StageRuntimeContext>,
  flatEnabledStageIds: string[],
  scopeEffectiveEnabled: Map<string, boolean>,
): void {
  const scopeKey = pipeScopeKeyFromPath(stackPath)
  scopeEffectiveEnabled.set(scopeKey, true)
  const layers = [pipeLayerParams(pipe, binding, scopeKey)]
  for (const stageId of binding.localStageIds ?? []) {
    const config = worldTransformers[stageId]
    const stageParams = (config?.params ?? {}) as Record<string, unknown>
    const effectivelyEnabled = config?.enabled !== false
    stageContext.set(stageId, {
      mergedParams: mergePipeParamLayers([...layers, stageParams]),
      effectivelyEnabled,
    })
    if (effectivelyEnabled) flatEnabledStageIds.push(stageId)
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
  stageContext: Map<string, StageRuntimeContext>
  scopeEffectiveEnabled: Map<string, boolean>
  flatEnabledStageIds: string[]
} {
  const registry = world.transformerPipes ?? {}
  const worldTransformers = world.transformers ?? {}
  const stack = getEntityPipeStack(entity)
  const stageContext = new Map<string, StageRuntimeContext>()
  const scopeEffectiveEnabled = new Map<string, boolean>()
  const flatEnabledStageIds: string[] = []

  if (stack.length === 0) {
    for (const stageId of entity.transformers ?? []) {
      const config = worldTransformers[stageId]
      stageContext.set(stageId, {
        mergedParams: { ...(config?.params ?? {}) },
        effectivelyEnabled: config?.enabled !== false,
      })
    }
    const enabledIds = [...(entity.transformers ?? [])].filter(
      (id) => stageContext.get(id)?.effectivelyEnabled,
    )
    return { stageContext, scopeEffectiveEnabled, flatEnabledStageIds: enabledIds }
  }

  for (let stackIndex = 0; stackIndex < stack.length; stackIndex++) {
    const binding = stack[stackIndex]!
    const stackPath: PipeNavPathSegment[] = [{ kind: 'stack', index: stackIndex }]
    const stackEnabled = isBindingEnabled(binding)
    scopeEffectiveEnabled.set(pipeScopeKeyFromPath(stackPath), stackEnabled)

    const pipe = registry[binding.pipeId]
    if (!pipe) continue

    if (!stackEnabled) {
      const state: WalkState = {
        registry,
        worldTransformers,
        paramLayers: [],
        scopeEffectiveEnabled,
        stageContext,
        flatEnabledStageIds,
      }
      visitMembers(pipe, binding, stackPath, state, false, new Set())
      continue
    }

    if (binding.mode === 'copy' && binding.localStageIds?.length) {
      walkCopyBindingStages(
        binding,
        pipe,
        stackPath,
        worldTransformers,
        stageContext,
        flatEnabledStageIds,
        scopeEffectiveEnabled,
      )
      continue
    }

    const state: WalkState = {
      registry,
      worldTransformers,
      paramLayers: [],
      scopeEffectiveEnabled,
      stageContext,
      flatEnabledStageIds,
    }
    visitMembers(pipe, binding, stackPath, state, true, new Set())
  }

  return { stageContext, scopeEffectiveEnabled, flatEnabledStageIds }
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
): boolean {
  return buildEntityStageRuntimeContext(world, entity).stageContext.get(stageId)?.effectivelyEnabled ?? true
}

function entityUsesPipeInStackOrSubtree(
  world: RennWorld,
  entity: Entity,
  pipeId: string,
): boolean {
  for (const binding of getEntityPipeStack(entity)) {
    if (binding.pipeId === pipeId) return true
    const root = world.transformerPipes?.[binding.pipeId]
    if (root && pipeTreeContainsPipe(root, world.transformerPipes ?? {}, pipeId)) return true
  }
  return false
}

function pipeTreeContainsPipe(
  pipe: TransformerPipe,
  registry: Record<string, TransformerPipe>,
  targetPipeId: string,
  visited: Set<string> = new Set(),
): boolean {
  if (visited.has(pipe.id)) return false
  visited.add(pipe.id)
  for (const member of normalizePipeMembers(pipe)) {
    if (member.kind === 'pipe') {
      if (member.pipeId === targetPipeId) return true
      const child = registry[member.pipeId]
      if (child && pipeTreeContainsPipe(child, registry, targetPipeId, visited)) return true
    }
  }
  return false
}

/** Entity ids that need a merged-param runtime sync after a pipe param edit. */
export function entityIdsAffectedByPipeParamChange(
  world: RennWorld,
  opts: { pipeId: string; entityId?: string; sharedDefaults?: boolean },
): string[] {
  if (opts.sharedDefaults) {
    return world.entities
      .filter((e) => entityUsesPipeInStackOrSubtree(world, e, opts.pipeId))
      .map((e) => e.id)
  }
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
  for (const stageId of entity.transformers) {
    const base = world.transformers?.[stageId]
    if (!base) continue
    const ctx = stageContext.get(stageId)
    if (!ctx?.effectivelyEnabled) continue
    configs.push({
      ...base,
      params: ctx.mergedParams,
      enabled: base.enabled !== false,
    })
  }
  return configs.length > 0 ? configs : null
}
