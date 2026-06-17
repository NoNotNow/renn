import type { TransformerConfig, TransformerPipe, TransformerPipeBinding, TransformerPipeMember } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import { pipeScopeKeyFromPath } from '@/utils/pipeStageResolve'
import type { Entity, RennWorld } from '@/types/world'
import { allocatePipeId, nextFreeDefaultPipeName } from '@/utils/allocatePipeId'
import {
  assignPipeToEntity,
  clonePipeTreeForEntityCopy,
} from '@/utils/commitTransformerConfigsToWorld'
import { applyEntityTransformerSync, findUngroupedStageIds, wouldNestCreateCycle } from '@/utils/pipeNavResolve'
import {
  buildInitialBindingParams,
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

  const initialParams = buildInitialBindingParams(newPipe)
  const binding: TransformerPipeBinding = {
    pipeId,
    enabled: true,
    ...(initialParams ? { params: initialParams } : {}),
  }

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
  if (opts.placement === 'member_child' || opts.placement === 'member_sibling') {
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

/** Wrap orphan flat stages (not in stack flatten) into the entity pipe stack. */
export function wrapUngroupedStagesIntoStackPipe(
  world: RennWorld,
  entityId: string,
  name: string,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const orphanIds = findUngroupedStageIds(world, entity)
  if (orphanIds.length === 0) return world

  const stack = getEntityPipeStack(entity)

  /** Legacy / single-pipe entities: merge orphans into the existing pipe instead of adding Pipe2. */
  if (stack.length === 1) {
    const existingPipeId = stack[0]!.pipeId
    const pipe = world.transformerPipes?.[existingPipeId]
    if (pipe) {
      const members = [...normalizePipeMembers(pipe)]
      for (const stageId of orphanIds) {
        if (members.some((m) => m.kind === 'stage' && m.stageId === stageId)) continue
        members.push({ kind: 'stage', stageId })
      }
      let nextWorld = updatePipeMembers(world, existingPipeId, members)
      nextWorld = {
        ...nextWorld,
        entities: nextWorld.entities.map((e) =>
          e.id === entityId
            ? {
                ...e,
                transformerPipeStack: stack.map((b) => ({
                  ...b,
                  enabled: b.enabled !== false,
                })),
                transformerPipe: undefined,
              }
            : e,
        ),
      }
      return applyEntityTransformerSync(nextWorld, entityId)
    }
  }

  const taken = new Set(Object.keys(world.transformerPipes ?? {}))
  const pipeId = allocatePipeId(name, taken)
  const stages = orphanIds.map((id) => world.transformers?.[id]).filter(Boolean) as TransformerConfig[]

  const newPipe: TransformerPipe = {
    id: pipeId,
    name: name.trim() || pipeId,
    stageIds: [...orphanIds],
    stages: JSON.parse(JSON.stringify(stages)),
    members: orphanIds.map((stageId) => ({ kind: 'stage' as const, stageId })),
    createdAt: Date.now(),
  }

  const initialParams = buildInitialBindingParams(newPipe)
  const nextStack = [
    ...stack,
    { pipeId, enabled: true, ...(initialParams ? { params: initialParams } : {}) },
  ]
  let nextWorld: RennWorld = {
    ...world,
    transformerPipes: { ...(world.transformerPipes ?? {}), [pipeId]: newPipe },
  }
  nextWorld = updateEntityStack(nextWorld, entityId, nextStack)
  return applyEntityTransformerSync(nextWorld, entityId)
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

  const initialParams = buildInitialBindingParams(newPipe)
  if (mode === 'linked') {
    nextWorld = {
      ...nextWorld,
      entities: nextWorld.entities.map((e) =>
        e.id === entityId
          ? {
              ...e,
              transformerPipeStack: [
                { pipeId, enabled: true, ...(initialParams ? { params: initialParams } : {}) },
              ],
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
  let nextWorld = updatePipeMembers(world, pipeId, members)
  return syncAllEntitiesUsingPipes(nextWorld, [pipeId])
}

function syncAllEntitiesUsingPipes(world: RennWorld, pipeIds: string[]): RennWorld {
  if (pipeIds.length === 0) return world
  const pipeIdSet = new Set(pipeIds)
  let nextWorld = world
  for (const entity of nextWorld.entities) {
    for (const pipeId of pipeIdSet) {
      if (entityUsesPipeInStackOrSubtree(nextWorld, entity, pipeId)) {
        nextWorld = applyEntityTransformerSync(nextWorld, entity.id)
        break
      }
    }
  }
  return nextWorld
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

export function updateBindingParams(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
  params: Record<string, unknown>,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = getEntityPipeStack(entity).map((b, i) =>
    i === stackIndex ? { ...b, params: { ...(b.params ?? {}), ...params } } : b,
  )
  return updateEntityStack(world, entityId, stack)
}

export function updateBindingScopeParams(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
  scopePath: PipeNavPathSegment[],
  params: Record<string, unknown>,
): RennWorld {
  const scopeKey = pipeScopeKeyFromPath(scopePath)
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = getEntityPipeStack(entity).map((b, i) => {
    if (i !== stackIndex) return b
    const prevScope = b.scopeParams ?? {}
    const prev = prevScope[scopeKey] ?? {}
    return {
      ...b,
      scopeParams: { ...prevScope, [scopeKey]: { ...prev, ...params } },
    }
  })
  return updateEntityStack(world, entityId, stack)
}

export function setBindingParams(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
  params: Record<string, unknown>,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = getEntityPipeStack(entity).map((b, i) =>
    i === stackIndex ? { ...b, params } : b,
  )
  return updateEntityStack(world, entityId, stack)
}

export function setBindingScopeParams(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
  scopePath: PipeNavPathSegment[],
  params: Record<string, unknown>,
): RennWorld {
  const scopeKey = pipeScopeKeyFromPath(scopePath)
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = getEntityPipeStack(entity).map((b, i) => {
    if (i !== stackIndex) return b
    return {
      ...b,
      scopeParams: { ...(b.scopeParams ?? {}), [scopeKey]: params },
    }
  })
  return updateEntityStack(world, entityId, stack)
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

  const cloned = clonePipeTreeForEntityCopy(world, entityId, pipe)
  const idMap = new Map<string, string>()
  const clonedFlatIds = cloned.flatStageIds
  for (let i = 0; i < sliceIds.length; i++) {
    const newId = clonedFlatIds[i]
    if (newId) idMap.set(sliceIds[i]!, newId)
  }

  const nextEntityTransformers = (entity.transformers ?? []).map((id) => idMap.get(id) ?? id)
  const { localStageIds: _legacy, ...bindingRest } = binding
  stack[stackIndex] = { ...bindingRest, pipeId: cloned.rootPipeId, mode: 'copy' }

  let nextWorld: RennWorld = {
    ...cloned.world,
    entities: cloned.world.entities.map((e) =>
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
  return syncAllEntitiesUsingPipes(nextWorld, [pipeId])
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
  return syncAllEntitiesUsingPipes(nextWorld, [pipeId])
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
    let nextWorld = assignPipeToEntity(world, entityId, pipe, mode, { append: true })
    const entity = nextWorld.entities.find((e) => e.id === entityId)
    const stack = entity ? getEntityPipeStack(entity) : []
    const endIdx = Math.max(0, stack.length - 1)
    const targetIdx = insertIndex ?? endIdx
    if (targetIdx !== endIdx) {
      nextWorld = reorderStackBindings(nextWorld, entityId, endIdx, targetIdx)
    }
    return {
      world: applyEntityTransformerSync(nextWorld, entityId),
      focusPath: [{ kind: 'stack', index: targetIdx }],
    }
  }

  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return { world, focusPath: parentPath }
  const parentPipeId = resolveParentPipeId(world, entity, parentPath)
  if (!parentPipeId) return { world, focusPath: parentPath }

  const members = [...normalizePipeMembers(world.transformerPipes![parentPipeId]!)]
  const idx = insertIndex ?? members.length
  let nextWorld = world
  let nestedPipeId = pipe.id
  if (mode === 'copy') {
    const cloned = clonePipeTreeForEntityCopy(world, entityId, pipe)
    nextWorld = cloned.world
    nestedPipeId = cloned.rootPipeId
  }
  members.splice(idx, 0, { kind: 'pipe', pipeId: nestedPipeId, enabled: true })

  nextWorld = updatePipeMembers(nextWorld, parentPipeId, members)
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

/** Create empty pipe and navigate into it. */
export function createEmptyPipe(
  world: RennWorld,
  entityId: string,
  name: string,
  parentPath: PipeNavPathSegment[],
  placement: 'stack_sibling' | 'member_sibling' | 'member_child',
  insertIndex?: number,
): { world: RennWorld; pipeId: string; focusPath: PipeNavPathSegment[] } {
  return createPipeFromStages(world, {
    entityId,
    name,
    mode: 'linked',
    stageIds: [],
    placement,
    parentPath,
    insertIndex,
  })
}

export type InsertPipePlacement = {
  parentPath: PipeNavPathSegment[]
  placement: 'stack_sibling' | 'member_sibling' | 'member_child'
  insertIndex?: number
}

/** Create an empty pipe at a tree context position. */
export function insertEmptyPipeAtNode(
  world: RennWorld,
  entityId: string,
  name: string,
  placement: InsertPipePlacement,
): { world: RennWorld; pipeId: string; focusPath: PipeNavPathSegment[] } {
  return createEmptyPipe(
    world,
    entityId,
    name,
    placement.parentPath,
    placement.placement,
    placement.insertIndex,
  )
}

export function deleteStackBinding(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = [...getEntityPipeStack(entity)]
  if (stackIndex < 0 || stackIndex >= stack.length) return world
  stack.splice(stackIndex, 1)
  let nextWorld = updateEntityStack(world, entityId, stack)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function deletePipeMember(
  world: RennWorld,
  _entityId: string,
  parentPipeId: string,
  memberIndex: number,
): RennWorld {
  const pipe = world.transformerPipes?.[parentPipeId]
  if (!pipe) return world
  const members = [...normalizePipeMembers(pipe)]
  if (memberIndex < 0 || memberIndex >= members.length) return world
  members.splice(memberIndex, 1)
  let nextWorld = updatePipeMembers(world, parentPipeId, members)
  return syncAllEntitiesUsingPipes(nextWorld, [parentPipeId])
}

export function nestStackPipeAsMember(
  world: RennWorld,
  entityId: string,
  stackIndex: number,
  targetParentPipeId: string,
  targetMemberIndex?: number,
): RennWorld {
  const registry = world.transformerPipes ?? {}
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const stack = [...getEntityPipeStack(entity)]
  const binding = stack[stackIndex]
  if (!binding) return world
  if (wouldNestCreateCycle(registry, targetParentPipeId, binding.pipeId)) return world

  stack.splice(stackIndex, 1)
  let nextWorld = updateEntityStack(world, entityId, stack)

  const parent = nextWorld.transformerPipes?.[targetParentPipeId]
  if (!parent) return nextWorld
  const members = [...normalizePipeMembers(parent)]
  const idx = targetMemberIndex ?? members.length
  members.splice(idx, 0, {
    kind: 'pipe',
    pipeId: binding.pipeId,
    enabled: binding.enabled !== false,
  })
  nextWorld = updatePipeMembers(nextWorld, targetParentPipeId, members)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function promoteMemberPipeToStack(
  world: RennWorld,
  entityId: string,
  parentPipeId: string,
  memberIndex: number,
  stackIndex?: number,
): RennWorld {
  const pipe = world.transformerPipes?.[parentPipeId]
  if (!pipe) return world
  const members = [...normalizePipeMembers(pipe)]
  const member = members[memberIndex]
  if (!member || member.kind !== 'pipe') return world

  members.splice(memberIndex, 1)
  let nextWorld = updatePipeMembers(world, parentPipeId, members)

  const entity = nextWorld.entities.find((e) => e.id === entityId)
  if (!entity) return nextWorld
  const stack = [...getEntityPipeStack(entity)]
  const idx = stackIndex ?? stack.length
  stack.splice(idx, 0, { pipeId: member.pipeId, enabled: member.enabled !== false })
  nextWorld = updateEntityStack(nextWorld, entityId, stack)
  nextWorld = applyEntityTransformerSync(nextWorld, entityId)
  return nextWorld
}

export function moveMemberStage(
  world: RennWorld,
  _entityId: string,
  fromParentPipeId: string,
  fromIndex: number,
  toParentPipeId: string,
  toIndex: number,
): RennWorld {
  if (fromParentPipeId === toParentPipeId && fromIndex === toIndex) return world

  const fromPipe = world.transformerPipes?.[fromParentPipeId]
  if (!fromPipe) return world
  const fromMembers = [...normalizePipeMembers(fromPipe)]
  const member = fromMembers[fromIndex]
  if (!member || member.kind !== 'stage') return world

  fromMembers.splice(fromIndex, 1)
  let nextWorld = updatePipeMembers(world, fromParentPipeId, fromMembers)

  const toPipe = nextWorld.transformerPipes?.[toParentPipeId]
  if (!toPipe) return nextWorld
  const toMembers = [...normalizePipeMembers(toPipe)]
  let insertIdx = toIndex
  if (fromParentPipeId === toParentPipeId && fromIndex < toIndex) insertIdx -= 1
  insertIdx = Math.max(0, Math.min(insertIdx, toMembers.length))
  toMembers.splice(insertIdx, 0, member)
  nextWorld = updatePipeMembers(nextWorld, toParentPipeId, toMembers)
  return syncAllEntitiesUsingPipes(nextWorld, [fromParentPipeId, toParentPipeId])
}

export function moveMemberPipe(
  world: RennWorld,
  _entityId: string,
  fromParentPipeId: string,
  fromIndex: number,
  toParentPipeId: string,
  toIndex: number,
): RennWorld {
  if (fromParentPipeId === toParentPipeId && fromIndex === toIndex) return world

  const registry = world.transformerPipes ?? {}
  const fromPipe = registry[fromParentPipeId]
  if (!fromPipe) return world
  const fromMembers = [...normalizePipeMembers(fromPipe)]
  const member = fromMembers[fromIndex]
  if (!member || member.kind !== 'pipe') return world
  if (wouldNestCreateCycle(registry, toParentPipeId, member.pipeId)) return world

  fromMembers.splice(fromIndex, 1)
  let nextWorld = updatePipeMembers(world, fromParentPipeId, fromMembers)

  const toPipe = nextWorld.transformerPipes?.[toParentPipeId]
  if (!toPipe) return nextWorld
  const toMembers = [...normalizePipeMembers(toPipe)]
  let insertIdx = toIndex
  if (fromParentPipeId === toParentPipeId && fromIndex < toIndex) insertIdx -= 1
  insertIdx = Math.max(0, Math.min(insertIdx, toMembers.length))
  toMembers.splice(insertIdx, 0, member)
  nextWorld = updatePipeMembers(nextWorld, toParentPipeId, toMembers)
  return syncAllEntitiesUsingPipes(nextWorld, [fromParentPipeId, toParentPipeId])
}
