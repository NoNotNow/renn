import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import { mergeParamScopeLayers } from '@/utils/paramScopes'
import {
  flatIndexOffsetForStackBinding,
  resolveEntityStageRuntime,
  resolveMergedTransformerConfigsForEntitySync,
} from './pipeStageResolve'

describe('pipeStageResolve', () => {
  it('merges param layers with later layers winning', () => {
    expect(
      mergeParamScopeLayers([
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

    const runtime = resolveEntityStageRuntime(world, world.entities[0]!)
    expect(runtime.syncedStageIds()).toEqual([])
    expect(runtime.isScopeEnabled([{ kind: 'stack', index: 0 }])).toBe(false)
  })

  it('merges stage params with binding params — binding wins on conflict', () => {
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
        s1: { type: 'car2', params: { power: 99, height: 10 } },
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

    const configs = resolveEntityStageRuntime(world, world.entities[0]!).runtimeConfigs()
    expect(configs?.[0]?.params).toEqual({ power: 50, speed: 2, height: 10 })
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

    const carA = resolveEntityStageRuntime(world, world.entities[0]!).runtimeConfigs()
    const carB = resolveEntityStageRuntime(world, world.entities[1]!).runtimeConfigs()
    expect(carA?.[0]?.params).toEqual({ speed: 50, power: 10 })
    expect(carB?.[0]?.params).toEqual({ speed: 100, power: 10 })
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

    const configs = resolveEntityStageRuntime(world, world.entities[0]!).runtimeConfigs()
    expect(configs?.[0]?.params).toEqual({ speed: 50 })
    expect(configs?.[1]?.params).toEqual({ softness: 3 })
  })

  it('keeps disabled stages in the synced list for an entity with no pipe stack', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [{ id: 'e1', transformers: ['s1', 's2'] }],
      transformers: {
        s1: { type: 'input' },
        s2: { type: 'car2', enabled: false },
      },
    }

    const runtime = resolveEntityStageRuntime(world, world.entities[0]!)
    expect(runtime.syncedStageIds()).toEqual(['s1', 's2'])
    expect(runtime.isStageEnabledAt(0)).toBe(true)
    expect(runtime.isStageEnabledAt(1)).toBe(false)
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
      speed: 2,
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
    const runtime = resolveEntityStageRuntime(world, entity)
    expect(runtime.syncedStageIds()).toEqual(['s1'])
    expect(
      runtime.isScopeEnabled([
        { kind: 'stack', index: 0 },
        { kind: 'member', pipeId: 'root', memberIndex: 1 },
      ]),
    ).toBe(false)
  })

  it('pipe strip ancestor grey-out must use isScopeEnabled, not isStageEnabledAt', () => {
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
    const runtime = resolveEntityStageRuntime(world, entity)
    const childFocusPath = [
      { kind: 'stack' as const, index: 0 },
      { kind: 'member' as const, pipeId: 'root', memberIndex: 1 },
    ]

    expect(runtime.isScopeEnabled(childFocusPath)).toBe(false)

    const flatOffset = flatIndexOffsetForStackBinding(world, entity, 0)
    expect(runtime.isStageEnabledAt(flatOffset)).toBe(true)
  })

  it('stack-root scopeParams override wins over binding.params at nested stages', () => {
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
              params: { speed: 5 },
              scopeParams: { 'stack:0': { speed: 10 } },
            },
          ],
        },
      ],
      transformers: {
        s1: { type: 'car2' },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Root',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'pipe', pipeId: 'child' }],
        },
        child: {
          id: 'child',
          name: 'Child',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    const runtime = resolveEntityStageRuntime(world, world.entities[0]!)
    expect(runtime.mergedParamsAt(0)?.speed).toBe(10)
  })

  it('merges stage, binding, and scope params — narrowest scope wins', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's1'],
          transformerPipeStack: [
            {
              pipeId: 'root',
              params: { A: 1, B: 1 },
              scopeParams: { 'stack:0/member:root:1': { A: 2, B: 2, C: 3 } },
            },
          ],
        },
      ],
      transformers: {
        s1: { type: 'car2', params: { A: 0, D: 4 } },
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
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }

    const configs = resolveEntityStageRuntime(world, world.entities[0]!).runtimeConfigs()
    // flat index 0: stage under root (no nested scope) — stage + binding only
    expect(configs?.[0]?.params).toEqual({ A: 1, B: 1, D: 4 })
    // flat index 1: stage under child — stage + binding + scope params
    expect(configs?.[1]?.params).toEqual({ A: 2, B: 2, C: 3, D: 4 })
  })

  it('stage params alone are used when binding has no overrides', () => {
    const world: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'root' }],
        },
      ],
      transformers: {
        s1: { type: 'car2', params: { power: 400, lateralGrip: 100 } },
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

    const configs = resolveEntityStageRuntime(world, world.entities[0]!).runtimeConfigs()
    expect(configs?.[0]?.params).toEqual({ power: 400, lateralGrip: 100 })
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
        s1: { type: 'custom', code: 'api.watch(params);', params: { base: 1 } },
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

    const configs = resolveEntityStageRuntime(world, world.entities[0]!).runtimeConfigs()
    expect(configs?.[0]?.params).toEqual({ p1: 'p1', base: 1 })
    expect(configs?.[1]?.params).toEqual({ px: 'px', base: 1 })
  })
})
