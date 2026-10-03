import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { applyEntityTransformerSync } from '@/utils/pipeNavResolve'
import { resolveEntityStageRuntime, topLevelStageIds } from '@/utils/pipeStageResolve'
import {
  commitFocusedStageConfigs,
  deletePipeMember,
  deleteStackBinding,
  deleteTopLevelStage,
  moveMemberStageToTopLevel,
  moveTopLevelStageIntoPipe,
  wrapEverythingIntoPipe,
} from '@/utils/pipeNavMutations'

const cfg = (name: string, extra: Partial<TransformerConfig> = {}) => ({ type: 'custom', name, code: '', ...extra }) as TransformerConfig

/** e1: pipe `p` (stages a, b) + top-level stage `t`. */
function world(): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [
      { id: 'e1', name: 'E1', transformers: ['a', 'b', 't'], transformerPipeStack: [{ pipeId: 'p', params: { speed: 7 } }] },
      { id: 'e2', name: 'E2', transformers: ['a', 'b'], transformerPipeStack: [{ pipeId: 'p' }] },
    ],
    transformers: { a: cfg('A'), b: cfg('B'), t: cfg('Top', { priority: 9 }) },
    transformerPipes: {
      p: { id: 'p', name: 'P', stageIds: ['a', 'b'], stages: [], members: [{ kind: 'stage', stageId: 'a' }, { kind: 'stage', stageId: 'b' }] },
    },
  } as RennWorld
}
const e = (w: RennWorld, id: string) => w.entities.find((x) => x.id === id)!

describe('top-level stages next to a pipe stack', () => {
  it('are recognised, survive a sync and run with the entity', () => {
    const w = world()
    expect(topLevelStageIds(w, e(w, 'e1'))).toEqual(['t'])
    expect(topLevelStageIds(w, e(w, 'e2'))).toEqual([])
    const synced = applyEntityTransformerSync(w, 'e1')
    expect(e(synced, 'e1').transformers).toEqual(['a', 'b', 't'])
    const rt = resolveEntityStageRuntime(synced, e(synced, 'e1'))
    expect(rt.runtimeConfigs()!.map((c) => c.name)).toEqual(['A', 'B', 'Top'])
    expect(rt.mergedParamsAt(0)).toEqual({ speed: 7 })
  })

  it('a disabled top-level stage stays on the entity but does not run', () => {
    const w = world()
    w.transformers!.t = cfg('Top', { enabled: false })
    const synced = applyEntityTransformerSync(w, 'e1')
    expect(e(synced, 'e1').transformers).toEqual(['a', 'b', 't'])
    expect(resolveEntityStageRuntime(synced, e(synced, 'e1')).runtimeConfigs()!.map((c) => c.name)).toEqual(['A', 'B'])
  })

  it('a stage removed from the pipe does not reappear as top-level; the top-level one stays', () => {
    const w = deletePipeMember(world(), 'e1', 'p', 0)
    expect(e(w, 'e1').transformers).toEqual(['b', 't'])
    expect(e(w, 'e2').transformers).toEqual(['b'])
  })

  it('removing the last pipe keeps only the top-level stages', () => {
    const w = deleteStackBinding(world(), 'e1', 0)
    expect(e(w, 'e1').transformers).toEqual(['t'])
  })

  it('moves a pipe stage to the top level and back into a pipe', () => {
    const up = moveMemberStageToTopLevel(world(), 'e1', 'p', 0)
    expect(topLevelStageIds(up, e(up, 'e1'))).toEqual(['t', 'a'])
    expect(e(up, 'e2').transformers).toEqual(['b']) // not leaked to the other entity
    const down = moveTopLevelStageIntoPipe(up, 'e1', 't', 'p')
    expect(topLevelStageIds(down, e(down, 'e1'))).toEqual(['a'])
    expect(down.transformerPipes!.p!.members!.map((m) => (m.kind === 'stage' ? m.stageId : ''))).toEqual(['b', 't'])
    expect(e(down, 'e2').transformers).toContain('t') // other users of the pipe get it
  })

  it('edits through the entity-level strip (focus path []) replace the top-level list', () => {
    const w = world()
    const next = commitFocusedStageConfigs(w, 'e1', [], [cfg('Top'), cfg('New')], ['t', 'n'], ['t', 'n'])
    expect(e(next, 'e1').transformers).toEqual(['a', 'b', 't', 'n'])
    const removed = commitFocusedStageConfigs(next, 'e1', [], [cfg('New')], ['n'], ['n'])
    expect(e(removed, 'e1').transformers).toEqual(['a', 'b', 'n'])
    expect(removed.transformers!.t).toBeUndefined()
  })

  it('deleting a top-level stage removes it from the registry', () => {
    const w = deleteTopLevelStage(world(), 'e1', 't')
    expect(e(w, 'e1').transformers).toEqual(['a', 'b'])
    expect(w.transformers!.t).toBeUndefined()
  })
})

describe('wrapEverythingIntoPipe', () => {
  it('nests the stack pipes and top-level stages in one pipe without changing what runs', () => {
    const w = world()
    w.entities[0]!.transformerPipeStack = [{ pipeId: 'p', params: { speed: 7 }, scopeParams: { 'stack:0/member:p:1': { x: 1 } } }]
    const before = resolveEntityStageRuntime(w, e(w, 'e1'))
    const { world: wrapped, pipeId } = wrapEverythingIntoPipe(w, 'e1', 'All')
    const ent = e(wrapped, 'e1')
    expect(ent.transformerPipeStack).toHaveLength(1)
    expect(ent.transformerPipeStack![0]!.pipeId).toBe(pipeId)
    expect(wrapped.transformerPipes![pipeId]!.members).toEqual([
      { kind: 'pipe', pipeId: 'p', enabled: true },
      { kind: 'stage', stageId: 't' },
    ])
    expect(topLevelStageIds(wrapped, ent)).toEqual([])
    const after = resolveEntityStageRuntime(wrapped, ent)
    expect(ent.transformers).toEqual(['a', 'b', 't'])
    expect(after.runtimeConfigs()!.map((c) => c.name)).toEqual(before.runtimeConfigs()!.map((c) => c.name))
    expect(after.mergedParamsAt(0)).toEqual(before.mergedParamsAt(0))
    expect(after.mergedParamsAt(1)).toEqual(before.mergedParamsAt(1)) // nested scope override still applies
    expect(e(wrapped, 'e2').transformerPipeStack![0]!.pipeId).toBe('p') // other entities untouched
  })

  it('wraps a stack-less entity (bare stages) into its first pipe', () => {
    const w = world()
    w.entities[0] = { id: 'e1', name: 'E1', transformers: ['a', 'b'] }
    const { world: wrapped, pipeId } = wrapEverythingIntoPipe(w, 'e1', 'All')
    expect(wrapped.transformerPipes![pipeId]!.members!.map((m) => (m.kind === 'stage' ? m.stageId : ''))).toEqual(['a', 'b'])
    expect(e(wrapped, 'e1').transformerPipeStack![0]!.pipeId).toBe(pipeId)
  })
})

describe('new top-level stage lands at the end of the run order', () => {
  it('gets a priority above everything the entity already runs', () => {
    const w = world()
    const next = commitFocusedStageConfigs(w, 'e1', [], [cfg('Top', { priority: 0 }), cfg('New', { priority: 1 })], ['t', 'n'], ['t', 'n'])
    const maxBefore = Math.max(...['a', 'b', 't'].map((id) => w.transformers![id]!.priority ?? 0))
    expect(next.transformers!.n!.priority).toBeGreaterThan(maxBefore)
    expect(next.transformers!.t!.priority).toBe(9) // existing stage untouched
  })
})
