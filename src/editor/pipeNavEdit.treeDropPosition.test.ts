import { describe, expect, it } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { PipeTreeNode } from '@/types/pipeNav'
import { resolvePipeNavEdit } from './pipeNavEdit'
import { entityLevelItems } from '@/utils/stripOrder'

const prompts = { confirm: () => true, warn: () => {} }
const ctxFor = (world: RennWorld) => ({ world, entityId: 'e1', focus: { path: [], selectedSiblingIndex: 0 }, prompts })

function world(): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [{ id: 'e1', name: 'E', transformers: ['a1', 'b1', 'wander'], transformerPipeStack: [{ pipeId: 'pa' }, { pipeId: 'pb' }] }],
    transformers: {
      a1: { type: 'custom', name: 'a1', code: '', priority: 2 },
      b1: { type: 'custom', name: 'b1', code: '', priority: 5 },
      wander: { type: 'custom', name: 'wander', code: '', priority: 9 },
      m1: { type: 'custom', name: 'm1', code: '', priority: 20 },
      m2: { type: 'custom', name: 'm2', code: '', priority: 21 },
    },
    transformerPipes: {
      pa: { id: 'pa', name: 'PA', stageIds: ['a1'], stages: [], members: [{ kind: 'stage', stageId: 'a1' }] },
      pb: { id: 'pb', name: 'PB', stageIds: ['b1'], stages: [], members: [{ kind: 'stage', stageId: 'b1' }] },
      mix: { id: 'mix', name: 'Mix', stageIds: ['m1', 'm2'], stages: [], members: [{ kind: 'stage', stageId: 'm1' }, { kind: 'stage', stageId: 'm2' }] },
    },
  } as RennWorld
}
const keys = (w: RennWorld) => entityLevelItems(w, w.entities[0]!).map((i) => i.key)
const top = (stageId: string): PipeTreeNode => ({ kind: 'top_stage', stageId, label: stageId })
const pipe = (stackIndex: number, pipeId: string): PipeTreeNode => ({ kind: 'stack_pipe', pipeId, stackIndex, label: pipeId })

describe('tree drop with a position (before / after)', () => {
  it('top-level stage dropped before the first pipe runs first — same order the strip shows', () => {
    const r = resolvePipeNavEdit({ kind: 'treeDrop', drag: top('wander'), drop: pipe(0, 'pa'), position: 'before' }, ctxFor(world()))!
    expect(keys(r.world)).toEqual(['stage:wander', 'pipe:0', 'pipe:1'])
  })

  it('dropping it between two pipes (after the first)', () => {
    const r = resolvePipeNavEdit({ kind: 'treeDrop', drag: top('wander'), drop: pipe(0, 'pa'), position: 'after' }, ctxFor(world()))!
    expect(keys(r.world)).toEqual(['pipe:0', 'stage:wander', 'pipe:1'])
  })

  it('"into" still moves the stage into the pipe', () => {
    const r = resolvePipeNavEdit({ kind: 'treeDrop', drag: top('wander'), drop: pipe(0, 'pa'), position: 'into' }, ctxFor(world()))!
    expect(r.world.transformerPipes!.pa!.members!.map((m) => (m.kind === 'stage' ? m.stageId : ''))).toContain('wander')
  })

  it('a pipe dropped after another pipe reorders the stack', () => {
    const r = resolvePipeNavEdit({ kind: 'treeDrop', drag: pipe(0, 'pa'), drop: pipe(1, 'pb'), position: 'after' }, ctxFor(world()))!
    expect(r.world.entities[0]!.transformerPipeStack!.map((b) => b.pipeId)).toEqual(['pb', 'pa'])
  })

  it('members of one pipe: dropping after the next one swaps them (and their run order)', () => {
    const w = world()
    w.entities[0]!.transformerPipeStack = [{ pipeId: 'mix' }]
    const m = (stageId: string, memberIndex: number): PipeTreeNode => ({ kind: 'member_stage', pipeId: 'mix', parentPipeId: 'mix', memberIndex, stageId, label: stageId })
    const r = resolvePipeNavEdit({ kind: 'treeDrop', drag: m('m1', 0), drop: m('m2', 1), position: 'after' }, ctxFor(w))!
    expect(r.world.transformerPipes!.mix!.members!.map((x) => (x.kind === 'stage' ? x.stageId : ''))).toEqual(['m2', 'm1'])
    expect(r.world.transformers!.m2!.priority!).toBeLessThan(r.world.transformers!.m1!.priority!)
  })

  it('a pipe stage dropped before a top-level stage becomes top-level and takes that slot', () => {
    const m: PipeTreeNode = { kind: 'member_stage', pipeId: 'pa', parentPipeId: 'pa', memberIndex: 0, stageId: 'a1', label: 'a1' }
    const r = resolvePipeNavEdit({ kind: 'treeDrop', drag: m, drop: top('wander'), position: 'before' }, ctxFor(world()))!
    const order = keys(r.world)
    expect(order.indexOf('stage:a1')).toBeLessThan(order.indexOf('stage:wander'))
  })
})
