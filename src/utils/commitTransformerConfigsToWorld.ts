import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
  TransformerPipeMember,
} from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { syncPriorities } from '@/transformers/transformerUtils'
import { allocatePipeId, nextCopyPipeName } from '@/utils/allocatePipeId'
import {
  buildInitialBindingParams,
  entityLinksPipe,
  flattenPipeMembers,
  getEntityPipeStack,
  legacyEntityPipeId,
  normalizePipeMembers,
  TransformerPipeCycleError,
  withPipeStackBindings,
} from '@/utils/transformerPipeResolve'

export interface ClonePipeTreeResult {
  world: RennWorld
  rootPipeId: string
  flatStageIds: string[]
}

/** Map registry ids from one entity to another (same `_tfN` suffix). */
export function mapTransformerRegistryIdsToEntity(ids: string[], targetEntityId: string): string[] {
  return ids.map((id) => {
    const idx = id.indexOf('_tf')
    const suffix = idx >= 0 ? id.slice(idx) : '_tf0'
    return `${targetEntityId}${suffix}`
  })
}

export function allocateTransformerRegistryId(
  entityId: string,
  registry: Record<string, TransformerConfig>,
  used: Set<string>,
): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `${entityId}_tf${i}`
    if (!used.has(id) && registry[id] === undefined) return id
  }
  return `${entityId}_tf${Date.now()}`
}

/**
 * Deep-clone a pipe manifold (and nested pipes) plus all referenced stage registry entries.
 * Used for copy-mode assign/decouple so structure edits stay private to one entity.
 */
export function clonePipeTreeForEntityCopy(
  world: RennWorld,
  entityId: string,
  sourcePipe: TransformerPipe,
): ClonePipeTreeResult {
  const pipeRegistry = { ...(world.transformerPipes ?? {}) }
  const worldTransformers = { ...(world.transformers ?? {}) }
  const usedPipeIds = new Set(Object.keys(pipeRegistry))
  const usedStageIds = new Set(Object.keys(worldTransformers))

  function clonePipeRecursive(source: TransformerPipe, pathVisited: Set<string>): string {
    if (pathVisited.has(source.id)) throw new TransformerPipeCycleError(source.id)
    pathVisited.add(source.id)

    const copyName = nextCopyPipeName(source.name, pipeRegistry)
    const newPipeId = allocatePipeId(copyName, usedPipeIds)
    usedPipeIds.add(newPipeId)

    const newMembers: TransformerPipeMember[] = []
    const newStageIds: string[] = []
    const newStages: TransformerConfig[] = []

    for (const member of normalizePipeMembers(source)) {
      if (member.kind === 'stage') {
        const fromRegistry = worldTransformers[member.stageId]
        const snapshotIdx = source.stageIds.indexOf(member.stageId)
        const snapshot = snapshotIdx >= 0 ? source.stages[snapshotIdx] : undefined
        const config = fromRegistry ?? snapshot
        const newId = allocateTransformerRegistryId(entityId, worldTransformers, usedStageIds)
        usedStageIds.add(newId)
        worldTransformers[newId] = config
          ? (JSON.parse(JSON.stringify(config)) as TransformerConfig)
          : ({} as TransformerConfig)
        newMembers.push({
          kind: 'stage',
          stageId: newId,
          ...(member.enabled === false ? { enabled: false } : {}),
        })
        newStageIds.push(newId)
        newStages.push(worldTransformers[newId]!)
      } else {
        const child = pipeRegistry[member.pipeId]
        if (!child) continue
        const newChildId = clonePipeRecursive(child, new Set(pathVisited))
        newMembers.push({
          kind: 'pipe',
          pipeId: newChildId,
          ...(member.enabled === false ? { enabled: false } : {}),
        })
      }
    }

    pipeRegistry[newPipeId] = {
      ...source,
      id: newPipeId,
      name: copyName,
      stageIds: newStageIds,
      stages: JSON.parse(JSON.stringify(newStages)),
      members: newMembers,
      createdAt: Date.now(),
    }
    return newPipeId
  }

  const rootPipeId = clonePipeRecursive(sourcePipe, new Set())
  const rootPipe = pipeRegistry[rootPipeId]!
  const flatStageIds = flattenPipeMembers(rootPipe, pipeRegistry)

  return {
    world: { ...world, transformerPipes: pipeRegistry, transformers: worldTransformers },
    rootPipeId,
    flatStageIds,
  }
}

/**
 * Duplicate transformer registry entries for a cloned entity.
 *
 * The cloned entity's `transformers` ID array points to the same registry keys as the source.
 * This function creates fresh registry entries (new IDs) for the clone so that edits to one
 * entity's transformers do not affect the other.
 *
 * Returns the updated world and the new transformer IDs for the cloned entity.
 */
export function cloneEntityTransformersIntoWorld(
  world: RennWorld,
  clonedEntity: { id: string; transformers?: string[] },
): { world: RennWorld; newTransformerIds: string[] } {
  const sourceIds = clonedEntity.transformers ?? []
  if (sourceIds.length === 0) return { world, newTransformerIds: [] }

  const nextWorldTransformers = { ...(world.transformers ?? {}) }
  const used = new Set(Object.keys(nextWorldTransformers))
  const newIds: string[] = []

  for (const sourceId of sourceIds) {
    const config = nextWorldTransformers[sourceId]
    const newId = allocateTransformerRegistryId(clonedEntity.id, nextWorldTransformers, used)
    used.add(newId)
    nextWorldTransformers[newId] = config ? JSON.parse(JSON.stringify(config)) : ({} as TransformerConfig)
    newIds.push(newId)
  }

  return { world: { ...world, transformers: nextWorldTransformers }, newTransformerIds: newIds }
}

/**
 * Persist an ordered transformer stack for one entity into `world.transformers`.
 *
 * When `orderedRegistryIds` is provided (pipeline reorder, code commit from Workspace),
 * each config is written to that registry key and `entity.transformers` follows that order.
 * Without it, falls back to reusing prior ids by index (in-place edits only — not reorder-safe).
 */
export function commitTransformerConfigsToWorld(
  world: RennWorld,
  entityId: string,
  configs: TransformerConfig[],
  orderedRegistryIds?: string[],
): RennWorld {
  const synced = syncPriorities(configs)
  const entity = world.entities.find((e) => e.id === entityId)
  const prevIds = entity?.transformers ?? []
  const nextWorldTransformers = { ...(world.transformers ?? {}) }

  const ids: string[] = []
  const used = new Set<string>()

  for (let i = 0; i < synced.length; i++) {
    let id = orderedRegistryIds?.[i]
    if (id == null || used.has(id)) {
      const fallback = prevIds[i]
      id =
        fallback && !used.has(fallback)
          ? fallback
          : allocateTransformerRegistryId(entityId, nextWorldTransformers, used)
    }
    used.add(id)
    ids.push(id)
    nextWorldTransformers[id] = synced[i]!
  }

  for (const oldId of prevIds) {
    if (!ids.includes(oldId)) {
      delete nextWorldTransformers[oldId]
    }
  }

  const nextEntities = world.entities.map((e) => (e.id === entityId ? { ...e, transformers: ids } : e))
  return { ...world, transformers: nextWorldTransformers, entities: nextEntities }
}

export interface AssignPipeOptions {
  /** When true, append to the entity pipe stack instead of replacing it. */
  append?: boolean
  /** Per-entity params for this stack entry. */
  params?: Record<string, unknown>
}

/** Assign a pipe to an entity. Linked mode shares registry IDs; Copy mode clones configs. */
export function assignPipeToEntity(
  world: RennWorld,
  entityId: string,
  pipe: TransformerPipe,
  mode: 'linked' | 'copy',
  options?: AssignPipeOptions,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  const append = options?.append ?? false
  let nextWorld = world
  let assignedPipe = pipe
  let newStageIds: string[]

  if (mode === 'linked') {
    newStageIds = flattenPipeMembers(pipe, world.transformerPipes ?? {})
  } else {
    const cloned = clonePipeTreeForEntityCopy(world, entityId, pipe)
    nextWorld = cloned.world
    assignedPipe = nextWorld.transformerPipes?.[cloned.rootPipeId] ?? pipe
    newStageIds = cloned.flatStageIds
  }

  const initialParams = buildInitialBindingParams(assignedPipe, options?.params)
  const binding: TransformerPipeBinding = {
    pipeId: assignedPipe.id,
    ...(initialParams ? { params: initialParams } : {}),
    ...(mode === 'copy' ? { mode: 'copy' as const } : {}),
    enabled: true,
  }

  const prevStack = getEntityPipeStack(entity)
  const nextStack = append ? [...prevStack, binding] : [binding]
  const prevTransformers = append ? (entity.transformers ?? []) : []
  const nextTransformers = [...prevTransformers, ...newStageIds]

  return {
    ...nextWorld,
    entities: nextWorld.entities.map((e) =>
      e.id === entityId
        ? { ...withPipeStackBindings(e, nextStack), transformers: nextTransformers }
        : e,
    ),
  }
}

/** Clones shared registry entries to make them unique to this entity, then clears the pipe stack. */
export function decoupleEntityFromPipe(world: RennWorld, entityId: string): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  const { world: nextWorld, newTransformerIds } = cloneEntityTransformersIntoWorld(world, entity)
  return {
    ...nextWorld,
    entities: nextWorld.entities.map((e) =>
      e.id === entityId
        ? { ...withPipeStackBindings(e, []), transformers: newTransformerIds }
        : e,
    ),
  }
}

/**
 * Removes a pipe from the world together with what it contained.
 *
 * Entity stack entries referencing the pipe are cleared. Its stages are deleted from the stage registry and from every
 * entity's `transformers` (they must not end up as ungrouped top-level stages). Nested pipes are deleted too, unless
 * another surviving pipe or an entity stack still references them; a stage that a surviving pipe still lists is kept.
 */
export function deletePipeFromWorld(world: RennWorld, pipeId: string): RennWorld {
  const registry = world.transformerPipes ?? {}
  const doomed = new Set<string>([pipeId])

  // Nested pipes nobody else references go with it (fixpoint: a kept child keeps its own subtree alive).
  const referencedOutside = (candidate: string): boolean => {
    for (const [id, p] of Object.entries(registry)) {
      if (doomed.has(id)) continue
      if (normalizePipeMembers(p).some((m) => m.kind === 'pipe' && m.pipeId === candidate)) return true
    }
    return world.entities.some((e) => getEntityPipeStack(e).some((b) => b.pipeId === candidate))
  }
  let grew = true
  while (grew) {
    grew = false
    for (const id of [...doomed]) {
      const pipe = registry[id]
      if (!pipe) continue
      for (const m of normalizePipeMembers(pipe)) {
        if (m.kind === 'pipe' && !doomed.has(m.pipeId) && registry[m.pipeId] && !referencedOutside(m.pipeId)) {
          doomed.add(m.pipeId)
          grew = true
        }
      }
    }
  }

  const keptStageIds = new Set<string>()
  for (const [id, p] of Object.entries(registry)) {
    if (doomed.has(id)) continue
    for (const sid of p.stageIds) keptStageIds.add(sid)
    for (const m of normalizePipeMembers(p)) if (m.kind === 'stage') keptStageIds.add(m.stageId)
  }
  const doomedStageIds = new Set<string>()
  for (const id of doomed) {
    const pipe = registry[id]
    if (!pipe) continue
    for (const sid of pipe.stageIds) doomedStageIds.add(sid)
    for (const m of normalizePipeMembers(pipe)) if (m.kind === 'stage') doomedStageIds.add(m.stageId)
  }
  for (const sid of keptStageIds) doomedStageIds.delete(sid)

  const nextPipes = { ...registry }
  for (const id of doomed) delete nextPipes[id]
  const nextTransformers = { ...(world.transformers ?? {}) }
  for (const sid of doomedStageIds) delete nextTransformers[sid]

  const nextEntities = world.entities.map((e) => {
    const stackBefore = getEntityPipeStack(e)
    const stack = stackBefore.filter((b) => !doomed.has(b.pipeId))
    const hadLegacy = legacyEntityPipeId(e) === pipeId
    let next = e
    if (stack.length !== stackBefore.length || hadLegacy) next = withPipeStackBindings(e, stack)
    if ((next.transformers ?? []).some((sid) => doomedStageIds.has(sid))) {
      next = { ...next, transformers: (next.transformers ?? []).filter((sid) => !doomedStageIds.has(sid)) }
    }
    return next
  })

  return {
    ...world,
    ...(world.transformers ? { transformers: nextTransformers } : {}),
    transformerPipes: nextPipes,
    entities: nextEntities,
  }
}

/** Creates a new pipe from an entity's current pipeline. */
export function savePipeFromEntity(
  world: RennWorld,
  entityId: string,
  pipeName: string,
  mode: 'linked' | 'copy',
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  const stageIds = entity.transformers ?? []
  const stages = stageIds.map((id) => world.transformers?.[id]).filter(Boolean) as TransformerConfig[]

  const pipeId = allocatePipeId(pipeName, world.transformerPipes ?? {})
  const newPipe: TransformerPipe = {
    id: pipeId,
    name: pipeName,
    stageIds: [...stageIds],
    stages: JSON.parse(JSON.stringify(stages)),
    members: stageIds.map((id) => ({ kind: 'stage' as const, stageId: id })),
    createdAt: Date.now(),
  }

  const nextWorld = {
    ...world,
    transformerPipes: {
      ...(world.transformerPipes ?? {}),
      [pipeId]: newPipe,
    },
  }

  if (mode === 'linked') {
    return {
      ...nextWorld,
      entities: nextWorld.entities.map((e) =>
        e.id === entityId
          ? withPipeStackBindings(e, [{ pipeId, enabled: true }])
          : e,
      ),
    }
  }

  return nextWorld
}

/** Count entities with a linked (non-copy) binding to a pipe. */
export function countEntitiesLinkingPipe(world: RennWorld, pipeId: string): number {
  return world.entities.filter((e) => entityLinksPipe(e, pipeId)).length
}
