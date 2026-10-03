import { describe, expect, it } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { entityLevelItems, memberItems, moveEntityLevelItem, moveMemberItem } from '@/utils/stripOrder'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'

const st = (priority: number, name: string) => ({ type: 'custom', name, code: '', priority }) as TransformerConfig
const keys = (items: { key: string }[]) => items.map((i) => i.key)

function world(): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        name: 'E',
        transformers: ['a1', 'a2', 'b1', 'wander'],
        transformerPipeStack: [{ pipeId: 'pa' }, { pipeId: 'pb' }],
      },
    ],
    transformers: { a1: st(2, 'a1'), a2: st(3, 'a2'), b1: st(5, 'b1'), wander: st(9, 'wander') },
    transformerPipes: {
      pa: { id: 'pa', name: 'PA', stageIds: ['a1', 'a2'], stages: [], members: [{ kind: 'stage', stageId: 'a1' }, { kind: 'stage', stageId: 'a2' }] },
      pb: { id: 'pb', name: 'PB', stageIds: ['b1'], stages: [], members: [{ kind: 'stage', stageId: 'b1' }] },
    },
  } as RennWorld
}

describe('entity-level order = run order', () => {
  it('lists pipes and top-level stages by priority', () => {
    const w = world()
    expect(keys(entityLevelItems(w, w.entities[0]!))).toEqual(['pipe:0', 'pipe:1', 'stage:wander'])
  })

  it('dragging the stage in front of the first pipe makes it run first', () => {
    const w = moveEntityLevelItem(world(), 'e1', 'stage:wander', 0)
    expect(w.transformers!.wander!.priority).toBeLessThan(2)
    expect(keys(entityLevelItems(w, w.entities[0]!))).toEqual(['stage:wander', 'pipe:0', 'pipe:1'])
    const byPriority = [...resolveEntityStageRuntime(w, w.entities[0]!).runtimeConfigs()!].sort((a, b) => a.priority! - b.priority!)
    expect(byPriority[0]!.name).toBe('wander') // the chain runs stages sorted by priority
  })

  it('dragging the stage between two pipes lands between their priorities', () => {
    const w = moveEntityLevelItem(world(), 'e1', 'stage:wander', 1)
    const p = w.transformers!.wander!.priority!
    expect(p).toBeGreaterThanOrEqual(3)
    expect(p).toBeLessThanOrEqual(5)
    expect(keys(entityLevelItems(w, w.entities[0]!))).toEqual(['pipe:0', 'stage:wander', 'pipe:1'])
  })

  it('dragging a pipe in front of another reorders the stack and keeps stages consistent', () => {
    const w = moveEntityLevelItem(world(), 'e1', 'pipe:1', 0)
    expect(w.entities[0]!.transformerPipeStack!.map((b) => b.pipeId)).toEqual(['pb', 'pa'])
    expect(w.transformers!.b1!.priority).toBe(5) // pipes never get their priorities rewritten
  })

  it('no-op moves return the same world', () => {
    const w = world()
    expect(moveEntityLevelItem(w, 'e1', 'stage:wander', 2)).toBe(w)
  })
})

describe('mixed pipe members', () => {
  it('drags a trailing stage in front of a nested pipe, ahead of its stages at run time', () => {
    const w0 = world()
    w0.transformers!.car = st(8, 'car')
    w0.transformerPipes!.root = {
      id: 'root',
      name: 'Root',
      stageIds: ['car'],
      stages: [],
      members: [{ kind: 'pipe', pipeId: 'pa' }, { kind: 'stage', stageId: 'car' }],
    }
    expect(keys(memberItems(w0, w0.transformerPipes!.root!))).toEqual(['member:0', 'stage:car'])
    const w = moveMemberItem(w0, 'root', 1, 0)
    expect(w.transformerPipes!.root!.members![0]).toEqual({ kind: 'stage', stageId: 'car' })
    expect(w.transformers!.car!.priority).toBeLessThan(2)
  })
})
