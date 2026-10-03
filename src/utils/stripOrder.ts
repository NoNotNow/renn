import type { TransformerPipe } from '@/types/transformer'
import type { Entity, RennWorld } from '@/types/world'
import { flattenPipeStageIds, getEntityPipeStack, normalizePipeMembers } from '@/utils/transformerPipeResolve'
import { topLevelStageIds } from '@/utils/pipeStageResolve'
import { reorderPipeMembers, reorderStackBindings } from '@/utils/pipeNavMutations'

/**
 * Strip order = run order. Entities run their stages sorted by `priority` across all pipes, so "put the wanderer in
 * front of the pipe" means: give the stage a priority below the pipe's stages. These helpers compute that for
 * the entity-level strip (pipes + top-level stages) and for mixed pipe members.
 */

export type StripOrderItem =
  | { kind: 'pipe'; key: string; pipeId: string; stackIndex?: number; memberIndex?: number; lo?: number; hi?: number }
  | { kind: 'stage'; key: string; stageId: string; memberIndex?: number; lo?: number; hi?: number }

function pipeRange(world: RennWorld, pipeId: string): { lo?: number; hi?: number } {
  let ids: string[] = []
  try {
    ids = flattenPipeStageIds(world.transformerPipes ?? {}, pipeId)
  } catch {
    return {}
  }
  const ps = ids.map((id) => world.transformers?.[id]?.priority).filter((p): p is number => typeof p === 'number')
  return ps.length > 0 ? { lo: Math.min(...ps), hi: Math.max(...ps) } : {}
}

function stageItem(world: RennWorld, stageId: string, memberIndex?: number): StripOrderItem {
  const p = world.transformers?.[stageId]?.priority
  return { kind: 'stage', key: `stage:${stageId}`, stageId, memberIndex, ...(typeof p === 'number' ? { lo: p, hi: p } : {}) }
}

/** Entity level: stack pipes and top-level stages in run order (pipes by their first stage, stages by priority). */
export function entityLevelItems(world: RennWorld, entity: Entity): StripOrderItem[] {
  const items: StripOrderItem[] = [
    ...getEntityPipeStack(entity).map(
      (b, stackIndex): StripOrderItem => ({
        kind: 'pipe',
        key: `pipe:${stackIndex}`,
        pipeId: b.pipeId,
        stackIndex,
        ...pipeRange(world, b.pipeId),
      }),
    ),
    ...topLevelStageIds(world, entity).map((id) => stageItem(world, id)),
  ]
  const rank = (i: StripOrderItem) => i.lo ?? Number.POSITIVE_INFINITY
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.idx - b.idx)
    .map((x) => x.item)
}

/** Members of one pipe in their authored order (a pipe member carries the priority range of its stages). */
export function memberItems(world: RennWorld, pipe: TransformerPipe): StripOrderItem[] {
  return normalizePipeMembers(pipe).map((m, memberIndex): StripOrderItem =>
    m.kind === 'stage' ?
      stageItem(world, m.stageId, memberIndex)
    : { kind: 'pipe', key: `member:${memberIndex}`, pipeId: m.pipeId, memberIndex, ...pipeRange(world, m.pipeId) },
  )
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Walk the sequence left to right and give every stage that breaks the order (priority not above everything before
 * it / not below everything after it) a priority that fits. Pipes never change; returns the new priority per stage id.
 */
export function fitStagePriorities(seq: StripOrderItem[]): Map<string, number> {
  const out = new Map<string, number>()
  const items = seq.map((i) => ({ ...i }))
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    if (it.kind !== 'stage') continue
    let prevHi: number | undefined
    for (let j = i - 1; j >= 0 && prevHi === undefined; j--) prevHi = items[j]!.hi
    let nextLo: number | undefined
    for (let j = i + 1; j < items.length && nextLo === undefined; j++) nextLo = items[j]!.lo
    const p = it.lo
    const okPrev = prevHi === undefined || (p !== undefined && p >= prevHi)
    const okNext = nextLo === undefined || (p !== undefined && p <= nextLo)
    if (okPrev && okNext) continue
    let np: number
    if (prevHi !== undefined && nextLo !== undefined) np = prevHi < nextLo ? round3((prevHi + nextLo) / 2) : round3(nextLo - 0.001)
    else if (prevHi !== undefined) np = round3(prevHi + 1)
    else np = round3((nextLo as number) - 1)
    it.lo = it.hi = np
    out.set(it.stageId, np)
  }
  return out
}

function withPriorities(world: RennWorld, fixes: Map<string, number>): RennWorld {
  if (fixes.size === 0) return world
  const transformers = { ...(world.transformers ?? {}) }
  for (const [id, priority] of fixes) if (transformers[id]) transformers[id] = { ...transformers[id]!, priority }
  return { ...world, transformers }
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x as T)
  return next
}

/** Drag at entity level: move `fromKey` to `toIndex` of the displayed order. Pipes reorder the stack; stages get a fitting priority. */
export function moveEntityLevelItem(world: RennWorld, entityId: string, fromKey: string, toIndex: number): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return world
  const items = entityLevelItems(world, entity)
  const from = items.findIndex((i) => i.key === fromKey)
  if (from < 0 || toIndex < 0 || toIndex >= items.length || from === toIndex) return world
  const seq = moved(items, from, toIndex)

  let next = withPriorities(world, fitStagePriorities(seq))
  // stack order follows the pipes' order in the new sequence
  const newPipeOrder = seq.filter((i) => i.kind === 'pipe').map((i) => (i as { stackIndex: number }).stackIndex)
  let current = newPipeOrder.map((_, i) => i)
  for (let target = 0; target < newPipeOrder.length; target++) {
    const at = current.indexOf(newPipeOrder[target]!)
    if (at !== target) {
      next = reorderStackBindings(next, entityId, at, target)
      current = moved(current, at, target)
    }
  }
  return next
}

/** Drag inside a pipe whose members mix stages and pipes: reorder the member and fit the stage priorities to the new order. */
export function moveMemberItem(world: RennWorld, pipeId: string, fromIndex: number, toIndex: number): RennWorld {
  const pipe = world.transformerPipes?.[pipeId]
  if (!pipe) return world
  const items = memberItems(world, pipe)
  if (fromIndex === toIndex || !items[fromIndex] || toIndex < 0 || toIndex >= items.length) return world
  const withFit = withPriorities(world, fitStagePriorities(moved(items, fromIndex, toIndex)))
  return reorderPipeMembers(withFit, pipeId, fromIndex, toIndex)
}
