import type { TransformerConfig, TransformerPipe, TransformerPipeBinding, TransformerPipeMember } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import { allocatePipeId, nextFreeDefaultPipeName } from '@/utils/allocatePipeId'
import {
  allocateTransformerRegistryId,
  assignPipeToEntity,
} from '@/utils/commitTransformerConfigsToWorld'
import { applyEntityTransformerSync } from '@/utils/pipeNavResolve'
import {
  collectPipeStageConfigsForCopy,
  flattenPipeMembers,
  getEntityPipeStack,
  normalizePipeMembers,
} from '@/utils/transformerPipeResolve'

export type CreatePipeOptions = {
  entityId: string
  name: string
  mode: 'linked' | 'copy'
  /** Stage ids to wrap into the new pipe (from current focus). */
  stageIds: string[]
  /** Where to insert: entity stack sibling or member inside parent pipe. */
  placement: 'stack_sibling' | 'member_sibling' | 'member_child'
  parentPath: PipeNavPathSegment[]
  insertIndex?: number
}

/** Create a new pipe from stages at the current focus level. */
export function createPipeFromStages(world: RennWorld, opts: CreatePipeOptions): {
  world: RennWorld
  pipeId: string
  focusPath: PipeNavPathSegment[]
} {
  const entity = world.entities.find((e) => e.id === opts.entityId)
  if (!entity) return { world, pipeId: '', focusPath: opts.parentPath }

  const taken = new Set(Object.keys(world.transformerPipes ?? {}))
  const pipeId = allocatePipeId(opts.name, taken)
  const stages = opts.stageIds
    .map((id) => world.transformers?.[id])
    .filter(Boolean) as TransformerConfig[]

  const newPipe: TransformerPipe = {
    id: pipeId,
    name: opts.name.trim() || pipeId,
    stageIds: [...opts.stageIds],
    stages: JSON.parse(JSON.stringify(stages)),
    members: opts.stageIds.map((stageId) => ({ kind: 'stage' as const, stageId })),
    createdAt: Date.now(),
  }

  let nextWorld: RennWorld = {
    ...world,
    transformerPipes: { ...(world.transformerPipes ?? {}), [pipeId]: newPipe },
  }

  const binding: TransformerPipeBinding = { pipeId, enabled: true }

  if (opts.placement === 'stack_sibling') {
    const stack = [...getEntityPipeStack(entity)]
    const idx = opts.insertIndex ?? stack.length
    stack.splice(idx, 0, binding)
    nextWorld = updateEntityStack(nextWorld, opts.entityId, stack)
    const focusPath: PipeNavPathSegment[] = [{ kind: 'stack', index: idx }]
    nextWorld = applyEntityTransformerSync(nextWorld, opts.entityId)
    return { world: nextWorld, pipeId, focusPath }
  }

  const parentPipeId = resolveParentPipeId(nextWorld, entity, opts.parentPath)
  if (!parentPipeId) {
    nextWorld = applyEntityTransformerSync(nextWorld, opts.entityId)
    return { world: nextWorld, pipeId, focusPath: opts.parentPath }
  }

  const parent = nextWorld.transformerPipes?.[parentPipeId]
  if (!parent) return { world: nextWorld, pipeId, focusPath: opts.parentPath }

  const members = [...normalizePipeMembers(parent)]
  const memberRef: TransformerPipeMember = { kind: 'pipe', pipeId, enabled: true }
  const idx = opts.insertIndex ?? members.length
  members.splice(idx, 0, memberRef)

  nextWorld = updatePipeMembers(nextWorld, parentPipeId, members)

  let focusPath = opts.parentPath
  if (opts.placement === 'member_child') {
    focusPath = [...opts.parentPath, { kind: 'member', pipeId: parentPipeId, memberIndex: idx }]
  }

  nextWorld = applyEntityTransformerSync(nextWorld, opts.entityId)
  return { world: nextWorld, pipeId, focusPath }
}

/**
 * Ensure an entity has at least one pipe on its stack.
 * Fresh entities get an empty PipeN; flat stages are moved into PipeN automatically.
 */
export function ensureEntityPipeStack(
  world: RennWorld,
  entityId: string,
): { world: RennWorld; pipeId: string; created: boolean } {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity || getEntityPipeStack(entity).length > 0) {
    return { world, pipeId: '', created: false }
  }

  const name = nextFreeDefaultPipeName(world.transformerPipes)
  const stageIds = entity.transformers ?? []

  if (stageIds.length > 0) {
    const { world: nextWorld, pipeId } = wrapEntityStagesIntoPipe(world, entityId, name, 'linked')
    return { world: nextWorld, pipeId, created: Boolean(pipeId) }
  }

  const { world: nextWorld, pipeId } = createEmptyPipe(world, entityId, name, [], 'stack_sibling')
  return { world: nextWorld, pipeId, created: Boolean(pipeId) }
}

/** Wrap all entity-root stages into a new pipe (legacy manual save-as-pipe flow). */
export function wrapEntityStagesIntoPipe(
  world: RennWorld,
  entityId: string,
  name: string,
  mode: 'linked' | 'copy',
): { world: RennWorld; pipeId: string } {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return { world, pipeId: '' }
  const stageIds = entity.transformers ?? []
  if (stageIds.length === 0) return { world, pipeId: '' }

  const taken = new Set(Object.keys(world.transformerPipes ?? {}))
  const pipeId = allocatePipeId(name, taken)
  const stages = stageIds.map((id) => world.transformers?.[id]).filter(Boolean) as TransformerConfig[]

  const newPipe: TransformerPipe = {
    id: pipeId,
    name: name.trim() || pipeId,
    stageIds: [...stageIds],
    stages: JSON.parse(JSON.stringify(stages)),
    members: stageIds.map((id) => ({ kind: 'stage' as const, stageId: id })),
    createdAt: Date.now(),
  }

  let nextWorld: RennWorld = {
    ...world,
    transformerPipes: { ...(world.transformerPipes ?? {}), [pipeId]: newPipe },
  }

  if (mode === 'linked') {
    nextWorld = {
      ...nextWorld,
      entities: nextWorld.entities.map((e) =>
        e.id === entityId
          ? {
              ...e,
              transformerPipeStack: [{ pipeId, enabled: true }],
              transformerPipe: undefined,
            }
          : e,
      ),
    }
  }

  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return { world: nextWorld, pipeId }
}

export function renamePipe(world: RennWorld, pipeId: string, name: string): RennWorld {
  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world
  return {
    ...world,
    transformerPipes: {
 ...(world.transformerPipes ?? {}),
      [pipeId]: { ...pipe, name: name.trim() || pipe.name },
    },
  }
}

export function toggleStackBindingEnabled(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = getEntityPipeStack(entity).map((b, i) =>
    i === stackIndex ? { ...b, enabled: b.enabled === false } : b,
  )
  let nextWorld = updateEntityStack(world, entityId, stack)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function toggleMemberEnabled(
  world: RennWorld,
  pipeId: string,
  memberIndex: number,
): RennWorld {
  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world
  const members = normalizePipeMembers(pipe).map((m, i) =>
    i === memberIndex ? { ...m, enabled: m.enabled === false } : m,
  )
  return updatePipeMembers(world, pipeId, members)
}

export function updateBindingParams(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
  params: Record<string, unknown>,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = getEntityPipeStack(entity).map((b, i) =>
    i === stackIndex ? { ...b, params: { ...b.params, ...params } } : b,
  )
  return updateEntityStack(world, entityId, stack)
}

export function updatePipeDefaultParams(
  world: RennWorld,
  pipeId: string,
  params: Record<string, unknown>,
): RennWorld {
  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world
  return {
    ...world,
    transformerPipes: {
      ...(world.transformerPipes ?? {}),
      [pipeId]: { ...pipe, defaultParams: { ...(pipe.defaultParams ?? {}), ...params } },
    },
  }
}

/** Stage registry ids contributed by one stack binding (matches runtime flatten order). */
export function stageIdsForStackBinding(
  world: RennWorld,
  entity: Entity,
  stackIndex: number,
): string[] {
  const stack = getEntityPipeStack(entity)
  const binding = stack[stackIndex]
  if (!binding || binding.enabled === false) return []

  const registry = world.transformerPipes ?? {}
  if (binding.mode === 'copy' && binding.localStageIds?.length) {
    return binding.localStageIds
  }

  const pipe = registry[binding.pipeId]
  if (!pipe) return []

  let offset = 0
  for (let i = 0; i < stackIndex; i++) {
    offset += stageIdsForStackBinding(world, entity, i).length
  }
  const count = flattenPipeMembers(pipe, registry).length
  return (entity.transformers ?? []).slice(offset, offset + count)
}

/** Convert a linked stack binding to an independent copy for this entity only. */
export function decoupleStackBindingToCopy(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  const stack = [...getEntityPipeStack(entity)]
  const binding = stack[stackIndex]
  if (!binding || binding.mode === 'copy') return world

  const pipe = world.transformerPipes?.[binding.pipeId]
  if (!pipe) return world

  const sliceIds = stageIdsForStackBinding(world, entity, stackIndex)
  if (sliceIds.length === 0) return world

  const nextTransformers = { ...(world.transformers ?? {}) }
  const used = new Set(Object.keys(nextTransformers))
  const idMap = new Map<string, string>()
  const localStageIds: string[] = []

  const configs = collectPipeStageConfigsForCopy(
    world.transformerPipes ?? {},
    nextTransformers,
    pipe,
  )

  for (let i = 0; i < sliceIds.length; i++) {
    const oldId = sliceIds[i]!
    const config =
      nextTransformers[oldId] ?? configs[i] ?? ({ type: 'custom' } as TransformerConfig)
    const newId = allocateTransformerRegistryId(entityId, nextTransformers, used)
    used.add(newId)
    nextTransformers[newId] = JSON.parse(JSON.stringify(config))
    idMap.set(oldId, newId)
    localStageIds.push(newId)
  }

  const nextEntityTransformers = (entity.transformers ?? []).map((id) => idMap.get(id) ?? id)
  stack[stackIndex] = { ...binding, mode: 'copy', localStageIds }

  let nextWorld: RennWorld = {
    ...world,
    transformers: nextTransformers,
    entities: world.entities.map((e) =>
      e.id === entityId ? { ...e, transformers: nextEntityTransformers } : e,
    ),
  }
  nextWorld = updateEntityStack(nextWorld, entityId, stack)
  return applyEntityTransformerSync(nextWorld, entityId)
}

export function reorderStackBindings(
  world: RennWorld,
  entityId: string,
  fromIndex: number,
  toIndex: number,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = [...getEntityPipeStack(entity)]
  const [item] = stack.splice(fromIndex, 1)
  if (!item) return world
  stack.splice(toIndex, 0, item)
  let nextWorld = updateEntityStack(world, entityId, stack)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function reorderPipeMembers(
  world: RennWorld,
  pipeId: string,
  fromIndex: number,
  toIndex: number,
): RennWorld {
  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world
  const members = [...normalizePipeMembers(pipe)]
  const [item] = members.splice(fromIndex, 1)
  if (!item) return world
  members.splice(toIndex, 0, item)
  let nextWorld = updatePipeMembers(world, pipeId, members)
  const entityId = findFirstEntityUsingPipe(nextWorld, pipeId)
  if (entityId) nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function updateFocusedStageOrder(
  world: RennWorld,
  entityId: string,
  focusPath: PipeNavPathSegment[],
  orderedStageIds: string[],
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world

  if (focusPath.length === 0 && getEntityPipeStack(entity).length === 0) {
    return {
      ...world,
      entities: world.entities.map((e) =>
        e.id === entityId ? { ...e, transformers: orderedStageIds } : e,
      ),
    }
  }

  const pipeId = resolveParentPipeId(world, entity, focusPath) ?? resolveFocusedPipeIdFromPath(world, entity, focusPath)
  if (!pipeId) return world

  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world

  const members = normalizePipeMembers(pipe)
  const stageSet = new Set(orderedStageIds)
  const nonStageMembers = members.filter((m) => m.kind !== 'stage' || !stageSet.has(m.stageId))
  const reorderedStages: TransformerPipeMember[] = orderedStageIds.map((stageId) => ({
    kind: 'stage' as const,
    stageId,
    enabled: members.find((m) => m.kind === 'stage' && m.stageId === stageId)?.enabled,
  }))
  const pipeMembers = members.filter((m) => m.kind === 'pipe')
  const nextMembers = [...reorderedStages, ...pipeMembers, ...nonStageMembers.filter((m) => m.kind === 'pipe')]

  let nextWorld = updatePipeMembers(world, pipeId, nextMembers)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function addExistingPipeAtFocus(
  world: RennWorld,
  entityId: string,
  pipe: TransformerPipe,
  mode: 'linked' | 'copy',
  parentPath: PipeNavPathSegment[],
  insertIndex?: number,
): { world: RennWorld; focusPath: PipeNavPathSegment[] } {
  if (parentPath.length === 0) {
    const nextWorld = assignPipeToEntity(world, entityId, pipe, mode, { append: insertIndex == null })
    const entity = nextWorld.entities.find((e) => e.id === entityId)
    const stack = entity ? getEntityPipeStack(entity) : []
    const idx = insertIndex ?? stack.length - 1
    return { world: applyEntityTransformerSync(nextWorld, entityId), focusPath: [{ kind: 'stack', index: idx }] }
  }

  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return { world, focusPath: parentPath }
  const parentPipeId = resolveParentPipeId(world, entity, parentPath)
  if (!parentPipeId) return { world, focusPath: parentPath }

  const members = [...normalizePipeMembers(world.transformerPipes![parentPipeId]!)]
  const idx = insertIndex ?? members.length
  members.splice(idx, 0, { kind: 'pipe', pipeId: pipe.id, enabled: true })

  let nextWorld = updatePipeMembers(world, parentPipeId, members)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return {
    world: nextWorld,
    focusPath: [...parentPath, { kind: 'member', pipeId: parentPipeId, memberIndex: idx }],
  }
}

function updateEntityStack(world: RennWorld, entityId: string, stack: TransformerPipeBinding[]): RennWorld {
  return {
    ...world,
    entities: world.entities.map((e) =>
      e.id === entityId
        ? { ...e, transformerPipeStack: stack.length > 0 ? stack : undefined, transformerPipe: undefined }
        : e,
    ),
  }
}

function updatePipeMembers(
  world: RennWorld,
  pipeId: string,
  members: TransformerPipeMember[],
): RennWorld {
  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world
  const stageIds = members.filter((m) => m.kind === 'stage').map((m) => m.stageId)
  return {
    ...world,
    transformerPipes: {
      ...(world.transformerPipes ?? {}),
      [pipeId]: { ...pipe, members, stageIds },
    },
  }
}

function resolveParentPipeId(
  world: RennWorld,
  entity: Entity,
  path: PipeNavPathSegment[],
): string | undefined {
  if (path.length === 0) return undefined
  return resolveFocusedPipeIdFromPath(world, entity, path)
}

function resolveFocusedPipeIdFromPath(
  world: RennWorld,
  entity: Entity,
  path: PipeNavPathSegment[],
): string | undefined {
  const stack = getEntityPipeStack(entity)
  let pipeId: string | undefined
  for (const seg of path) {
    if (seg.kind === 'stack') pipeId = stack[seg.index]?.pipeId
    else {
      pipeId = seg.pipeId
      const pipe = pipeId ? world.transformerPipes?.[pipeId] : undefined
      const members = pipe ? normalizePipeMembers(pipe) : []
      const member = members[seg.memberIndex]
      if (member?.kind === 'pipe') pipeId = member.pipeId
    }
  }
  return pipeId
}

function findFirstEntityUsingPipe(world: RennWorld, pipeId: string): string | undefined {
  for (const e of world.entities) {
    if (getEntityPipeStack(e).some((b) => b.pipeId === pipeId)) return e.id
  }
  return undefined
}

/** Create empty pipe and navigate into it. */
export function createEmptyPipe(
  world: RennWorld,
  entityId: string,
  name: string,
  parentPath: PipeNavPathSegment[],
  placement: 'stack_sibling' | 'member_sibling' | 'member_child',
): { world: RennWorld; pipeId: string; focusPath: PipeNavPathSegment[] } {
  return createPipeFromStages(world, {
    entityId,
    name,
    mode: 'linked',
    stageIds: [],
    placement,
    parentPath,
  })
}
