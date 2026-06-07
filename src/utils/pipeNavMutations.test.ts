import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import {
  decoupleStackBindingToCopy,
  ensureEntityPipeStack,
  stageIdsForStackBinding,
} from './pipeNavMutations'

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
})
