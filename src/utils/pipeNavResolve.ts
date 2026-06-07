import type {
  TransformerConfig,
  TransformerPipe,
  TransformerPipeBinding,
  TransformerPipeMember,
} from '@/types/transformer'
import type { PipeNavFocus, PipeNavPathSegment, ResolvedPipeNavView, StripItem } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import {
  getEntityPipeStack,
  normalizePipeMembers,
  TransformerPipeCycleError,
} from '@/utils/transformerPipeResolve'

export function isMemberEnabled(member: TransformerPipeMember): boolean {
  return member.enabled !== false
}

export function isBindingEnabled(binding: TransformerPipeBinding): boolean {
  return binding.enabled !== false
}

/** Stage-editing strip level (gray +): flat entity stages or inside a pipe without nested pipe cards. */
export function isPipeNavLeafLevel(view: ResolvedPipeNavView | null | undefined): boolean {
  if (!view) return false
  return (
    view.mode === 'entity_stages' ||
    (view.mode === 'pipe_members' && !view.items.some((item) => item.kind === 'pipe'))
  )
}

/** Stack index to insert a sibling pipe after the stack pipe in the current nav path. */
export function stackSiblingInsertIndexFromPath(path: PipeNavPathSegment[]): number | undefined {
  for (const seg of path) {
    if (seg.kind === 'stack') return seg.index + 1
  }
  return undefined
}

/** Resolve pipe id at end of navigation path. */
export function resolveFocusedPipeId(
  world: RennWorld,
  entity: Entity,
  path: PipeNavPathSegment[],
): string | undefined {
  if (path.length === 0) return undefined
  const stack = getEntityPipeStack(entity)
  let pipeId: string | undefined
  for (const seg of path) {
    if (seg.kind === 'stack') {
      pipeId = stack[seg.index]?.pipeId
    } else {
      pipeId = seg.pipeId
    }
    if (!pipeId) return undefined
    if (seg.kind === 'member') {
      const pipe = world.transformerPipes?.[pipeId]
      const members = pipe ? normalizePipeMembers(pipe) : []
      const member = members[seg.memberIndex]
      if (!member) return undefined
      if (member.kind === 'pipe') {
        pipeId = member.pipeId
      }
      // Stage member: focus stays on the parent pipe container (show full pipe strip).
    }
  }
  return pipeId
}

/** Parent path (up one level). */
export function pipeNavParentPath(path: PipeNavPathSegment[]): PipeNavPathSegment[] {
  return path.slice(0, -1)
}

export function pipeNavDepth(path: PipeNavPathSegment[]): number {
  return path.length
}

/** Container pipe id for the current focus level (parent of visible items). */
export function resolveContainerPipeId(
  world: RennWorld,
  entity: Entity,
  path: PipeNavPathSegment[],
): string | undefined {
  return resolveFocusedPipeId(world, entity, pipeNavParentPath(path))
}

export function resolvePipeNavView(
  world: RennWorld,
  entity: Entity,
  focus: PipeNavFocus,
): ResolvedPipeNavView {
  const stack = getEntityPipeStack(entity)
  const path = focus.path
  const depth = path.length

  if (path.length === 0) {
    if (stack.length === 0) {
      const stageIds = entity.transformers ?? []
      return {
        mode: 'entity_stages',
        depth: 0,
        items: stageIds.map((stageId, index) => ({ kind: 'stage' as const, stageId, index })),
        containerLabel: entity.name ?? entity.id,
        canGoUp: false,
        siblingCount: stageIds.length,
      }
    }
    return {
      mode: 'pipe_siblings',
      depth: 0,
      items: stack.map((binding, index) => ({
        kind: 'pipe' as const,
        pipeId: binding.pipeId,
        index,
        binding,
      })),
      containerLabel: entity.name ?? entity.id,
      canGoUp: false,
      siblingCount: stack.length,
    }
  }

  const focusedPipeId = resolveFocusedPipeId(world, entity, path)
  const pipe = focusedPipeId ? world.transformerPipes?.[focusedPipeId] : undefined
  const members = pipe ? normalizePipeMembers(pipe) : []
  const items: StripItem[] = members.map((member, index) =>
    member.kind === 'stage'
      ? { kind: 'stage', stageId: member.stageId, index }
      : { kind: 'pipe', pipeId: member.pipeId, index },
  )

  return {
    mode: 'pipe_members',
    depth,
    items,
    containerPipeId: focusedPipeId,
    containerLabel: pipe?.name ?? focusedPipeId ?? 'Pipe',
    canGoUp: true,
    siblingCount: items.length,
  }
}

/** Stage ids visible at the current focus (for transformer strip). */
export function resolveFocusedStageIds(
  world: RennWorld,
  entity: Entity,
  focus: PipeNavFocus,
): string[] {
  const view = resolvePipeNavView(world, entity, focus)
  if (view.mode === 'entity_stages') {
    return view.items.filter((i) => i.kind === 'stage').map((i) => i.stageId)
  }
  if (view.mode === 'pipe_members') {
    return view.items.filter((i) => i.kind === 'stage').map((i) => i.stageId)
  }
  return []
}

/** Flatten entity structure → runtime transformer id list (enabled only). */
export function syncEntityTransformerIds(world: RennWorld, entity: Entity): string[] {
  const registry = world.transformerPipes ?? {}
  const stack = getEntityPipeStack(entity)
  if (stack.length === 0) return [...(entity.transformers ?? [])]

  const ids: string[] = []
  for (const binding of stack) {
    if (!isBindingEnabled(binding)) continue
    const pipe = registry[binding.pipeId]
    if (!pipe) continue
    if (binding.mode === 'copy' && binding.localStageIds?.length) {
      ids.push(...binding.localStageIds)
    } else if (binding.mode === 'copy') {
      ids.push(...collectCopyBindingStageIds(world, entity.id, binding))
    } else {
      ids.push(...flattenPipeMembersEnabled(pipe, registry))
    }
  }
  return ids
}

function isMemberEnabledForFlatten(member: TransformerPipeMember): boolean {
  return member.enabled !== false
}

function flattenPipeMembersEnabled(
  pipe: TransformerPipe,
  registry: Record<string, TransformerPipe>,
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(pipe.id)) throw new TransformerPipeCycleError(pipe.id)
  visited.add(pipe.id)
  const ids: string[] = []
  for (const member of normalizePipeMembers(pipe)) {
    if (!isMemberEnabledForFlatten(member)) continue
    if (member.kind === 'stage') {
      ids.push(member.stageId)
    } else {
      const child = registry[member.pipeId]
      if (child) ids.push(...flattenPipeMembersEnabled(child, registry, visited))
    }
  }
  return ids
}

/** Copy bindings store entity-local ids in entity.transformers — collect slice owned by this binding. */
function collectCopyBindingStageIds(
  world: RennWorld,
  entityId: string,
  binding: TransformerPipeBinding,
): string[] {
  const pipe = world.transformerPipes?.[binding.pipeId]
  if (!pipe) return []
  if (binding.localStageIds?.length) return binding.localStageIds
  const entity = world.entities.find((e) => e.id === entityId)
  const count = collectPipeStageConfigsForCopyCount(pipe, world.transformerPipes ?? {})
  const allIds = entity?.transformers ?? []
  const prefix = `${entityId}_tf`
  return allIds.filter((id: string) => id.startsWith(prefix)).slice(-count)
}

function collectPipeStageConfigsForCopyCount(
  pipe: TransformerPipe,
  registry: Record<string, TransformerPipe>,
  visited: Set<string> = new Set(),
): number {
  if (visited.has(pipe.id)) return 0
  visited.add(pipe.id)
  let count = 0
  for (const member of normalizePipeMembers(pipe)) {
    if (!isMemberEnabledForFlatten(member)) continue
    if (member.kind === 'stage') count += 1
    else {
      const child = registry[member.pipeId]
      if (child) count += collectPipeStageConfigsForCopyCount(child, registry, visited)
    }
  }
  return count
}

/** Apply synced transformer ids to entity in world. */
export function applyEntityTransformerSync(world: RennWorld, entityId: string): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const ids = syncEntityTransformerIds(world, entity)
  return {
    ...world,
    entities: world.entities.map((e) => (e.id === entityId ? { ...e, transformers: ids } : e)),
  }
}

/** Build drill-in path for a pipe at strip index. */
export function drillIntoPipePath(
  world: RennWorld,
  entity: Entity,
  currentPath: PipeNavPathSegment[],
  itemIndex: number,
  itemKind: 'pipe',
  pipeId: string,
): PipeNavPathSegment[] {
  const view = resolvePipeNavView(world, entity, { path: currentPath, selectedSiblingIndex: itemIndex })
  if (view.mode === 'pipe_siblings') {
    return [{ kind: 'stack', index: itemIndex }]
  }
  if (view.mode === 'pipe_members') {
    const parentPipeId = resolveFocusedPipeId(world, entity, currentPath)
    if (!parentPipeId) return currentPath
    return [...currentPath, { kind: 'member', pipeId: parentPipeId, memberIndex: itemIndex }]
  }
  return currentPath
}

/** Stage configs for focused stage list. */
export function resolveFocusedStageConfigs(
  world: RennWorld,
  entity: Entity,
  focus: PipeNavFocus,
): { ids: string[]; configs: TransformerConfig[] } {
  const ids = resolveFocusedStageIds(world, entity, focus)
  const registry = world.transformers ?? {}
  const configs = ids.map((id) => registry[id]).filter(Boolean) as TransformerConfig[]
  return { ids, configs }
}

/** Whether `childPipeId` already contains `parentPipeId` in its member tree (nesting would cycle). */
export function wouldNestCreateCycle(
  registry: Record<string, TransformerPipe>,
  parentPipeId: string,
  childPipeId: string,
): boolean {
  if (parentPipeId === childPipeId) return true
  return pipeContainsDescendantPipe(registry, childPipeId, parentPipeId)
}

function pipeContainsDescendantPipe(
  registry: Record<string, TransformerPipe>,
  ancestorPipeId: string,
  descendantPipeId: string,
  visited: Set<string> = new Set(),
): boolean {
  if (ancestorPipeId === descendantPipeId) return true
  if (visited.has(ancestorPipeId)) return false
  visited.add(ancestorPipeId)
  const pipe = registry[ancestorPipeId]
  if (!pipe) return false
  for (const member of normalizePipeMembers(pipe)) {
    if (member.kind !== 'pipe') continue
    if (pipeContainsDescendantPipe(registry, member.pipeId, descendantPipeId, visited)) return true
  }
  return false
}

/** Stage ids on entity.transformers not accounted for by the pipe stack flatten. */
export function findUngroupedStageIds(world: RennWorld, entity: Entity): string[] {
  const stack = getEntityPipeStack(entity)
  if (stack.length === 0) return []
  const syncedSet = new Set(syncEntityTransformerIds(world, entity))
  return (entity.transformers ?? []).filter((id) => !syncedSet.has(id))
}

/** Clamp navigation path and selection after structural edits. */
export function reconcilePipeNavPath(
  world: RennWorld,
  entity: Entity,
  path: PipeNavPathSegment[],
  selectedIndex: number,
): PipeNavFocus {
  const stack = getEntityPipeStack(entity)
  const validPath: PipeNavPathSegment[] = []

  for (const seg of path) {
    if (seg.kind === 'stack') {
      if (seg.index < 0 || seg.index >= stack.length) break
      validPath.push({ kind: 'stack', index: seg.index })
      continue
    }
    const parentPipeId = resolveFocusedPipeId(world, entity, validPath)
    if (!parentPipeId) break
    const pipe = world.transformerPipes?.[parentPipeId]
    const members = pipe ? normalizePipeMembers(pipe) : []
    if (seg.memberIndex < 0 || seg.memberIndex >= members.length) break
    validPath.push({ kind: 'member', pipeId: parentPipeId, memberIndex: seg.memberIndex })
  }

  const view = resolvePipeNavView(world, entity, { path: validPath, selectedSiblingIndex: 0 })
  const maxIndex = Math.max(0, view.siblingCount - 1)
  return {
    path: validPath,
    selectedSiblingIndex: Math.max(0, Math.min(selectedIndex, maxIndex)),
  }
}
