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
  it('merges param layers with later layers winning', () => {
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

    const { stageContextByStageId, flatEnabledStageIds, scopeEffectiveEnabled } =
      buildEntityStageRuntimeContext(world, world.entities[0]!)
    expect(flatEnabledStageIds).toEqual([])
    expect(stageContextByStageId.get('s1')?.effectivelyEnabled).toBe(false)
    expect(stageContextByStageId.get('s2')?.effectivelyEnabled).toBe(false)
    expect(scopeEffectiveEnabled.get('stack:0')).toBe(false)
    expect(syncEntityTransformerIdsFromPipeTree(world, world.entities[0]!)).toEqual([])
  })

  it('binding params override shared stage registry params on key collision', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'root', params: { power: 50, speed: 2 } }],
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
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    const configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    expect(configs?.[0]?.params).toEqual({ power: 50, speed: 2 })
  })

  it('produces different merged runtime params for two entities on the same linked pipe', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'carA',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'drive', params: { speed: 50 } }],
        },
        {
          id: 'carB',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'drive', params: { speed: 100 } }],
        },
      ],
      transformers: {
        s1: { type: 'car2', params: { power: 10 } },
      },
      transformerPipes: {
        drive: {
          id: 'drive',
          name: 'Drive',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    const carA = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    const carB = resolveEntityTransformerConfigsForRuntime(world, world.entities[1]!)
    expect(carA?.[0]?.params).toEqual({ power: 10, speed: 50 })
    expect(carB?.[0]?.params).toEqual({ power: 10, speed: 100 })
  })

  it('merges independent params for two stack pipes on one entity', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's2'],
          transformerPipeStack: [
            { pipeId: 'drive', params: { speed: 50 } },
            { pipeId: 'steer', params: { softness: 3 } },
          ],
        },
      ],
      transformers: {
        s1: { type: 'car2' },
        s2: { type: 'input' },
      },
      transformerPipes: {
        drive: {
          id: 'drive',
          name: 'Drive',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
        steer: {
          id: 'steer',
          name: 'Steer',
          stageIds: ['s2'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's2' }],
        },
      },
    }

    const configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    expect(configs?.[0]?.params).toEqual({ speed: 50 })
    expect(configs?.[1]?.params).toEqual({ softness: 3 })
  })

  it('syncs only the edited entity after a pipe param change', () => {
    expect(entityIdsAffectedByPipeParamChange({} as RennWorld, { entityId: 'e1' })).toEqual(['e1'])
    expect(entityIdsAffectedByPipeParamChange({} as RennWorld, {})).toEqual([])
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
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    expect(resolveMergedTransformerConfigsForEntitySync(world, 'e1')?.[0]?.params).toEqual({
      power: 99,
      speed: 2,
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
    const { flatEnabledStageIds, stageContextByStageId } = buildEntityStageRuntimeContext(world, entity)
    expect(flatEnabledStageIds).toEqual(['s1'])
    expect(stageContextByStageId.get('s2')?.effectivelyEnabled).toBe(false)
  })

  it('isolates merged params per flat index when the same linked pipe appears twice on the stack', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's1'],
          transformerPipeStack: [
            { pipeId: 'root', params: { p1: 'p1' } },
            { pipeId: 'root', params: { px: 'px' } },
          ],
        },
      ],
      transformers: {
        s1: { type: 'custom', code: 'api.watch(params);' },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Pipe1',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    const configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    expect(configs?.[0]?.params).toEqual({ p1: 'p1' })
    expect(configs?.[1]?.params).toEqual({ px: 'px' })
  })
})
