import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import {
  createEmptyPipe,
  decoupleStackBindingToCopy,
  deleteStackBinding,
  deletePipeMember,
  ensureEntityPipeStack,
  moveMemberPipe,
  moveMemberStage,
  nestStackPipeAsMember,
  promoteMemberPipeToStack,
  setBindingParams,
  setPipeDefaultParams,
  stageIdsForStackBinding,
  wrapUngroupedStagesIntoStackPipe,
} from './pipeNavMutations'
import {
  findUngroupedStageIds,
  reconcilePipeNavPath,
  wouldNestCreateCycle,
} from './pipeNavResolve'

describe('pipeNavMutations pipe controls', () => {
  const world: RennWorld = {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        name: 'Car A',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'p1' }],
      },
      {
        id: 'e2',
        name: 'Car B',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'p1' }],
      },
    ],
    transformers: {
      s1: { type: 'input' },
    },
    transformerPipes: {
      p1: {
        id: 'p1',
        name: 'Shared',
        stageIds: ['s1'],
        stages: [{ type: 'input' }],
        paramDefs: [{ key: 'speed', type: 'number' }],
        defaultParams: { speed: 1 },
      },
    },
  }

  it('collects stage ids for a stack binding', () => {
    const entity = world.entities[0]!
    expect(stageIdsForStackBinding(world, entity, 0)).toEqual(['s1'])
  })

  it('replaces binding params in one shot', () => {
    const next = setBindingParams(world, 'e1', 0, { speed: 9, boost: true })
    expect(next.entities[0]?.transformerPipeStack?.[0]?.params).toEqual({ speed: 9, boost: true })
  })

  it('replaces pipe default params in one shot', () => {
    const next = setPipeDefaultParams(world, 'p1', { speed: 4 })
    expect(next.transformerPipes?.p1?.defaultParams).toEqual({ speed: 4 })
  })

  it('creates Pipe1 for a fresh entity without transformers', () => {
    const fresh: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', name: 'Hero', transformers: [] }],
      transformers: {},
    }
    const { world: next, pipeId, created } = ensureEntityPipeStack(fresh, 'e1')
    expect(created).toBe(true)
    expect(pipeId).toBe('pipe1')
    expect(next.transformerPipes?.[pipeId]?.name).toBe('Pipe1')
    expect(next.transformerPipes?.[pipeId]?.defaultParams).toEqual({})
    expect(next.entities[0]?.transformerPipeStack).toEqual([{ pipeId, enabled: true }])
  })

  it('wraps flat stages into Pipe1 when entity has no pipe stack', () => {
    const flat: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', transformers: ['s1', 's2'] }],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2' },
      },
    }
    const { world: next, pipeId, created } = ensureEntityPipeStack(flat, 'e1')
    expect(created).toBe(true)
    expect(next.transformerPipes?.[pipeId]?.stageIds).toEqual(['s1', 's2'])
    expect(next.entities[0]?.transformerPipeStack).toEqual([{ pipeId, enabled: true }])
  })

  it('skips entities that already have a pipe stack', () => {
    const { world: next, created } = ensureEntityPipeStack(world, 'e1')
    expect(created).toBe(false)
    expect(next).toBe(world)
  })

  it('creates a stack sibling when adding from inside a focused stack pipe', () => {
    const base: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'p1', enabled: true }],
        },
      ],
      transformers: { s1: { type: 'input' } },
      transformerPipes: {
        p1: {
          id: 'p1',
          name: 'Pipe1',
          stageIds: ['s1'],
          stages: [{ type: 'input' }],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }
    const { world: next, pipeId, focusPath } = createEmptyPipe(
      base,
      'e1',
      'Pipe2',
      [{ kind: 'stack', index: 0 }],
      'stack_sibling',
      1,
    )
    expect(next.entities[0]?.transformerPipeStack?.map((b) => b.pipeId)).toEqual(['p1', pipeId])
    expect(next.transformerPipes?.[pipeId]?.name).toBe('Pipe2')
    expect(focusPath).toEqual([{ kind: 'stack', index: 1 }])
  })

  it('decouples a linked stack binding into a copy for one entity', () => {
    const next = decoupleStackBindingToCopy(world, 'e1', 0)
    const e1 = next.entities.find((e) => e.id === 'e1')
    const binding = e1?.transformerPipeStack?.[0]
    expect(binding?.mode).toBe('copy')
    expect(binding?.localStageIds?.length).toBe(1)
    expect(binding?.localStageIds?.[0]).not.toBe('s1')
    expect(e1?.transformers?.[0]).toBe(binding?.localStageIds?.[0])
    const e2 = next.entities.find((e) => e.id === 'e2')
    expect(e2?.transformerPipeStack?.[0]?.mode).toBeUndefined()
    expect(e2?.transformers).toEqual(['s1'])
  })

  it('deletes a stack binding and syncs flatten cache', () => {
    const stacked: RennWorld = {
      ...world,
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's2'],
          transformerPipeStack: [{ pipeId: 'p1' }, { pipeId: 'p2' }],
        },
      ],
      transformerPipes: {
        p1: { id: 'p1', name: 'A', stageIds: ['s1'], stages: [{ type: 'input' }] },
        p2: { id: 'p2', name: 'B', stageIds: ['s2'], stages: [{ type: 'car2' }] },
      },
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2' },
      },
    }
    const next = deleteStackBinding(stacked, 'e1', 0)
    expect(next.entities[0]?.transformerPipeStack).toEqual([{ pipeId: 'p2' }])
    expect(next.entities[0]?.transformers).toEqual(['s2'])
  })

  it('nests a stack pipe into another pipe member list', () => {
    const nested: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', transformerPipeStack: [{ pipeId: 'outer' }, { pipeId: 'inner' }] }],
      transformers: { s1: { type: 'input' } },
      transformerPipes: {
        outer: {
          id: 'outer',
          name: 'Outer',
          stageIds: ['s1'],
          stages: [{ type: 'input' }],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
        inner: { id: 'inner', name: 'Inner', stageIds: [], stages: [] },
      },
    }
    const next = nestStackPipeAsMember(nested, 'e1', 1, 'outer')
    expect(next.entities[0]?.transformerPipeStack).toEqual([{ pipeId: 'outer' }])
    expect(next.transformerPipes?.outer?.members?.some((m) => m.kind === 'pipe' && m.pipeId === 'inner')).toBe(true)
  })

  it('promotes a nested pipe to the entity stack', () => {
    const nested: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', transformerPipeStack: [{ pipeId: 'outer' }], transformers: ['s1'] }],
      transformers: { s1: { type: 'input' } },
      transformerPipes: {
        outer: {
          id: 'outer',
          name: 'Outer',
          stageIds: ['s1'],
          stages: [{ type: 'input' }],
          members: [
            { kind: 'stage', stageId: 's1' },
            { kind: 'pipe', pipeId: 'inner' },
          ],
        },
        inner: { id: 'inner', name: 'Inner', stageIds: [], stages: [] },
      },
    }
    const next = promoteMemberPipeToStack(nested, 'e1', 'outer', 1)
    expect(getStackPipeIds(next.entities[0]!)).toEqual(['outer', 'inner'])
    expect(next.transformerPipes?.outer?.members?.some((m) => m.kind === 'pipe')).toBe(false)
  })

  it('moves a stage between pipes and syncs flatten order', () => {
    const twoPipes: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's2'],
          transformerPipeStack: [{ pipeId: 'p1' }, { pipeId: 'p2' }],
        },
      ],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2' },
      },
      transformerPipes: {
        p1: {
          id: 'p1',
          name: 'Pipe1',
          stageIds: ['s1'],
          stages: [{ type: 'input' }],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
        p2: {
          id: 'p2',
          name: 'Pipe2',
          stageIds: ['s2'],
          stages: [{ type: 'car2' }],
          members: [{ kind: 'stage', stageId: 's2' }],
        },
      },
    }
    const next = moveMemberStage(twoPipes, 'e1', 'p1', 0, 'p2', 0)
    expect(next.transformerPipes?.p1?.members).toEqual([])
    expect(next.transformerPipes?.p2?.members?.map((m) => m.kind === 'stage' ? m.stageId : null)).toEqual([
      's1',
      's2',
    ])
    expect(next.entities[0]?.transformers).toEqual(['s1', 's2'])
  })

  it('moves a stage into a nested pipe', () => {
    const nested: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', transformerPipeStack: [{ pipeId: 'outer' }], transformers: ['s1', 's2'] }],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2' },
      },
      transformerPipes: {
        outer: {
          id: 'outer',
          name: 'Outer',
          stageIds: ['s1'],
          stages: [{ type: 'input' }],
          members: [
            { kind: 'stage', stageId: 's1' },
            { kind: 'pipe', pipeId: 'inner' },
          ],
        },
        inner: {
          id: 'inner',
          name: 'Inner',
          stageIds: ['s2'],
          stages: [{ type: 'car2' }],
          members: [{ kind: 'stage', stageId: 's2' }],
        },
      },
    }
    const next = moveMemberStage(nested, 'e1', 'outer', 0, 'inner', 1)
    expect(next.transformerPipes?.outer?.members?.some((m) => m.kind === 'stage' && m.stageId === 's1')).toBe(false)
    expect(next.transformerPipes?.inner?.members?.map((m) => m.kind === 'stage' ? m.stageId : null)).toEqual([
      's2',
      's1',
    ])
  })

  it('detects cycle guard and ungrouped stages', () => {
    const pipes = {
      a: {
        id: 'a',
        name: 'A',
        stageIds: [],
        stages: [],
        members: [{ kind: 'pipe' as const, pipeId: 'b' }],
      },
      b: { id: 'b', name: 'B', stageIds: [], stages: [], members: [] },
    }
    expect(wouldNestCreateCycle(pipes, 'b', 'a')).toBe(true)
    expect(wouldNestCreateCycle(pipes, 'a', 'b')).toBe(false)

    const legacy: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', transformers: ['s1', 'orphan'], transformerPipeStack: [{ pipeId: 'p1' }] }],
      transformers: { s1: { type: 'input' }, orphan: { type: 'custom' } },
      transformerPipes: {
        p1: { id: 'p1', name: 'P', stageIds: ['s1'], stages: [{ type: 'input' }] },
      },
    }
    expect(findUngroupedStageIds(legacy, legacy.entities[0]!)).toEqual(['orphan'])
    const wrapped = wrapUngroupedStagesIntoStackPipe(legacy, 'e1', 'Pipe2')
    expect(findUngroupedStageIds(wrapped, wrapped.entities[0]!)).toEqual([])
    expect(wrapped.entities[0]?.transformerPipeStack).toEqual([{ pipeId: 'p1', enabled: true }])
    expect(wrapped.transformerPipes?.p1?.members?.map((m) => (m.kind === 'stage' ? m.stageId : null))).toEqual([
      's1',
      'orphan',
    ])
    const reconciled = reconcilePipeNavPath(legacy, legacy.entities[0]!, [{ kind: 'stack', index: 99 }], 3)
    expect(reconciled.path).toEqual([])
    expect(reconciled.selectedSiblingIndex).toBe(0)
  })
})

function getStackPipeIds(entity: RennWorld['entities'][number]): string[] {
  return (entity.transformerPipeStack ?? []).map((b) => b.pipeId)
}
