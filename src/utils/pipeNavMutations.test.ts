import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import { decoupleStackBindingToCopy, stageIdsForStackBinding } from './pipeNavMutations'

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
