import { describe, it, expect } from 'vitest'
import type { TransformerPipe } from '@/types/transformer'
import type { Entity } from '@/types/world'
import {
  flattenPipeStageIds,
  getEntityPipeStack,
  normalizePipeMembers,
  collectPipeStageConfigsForCopy,
  TransformerPipeCycleError,
  resolveEntityPipeParamsByPipeId,
} from './transformerPipeResolve'

describe('transformerPipeResolve', () => {
  const flatPipe: TransformerPipe = {
    id: 'p-flat',
    name: 'Flat',
    stageIds: ['s1', 's2'],
    stages: [{ type: 'input' }, { type: 'car2' }],
  }

  const childPipe: TransformerPipe = {
    id: 'p-child',
    name: 'Child',
    stageIds: ['s3'],
    stages: [{ type: 'follow' }],
  }

  const manifoldPipe: TransformerPipe = {
    id: 'p-manifold',
    name: 'Manifold',
    stageIds: ['s1'],
    stages: [{ type: 'input' }],
    members: [
      { kind: 'pipe', pipeId: 'p-child' },
      { kind: 'stage', stageId: 's1' },
    ],
  }

  const registry = {
    'p-flat': flatPipe,
    'p-child': childPipe,
    'p-manifold': manifoldPipe,
  }

  it('normalizes legacy stageIds to members', () => {
    expect(normalizePipeMembers(flatPipe)).toEqual([
      { kind: 'stage', stageId: 's1' },
      { kind: 'stage', stageId: 's2' },
    ])
  })

  it('flattens a manifold depth-first in member order', () => {
    expect(flattenPipeStageIds(registry, 'p-manifold')).toEqual(['s3', 's1'])
  })

  it('detects circular pipe references', () => {
    const cyclic: TransformerPipe = {
      id: 'p-a',
      name: 'A',
      stageIds: [],
      stages: [],
      members: [{ kind: 'pipe', pipeId: 'p-b' }],
    }
    const cyclicB: TransformerPipe = {
      id: 'p-b',
      name: 'B',
      stageIds: [],
      stages: [],
      members: [{ kind: 'pipe', pipeId: 'p-a' }],
    }
    expect(() =>
      flattenPipeStageIds({ 'p-a': cyclic, 'p-b': cyclicB }, 'p-a'),
    ).toThrow(TransformerPipeCycleError)
  })

  it('resolves entity pipe stack with legacy fallback', () => {
    const legacy: Entity = { id: 'e1', transformerPipe: 'p-flat' }
    expect(getEntityPipeStack(legacy)).toEqual([{ pipeId: 'p-flat' }])

    const stacked: Entity = {
      id: 'e2',
      transformerPipeStack: [
        { pipeId: 'p-manifold' },
        { pipeId: 'p-flat', params: { speed: 2 } },
      ],
    }
    expect(getEntityPipeStack(stacked)).toHaveLength(2)
  })

  it('collects nested configs for copy mode', () => {
    const configs = collectPipeStageConfigsForCopy(registry, {}, manifoldPipe)
    expect(configs).toHaveLength(2)
    expect(configs[0]?.type).toBe('follow')
    expect(configs[1]?.type).toBe('input')
  })

  it('merges pipe params by pipe id', () => {
    const pipeWithDefaults: TransformerPipe = {
      ...flatPipe,
      defaultParams: { speed: 1 },
      paramDefs: [{ key: 'speed', type: 'number' }],
    }
    const world = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformerPipeStack: [{ pipeId: 'p-flat', params: { speed: 3 } }],
        },
      ],
      transformerPipes: { 'p-flat': pipeWithDefaults },
    }
    expect(resolveEntityPipeParamsByPipeId(world, world.entities[0]!)).toEqual({
      'p-flat': { speed: 3 },
    })
  })
})
