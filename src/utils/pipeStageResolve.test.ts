import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import {
  buildEntityStageRuntimeContext,
  entityIdsAffectedByPipeParamChange,
  mergePipeParamLayers,
  resolveEntityTransformerConfigsForRuntime,
  resolveMergedTransformerConfigsForEntitySync,
  syncEntityTransformerIdsFromPipeTree,
} from './pipeStageResolve'

describe('pipeStageResolve', () => {
  it('merges param layers with narrower scope winning', () => {
    expect(
      mergePipeParamLayers([
        { speed: 1, height: 10 },
        { speed: 2 },
        { jump: 5 },
      ]),
    ).toEqual({ speed: 2, height: 10, jump: 5 })
  })

  it('cascades disabled ancestor pipes to descendants', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's2'],
          transformerPipeStack: [{ pipeId: 'root', enabled: false }],
        },
      ],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2', params: { power: 50 } },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Root',
          stageIds: ['s1', 's2'],
          stages: [],
          members: [
            { kind: 'stage', stageId: 's1' },
            { kind: 'stage', stageId: 's2' },
          ],
        },
      },
    }

    const { stageContext, flatEnabledStageIds, scopeEffectiveEnabled } =
      buildEntityStageRuntimeContext(world, world.entities[0]!)
    expect(flatEnabledStageIds).toEqual([])
    expect(stageContext.get('s1')?.effectivelyEnabled).toBe(false)
    expect(stageContext.get('s2')?.effectivelyEnabled).toBe(false)
    expect(scopeEffectiveEnabled.get('stack:0')).toBe(false)
    expect(syncEntityTransformerIdsFromPipeTree(world, world.entities[0]!)).toEqual([])
  })

  it('merges ancestor pipe params into stage runtime configs', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [
            {
              pipeId: 'root',
              params: { speed: 2 },
            },
          ],
        },
      ],
      transformers: {
        s1: { type: 'car2', params: { power: 99 } },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Root',
          stageIds: ['s1'],
          stages: [],
          defaultParams: { speed: 1, height: 10 },
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    const entity = world.entities[0]!
    const configs = resolveEntityTransformerConfigsForRuntime(world, entity)
    expect(configs?.[0]?.params).toEqual({ speed: 2, height: 10, power: 99 })
  })

  it('finds all entities referencing a pipe for shared default param sync', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'root' }] },
        { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'other' }] },
        {
          id: 'e3',
          transformers: ['s2'],
          transformerPipeStack: [{ pipeId: 'stack' }],
        },
      ],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2' },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Root',
          stageIds: ['s1'],
          stages: [],
          members: [
            { kind: 'stage', stageId: 's1' },
            { kind: 'pipe', pipeId: 'child' },
          ],
        },
        child: {
          id: 'child',
          name: 'Child',
          stageIds: [],
          stages: [],
          members: [],
        },
        other: {
          id: 'other',
          name: 'Other',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
        stack: {
          id: 'stack',
          name: 'Stack',
          stageIds: ['s2'],
          stages: [],
          members: [{ kind: 'pipe', pipeId: 'child' }],
        },
      },
    }

    expect(entityIdsAffectedByPipeParamChange(world, { pipeId: 'child', sharedDefaults: true })).toEqual([
      'e1',
      'e3',
    ])
    expect(entityIdsAffectedByPipeParamChange(world, { pipeId: 'root', entityId: 'e1' })).toEqual(['e1'])
  })

  it('resolveMergedTransformerConfigsForEntitySync matches runtime projection', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'root', params: { speed: 2 } }],
        },
      ],
      transformers: {
        s1: { type: 'car2', params: { power: 99 } },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Root',
          stageIds: ['s1'],
          stages: [],
          defaultParams: { speed: 1, height: 10 },
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    expect(resolveMergedTransformerConfigsForEntitySync(world, 'e1')?.[0]?.params).toEqual({
      speed: 2,
      height: 10,
      power: 99,
    })
  })

  it('disables nested subtree when nested pipe member is off', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's2'],
          transformerPipeStack: [{ pipeId: 'root' }],
        },
      ],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2' },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Root',
          stageIds: ['s1', 's2'],
          stages: [],
          members: [
            { kind: 'stage', stageId: 's1' },
            { kind: 'pipe', pipeId: 'child', enabled: false },
          ],
        },
        child: {
          id: 'child',
          name: 'Child',
          stageIds: ['s2'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's2' }],
        },
      },
    }

    const entity = world.entities[0]!
    const { flatEnabledStageIds, stageContext } = buildEntityStageRuntimeContext(world, entity)
    expect(flatEnabledStageIds).toEqual(['s1'])
    expect(stageContext.get('s2')?.effectivelyEnabled).toBe(false)
  })
})
