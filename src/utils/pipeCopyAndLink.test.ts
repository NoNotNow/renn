import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { TransformerPipe, TransformerConfig } from '@/types/transformer'
import {
  assignPipeToEntity,
  clonePipeTreeForEntityCopy,
  countEntitiesLinkingPipe,
} from './commitTransformerConfigsToWorld'
import {
  addExistingPipeAtFocus,
  decoupleStackBindingToCopy,
  deletePipeMember,
  moveMemberStage,
  reorderPipeMembers,
  setBindingScopeParams,
  stageIdsForStackBinding,
  updateBindingParams,
  updateFocusedStageOrder,
} from './pipeNavMutations'
import { applyEntityTransformerSync } from './pipeNavResolve'
import {
  buildInitialBindingParams,
  collectPipeStageConfigsForCopy,
  entityLinksPipe,
  flattenPipeMembers,
  getEntityPipeStack,
  normalizePipeMembers,
} from './transformerPipeResolve'
import {
  pipeScopeKeyFromPath,
  resolveEditableScopeParams,
  resolveEntityTransformerConfigsForRuntime,
  resolveMergedTransformerConfigsForEntitySync,
} from './pipeStageResolve'

function baseWorld(overrides?: Partial<RennWorld>): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -9.81, 0] },
    assets: {},
    entities: [
      { id: 'e1', bodyType: 'dynamic', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [0, 0, 0] },
      { id: 'e2', bodyType: 'dynamic', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [1, 0, 0] },
    ],
    transformers: {},
    ...overrides,
  }
}

function twoStagePipe(overrides?: Partial<TransformerPipe>): TransformerPipe {
  return {
    id: 'drive',
    name: 'Drive Pipe',
    stageIds: ['s1', 's2'],
    stages: [
      { type: 'input', priority: 0, name: 'Input' },
      { type: 'car2', priority: 1, name: 'Drive' },
    ],
    members: [
      { kind: 'stage', stageId: 's1' },
      { kind: 'stage', stageId: 's2' },
    ],
    createdAt: 1000,
    ...overrides,
  }
}

function linkedTwoEntityWorld(): RennWorld {
  const world = baseWorld({
    transformers: {
      s1: { type: 'input', priority: 0, name: 'Input' },
      s2: { type: 'car2', priority: 1, name: 'Drive' },
    },
    transformerPipes: { drive: twoStagePipe() },
  })
  const e1 = assignPipeToEntity(world, 'e1', twoStagePipe(), 'linked')
  return assignPipeToEntity(e1, 'e2', twoStagePipe(), 'linked')
}

function entityIdsLinkingPipe(world: RennWorld, pipeId: string): string[] {
  return world.entities
    .filter((e) => getEntityPipeStack(e).some((b) => b.pipeId === pipeId && b.mode !== 'copy'))
    .map((e) => e.id)
}

/** Mirror pipe-def edit + per-entity flatten sync (linked entities must all refresh). */
function syncAllLinkedEntitiesForPipe(world: RennWorld, pipeId: string): RennWorld {
  let next = world
  for (const entityId of entityIdsLinkingPipe(next, pipeId)) {
    next = applyEntityTransformerSync(next, entityId)
  }
  return next
}

function appendStageToPipe(
  world: RennWorld,
  entityId: string,
  pipeId: string,
  stageId: string,
  config: TransformerConfig,
): RennWorld {
  const entity = world.entities.find((e) => e.id === entityId)
  const pipe = world.transformerPipes?.[pipeId]
  if (!entity || !pipe) return world
  const members = [...normalizePipeMembers(pipe), { kind: 'stage' as const, stageId }]
  const stageIds = members.filter((m) => m.kind === 'stage').map((m) => m.stageId)
  const nextWorld: RennWorld = {
    ...world,
    transformers: { ...(world.transformers ?? {}), [stageId]: config },
    transformerPipes: {
      ...(world.transformerPipes ?? {}),
      [pipeId]: { ...pipe, members, stageIds },
    },
  }
  const binding = getEntityPipeStack(entity).find((b) => b.pipeId === pipeId)
  if (binding?.mode === 'copy') {
    return applyEntityTransformerSync(nextWorld, entityId)
  }
  return syncAllLinkedEntitiesForPipe(nextWorld, pipeId)
}

function drivePipe(overrides?: Partial<TransformerPipe>): TransformerPipe {
  return {
    id: 'drive',
    name: 'Drive',
    stageIds: ['s1'],
    stages: [{ type: 'car2', priority: 0, params: { power: 10 } }],
    members: [{ kind: 'stage', stageId: 's1' }],
    paramDefs: [
      { key: 'speed', type: 'number', default: 5 },
      { key: 'boost', type: 'boolean', default: false },
    ],
    createdAt: 1000,
    ...overrides,
  }
}

function steerPipe(overrides?: Partial<TransformerPipe>): TransformerPipe {
  return {
    id: 'steer',
    name: 'Steer',
    stageIds: ['s2'],
    stages: [{ type: 'input', priority: 1 }],
    members: [{ kind: 'stage', stageId: 's2' }],
    paramDefs: [{ key: 'softness', type: 'number', default: 3 }],
    createdAt: 1000,
    ...overrides,
  }
}

function nestedManifoldWorld(): RennWorld {
  return baseWorld({
    entities: [
      {
        id: 'e1',
        transformers: ['s1', 's2'],
        transformerPipeStack: [{ pipeId: 'root', params: { grip: 1 } }],
      },
      {
        id: 'e2',
        transformers: ['s1', 's2'],
        transformerPipeStack: [{ pipeId: 'root', params: { grip: 2 } }],
      },
    ],
    transformers: {
      s1: { type: 'input', priority: 0, params: { power: 5 } },
      s2: { type: 'car2', priority: 1, params: { power: 8 } },
    },
    transformerPipes: {
      root: {
        id: 'root',
        name: 'Root',
        stageIds: ['s1', 's2'],
        stages: [
          { type: 'input', priority: 0 },
          { type: 'car2', priority: 1 },
        ],
        members: [
          { kind: 'stage', stageId: 's1' },
          { kind: 'pipe', pipeId: 'nested' },
        ],
        paramDefs: [{ key: 'grip', type: 'number', default: 0 }],
      },
      nested: {
        id: 'nested',
        name: 'Nested',
        stageIds: ['s2'],
        stages: [{ type: 'car2', priority: 1 }],
        members: [{ kind: 'stage', stageId: 's2' }],
      },
    },
  })
}

function runtimeParams(world: RennWorld, entityId: string): Record<string, unknown>[] {
  const entity = world.entities.find((e) => e.id === entityId)!
  return (resolveEntityTransformerConfigsForRuntime(world, entity) ?? []).map((c) => c.params ?? {})
}

function bindingParams(world: RennWorld, entityId: string, stackIndex = 0): Record<string, unknown> | undefined {
  return world.entities.find((e) => e.id === entityId)?.transformerPipeStack?.[stackIndex]?.params
}

function stackBindingPipeId(world: RennWorld, entityId: string, stackIndex = 0): string {
  const pipeId = world.entities.find((e) => e.id === entityId)?.transformerPipeStack?.[stackIndex]?.pipeId
  if (pipeId == null) throw new Error(`missing pipe binding for ${entityId} at stack index ${stackIndex}`)
  return pipeId
}

function firstTransformerId(world: RennWorld, entityId: string): string {
  const stageId = world.entities.find((e) => e.id === entityId)?.transformers?.[0]
  if (stageId == null) throw new Error(`missing transformer for ${entityId}`)
  return stageId
}

describe('pipe copy and link — assignPipeToEntity', () => {
  const world = baseWorld({
    transformers: { s1: { type: 'car2', priority: 0, params: { power: 10 } } },
    transformerPipes: { drive: drivePipe() },
  })

  it('linked mode shares registry stage ids and omits mode on binding', () => {
    const next = assignPipeToEntity(world, 'e1', drivePipe(), 'linked')
    const e1 = next.entities.find((e) => e.id === 'e1')!
    expect(e1.transformers).toEqual(['s1'])
    expect(e1.transformerPipeStack?.[0]).toEqual({
      pipeId: 'drive',
      enabled: true,
      params: { speed: 5, boost: false },
    })
    expect(e1.transformerPipeStack?.[0]?.mode).toBeUndefined()
    expect(countEntitiesLinkingPipe(next, 'drive')).toBe(1)
    expect(entityLinksPipe(e1, 'drive')).toBe(true)
  })

  it('copy mode clones pipe and stages with independent registry ids', () => {
    const next = assignPipeToEntity(world, 'e1', drivePipe(), 'copy')
    const e1 = next.entities.find((e) => e.id === 'e1')!
    const binding = e1.transformerPipeStack?.[0]
    expect(binding?.mode).toBe('copy')
    expect(binding?.pipeId).not.toBe('drive')
    expect(e1.transformers?.[0]).toMatch(/^e1_tf/)
    expect(e1.transformers?.[0]).not.toBe('s1')
    expect(next.transformerPipes?.[binding!.pipeId]?.name).toBe('Drive (copy)')
    expect(next.transformers?.[e1.transformers![0]!]).toMatchObject({
      type: 'car2',
      params: { power: 10 },
    })
    expect(countEntitiesLinkingPipe(next, 'drive')).toBe(0)
    expect(entityLinksPipe(e1, binding!.pipeId)).toBe(false)
  })

  it('copy mode seeds binding.params from paramDefs defaults', () => {
    const next = assignPipeToEntity(world, 'e1', drivePipe(), 'copy')
    const binding = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    expect(binding?.params).toEqual({ speed: 5, boost: false })
  })

  it('accepts explicit params overrides on assign', () => {
    const next = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', {
      params: { speed: 99, custom: 'x' },
    })
    const binding = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    expect(binding?.params).toEqual({ speed: 99, boost: false, custom: 'x' })
  })

  it('linked append keeps prior bindings and seeds params on the new binding only', () => {
    const first = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 1 } })
    const steerPipe: TransformerPipe = {
      id: 'steer',
      name: 'Steer',
      stageIds: ['s2'],
      stages: [{ type: 'input', priority: 1 }],
      paramDefs: [{ key: 'softness', type: 'number', default: 3 }],
    }
    const withSteer: RennWorld = {
      ...first,
      transformerPipes: { ...first.transformerPipes, steer: steerPipe },
      transformers: { ...first.transformers, s2: { type: 'input', priority: 1 } },
    }
    const next = assignPipeToEntity(withSteer, 'e1', steerPipe, 'linked', { append: true })
    const e1 = next.entities.find((e) => e.id === 'e1')!
    expect(e1.transformerPipeStack).toEqual([
      { pipeId: 'drive', enabled: true, params: { speed: 1, boost: false } },
      { pipeId: 'steer', enabled: true, params: { softness: 3 } },
    ])
    expect(e1.transformers).toEqual(['s1', 's2'])
  })

  it('copy append creates a second independent pipe on the stack', () => {
    const first = assignPipeToEntity(world, 'e1', drivePipe(), 'copy')
    const binding1 = first.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    const next = assignPipeToEntity(first, 'e1', drivePipe(), 'copy', { append: true })
    const e1 = next.entities.find((e) => e.id === 'e1')!
    const bindings = e1.transformerPipeStack ?? []
    expect(bindings).toHaveLength(2)
    expect(bindings[0]?.mode).toBe('copy')
    expect(bindings[1]?.mode).toBe('copy')
    expect(bindings[0]?.pipeId).not.toBe(bindings[1]?.pipeId)
    expect(bindings[0]?.pipeId).toBe(binding1?.pipeId)
    expect(e1.transformers).toHaveLength(2)
    expect(e1.transformers![0]).not.toBe(e1.transformers![1])
  })
})

describe('pipe copy and link — addExistingPipeAtFocus (stack root)', () => {
  const world = baseWorld({
    entities: [
      {
        id: 'e1',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'existing', enabled: true, params: { speed: 1 } }],
      },
    ],
    transformers: { s1: { type: 'input', priority: 0 } },
    transformerPipes: {
      existing: {
        id: 'existing',
        name: 'Existing',
        stageIds: ['s1'],
        stages: [{ type: 'input', priority: 0 }],
        members: [{ kind: 'stage', stageId: 's1' }],
      },
      donor: drivePipe({ id: 'donor', name: 'Donor', stageIds: ['d1'], members: [{ kind: 'stage', stageId: 'd1' }] }),
    },
  })
  const withDonorStage: RennWorld = {
    ...world,
    transformers: { ...world.transformers, d1: { type: 'car2', priority: 0, params: { power: 10 } } },
  }

  it('link appends a shared binding and concatenates shared stage ids', () => {
    const donor = withDonorStage.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(withDonorStage, 'e1', donor, 'linked', [])
    const e1 = next.entities.find((e) => e.id === 'e1')!
    expect(e1.transformerPipeStack?.map((b) => b.pipeId)).toEqual(['existing', 'donor'])
    expect(e1.transformerPipeStack?.[1]?.mode).toBeUndefined()
    expect(e1.transformers).toEqual(['s1', 'd1'])
    expect(countEntitiesLinkingPipe(next, 'donor')).toBe(1)
  })

  it('link seeds binding.params from paramDefs on the added pipe', () => {
    const donor = withDonorStage.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(withDonorStage, 'e1', donor, 'linked', [])
    const added = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[1]
    expect(added?.params).toEqual({ speed: 5, boost: false })
  })

  it('copy appends an independent binding with entity-local stage ids', () => {
    const donor = withDonorStage.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(withDonorStage, 'e1', donor, 'copy', [])
    const e1 = next.entities.find((e) => e.id === 'e1')!
    const added = e1.transformerPipeStack?.[1]
    expect(added?.mode).toBe('copy')
    expect(added?.pipeId).not.toBe('donor')
    expect(next.transformerPipes?.[added!.pipeId]?.name).toBe('Donor (copy)')
    expect(e1.transformers).toEqual(['s1', expect.stringMatching(/^e1_tf/)])
    expect(e1.transformers?.[1]).not.toBe('d1')
    expect(countEntitiesLinkingPipe(next, 'donor')).toBe(0)
  })

  it('copy seeds binding.params from paramDefs independently of other bindings', () => {
    const donor = withDonorStage.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(withDonorStage, 'e1', donor, 'copy', [])
    const stack = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack ?? []
    expect(stack[0]?.params).toEqual({ speed: 1 })
    expect(stack[1]?.params).toEqual({ speed: 5, boost: false })
  })

  it('does not mutate the donor pipe definition when copying', () => {
    const donor = withDonorStage.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(withDonorStage, 'e1', donor, 'copy', [])
    expect(next.transformerPipes?.donor?.stageIds).toEqual(['d1'])
    expect(next.transformerPipes?.donor?.name).toBe('Donor')
  })
})

describe('pipe copy and link — decoupleStackBindingToCopy', () => {
  const sharedWorld: RennWorld = {
    ...baseWorld(),
    entities: [
      {
        id: 'e1',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'drive', params: { speed: 50, boost: true } }],
      },
      {
        id: 'e2',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'drive', params: { speed: 100 } }],
      },
    ],
    transformers: { s1: { type: 'car2', params: { power: 10 } } },
    transformerPipes: { drive: drivePipe() },
  }

  it('converts one linked binding to copy while preserving binding.params', () => {
    const next = decoupleStackBindingToCopy(sharedWorld, 'e1', 0)
    const e1 = next.entities.find((e) => e.id === 'e1')!
    const binding = e1.transformerPipeStack?.[0]
    expect(binding?.mode).toBe('copy')
    expect(binding?.params).toEqual({ speed: 50, boost: true })
    expect(binding?.pipeId).not.toBe('drive')
    expect(e1.transformers?.[0]).toMatch(/^e1_tf/)
    expect(e1.transformers?.[0]).not.toBe('s1')
  })

  it('leaves other entities linked to the original pipe', () => {
    const next = decoupleStackBindingToCopy(sharedWorld, 'e1', 0)
    const e2 = next.entities.find((e) => e.id === 'e2')!
    expect(e2.transformerPipeStack?.[0]).toEqual({ pipeId: 'drive', params: { speed: 100 } })
    expect(e2.transformers).toEqual(['s1'])
    expect(countEntitiesLinkingPipe(next, 'drive')).toBe(1)
  })

  it('isolates structure edits after decouple from linked siblings', () => {
    const decoupled = decoupleStackBindingToCopy(sharedWorld, 'e1', 0)
    const copyPipeId = decoupled.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.pipeId
    const withCopyEdit = {
      ...decoupled,
      transformerPipes: {
        ...decoupled.transformerPipes,
        [copyPipeId!]: {
          ...decoupled.transformerPipes![copyPipeId!]!,
          stageIds: [...decoupled.transformerPipes![copyPipeId!]!.stageIds, 'e1_tf1'],
          members: [
            ...(decoupled.transformerPipes![copyPipeId!]!.members ?? []),
            { kind: 'stage' as const, stageId: 'e1_tf1' },
          ],
        },
      },
      transformers: {
        ...decoupled.transformers,
        e1_tf1: { type: 'input', priority: 1 },
      },
    }
    const syncedE1 = applyEntityTransformerSync(withCopyEdit, 'e1')
    const syncedE2 = applyEntityTransformerSync(syncedE1, 'e2')
    expect(syncedE2.entities.find((e) => e.id === 'e1')?.transformers).toHaveLength(2)
    expect(syncedE2.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s1'])
  })
})

describe('pipe copy and link — clonePipeTreeForEntityCopy', () => {
  it('clones stage registry params into entity-local ids', () => {
    const world = baseWorld({
      transformerPipes: { drive: drivePipe() },
      transformers: { s1: { type: 'car2', params: { power: 77, grip: 2 } } },
    })
    const { world: next, flatStageIds } = clonePipeTreeForEntityCopy(world, 'e1', drivePipe())
    expect(flatStageIds).toHaveLength(1)
    expect(next.transformers?.[flatStageIds[0]!]).toEqual({
      type: 'car2',
      params: { power: 77, grip: 2 },
    })
    expect(next.transformers?.s1).toEqual({ type: 'car2', params: { power: 77, grip: 2 } })
  })

  it('preserves paramDefs on the cloned pipe definition', () => {
    const world = baseWorld({
      transformerPipes: { drive: drivePipe() },
      transformers: { s1: { type: 'car2' } },
    })
    const { world: next, rootPipeId } = clonePipeTreeForEntityCopy(world, 'e1', drivePipe())
    expect(next.transformerPipes?.[rootPipeId]?.paramDefs).toEqual(drivePipe().paramDefs)
  })

  it('collectPipeStageConfigsForCopy prefers live registry over inline snapshots', () => {
    const registry = { drive: drivePipe() }
    const configs = collectPipeStageConfigsForCopy(
      registry,
      { s1: { type: 'car2', params: { power: 42 } } },
      drivePipe(),
    )
    expect(configs[0]?.params).toEqual({ power: 42 })
  })
})

describe('pipe copy and link — runtime param projection', () => {
  it('linked entity receives only binding params at runtime, not stage registry params', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'drive', params: { speed: 50, power: 99 } }],
        },
      ],
      transformers: { s1: { type: 'car2', params: { power: 10, grip: 1 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    expect(configs?.[0]?.params).toEqual({ speed: 50, power: 99 })
  })

  it('copy-mode entity receives only binding params at runtime', () => {
    const assigned = assignPipeToEntity(
      baseWorld({
        transformers: { s1: { type: 'car2', params: { power: 10 } } },
        transformerPipes: { drive: drivePipe() },
      }),
      'e1',
      drivePipe(),
      'copy',
      { params: { speed: 33 } },
    )
    const e1 = assigned.entities[0]!
    const configs = resolveEntityTransformerConfigsForRuntime(assigned, e1)
    expect(configs?.[0]?.params).toEqual({ speed: 33, boost: false })
    expect(resolveEditableScopeParams(e1.transformerPipeStack?.[0], drivePipe())).toEqual({ speed: 33, boost: false })
  })

  it('decoupled copy keeps independent runtime params from linked sibling', () => {
    const decoupled = decoupleStackBindingToCopy(
      {
        ...baseWorld(),
        entities: [
          { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 50 } }] },
          { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 100 } }] },
        ],
        transformers: { s1: { type: 'car2', params: { power: 10 } } },
        transformerPipes: { drive: drivePipe() },
      },
      'e1',
      0,
    )
    const carA = resolveMergedTransformerConfigsForEntitySync(decoupled, 'e1')
    const carB = resolveMergedTransformerConfigsForEntitySync(decoupled, 'e2')
    expect(carA?.[0]?.params).toEqual({ speed: 50 })
    expect(carB?.[0]?.params).toEqual({ speed: 100 })
  })

  it('duplicate linked pipes on one stack keep independent runtime params per flat index', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's1'],
          transformerPipeStack: [
            { pipeId: 'drive', params: { speed: 10 } },
            { pipeId: 'drive', params: { speed: 20 } },
          ],
        },
      ],
      transformers: { s1: { type: 'car2', params: { power: 5 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    expect(configs?.[0]?.params).toEqual({ speed: 10 })
    expect(configs?.[1]?.params).toEqual({ speed: 20 })
  })
})

describe('pipe copy and link — paramDefs helper', () => {
  it('buildInitialBindingParams merges defaults then overrides', () => {
    const pipe = drivePipe()
    expect(buildInitialBindingParams(pipe)).toEqual({ speed: 5, boost: false })
    expect(buildInitialBindingParams(pipe, { speed: 9, extra: 1 })).toEqual({
      speed: 9,
      boost: false,
      extra: 1,
    })
    expect(buildInitialBindingParams({ ...pipe, paramDefs: undefined })).toBeUndefined()
  })
})

describe('pipe copy and link — nested addExistingPipeAtFocus', () => {
  const nestedWorld: RennWorld = {
    ...baseWorld(),
    entities: [
      {
        id: 'e1',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'outer', params: { speed: 7 } }],
      },
    ],
    transformers: { s1: { type: 'input' }, d1: { type: 'car2', params: { power: 8 } } },
    transformerPipes: {
      outer: {
        id: 'outer',
        name: 'Outer',
        stageIds: ['s1'],
        stages: [{ type: 'input' }],
        members: [{ kind: 'stage', stageId: 's1' }],
      },
      donor: drivePipe({ id: 'donor', name: 'Donor', stageIds: ['d1'], members: [{ kind: 'stage', stageId: 'd1' }] }),
    },
  }

  it('link nested member shares donor pipe id without cloning registry', () => {
    const donor = nestedWorld.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(nestedWorld, 'e1', donor, 'linked', [
      { kind: 'stack', index: 0 },
    ])
    expect(next.transformerPipes?.outer?.members?.some((m) => m.kind === 'pipe' && m.pipeId === 'donor')).toBe(true)
    expect(next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.params).toEqual({ speed: 7 })
    expect(countEntitiesLinkingPipe(next, 'donor')).toBe(0)
  })

  it('copy nested member clones donor into a private nested pipe id', () => {
    const donor = nestedWorld.transformerPipes!.donor!
    const { world: next } = addExistingPipeAtFocus(nestedWorld, 'e1', donor, 'copy', [
      { kind: 'stack', index: 0 },
    ])
    const nestedMember = next.transformerPipes?.outer?.members?.find((m) => m.kind === 'pipe')
    expect(nestedMember?.pipeId).not.toBe('donor')
    expect(next.transformerPipes?.[nestedMember!.pipeId]?.name).toBe('Donor (copy)')
    expect(next.transformerPipes?.donor?.stageIds).toEqual(['d1'])
  })
})

describe('pipe copy and link — per-entity param isolation on link', () => {
  it('second linked entity gets fresh paramDefs defaults, not the first entity binding values', () => {
    const world = baseWorld({
      transformers: { s1: { type: 'car2' } },
      transformerPipes: { drive: drivePipe() },
    })
    const e1Linked = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 99 } })
    const bothLinked = assignPipeToEntity(e1Linked, 'e2', drivePipe(), 'linked')
    const e2Binding = bothLinked.entities.find((e) => e.id === 'e2')?.transformerPipeStack?.[0]
    expect(e2Binding?.params).toEqual({ speed: 5, boost: false })
    expect(bothLinked.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.params).toEqual({
      speed: 99,
      boost: false,
    })
  })

  it('runtime params stay isolated when two entities share a linked pipe', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 10 } }] },
        { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 20 } }] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 5 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const e1Configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[0]!)
    const e2Configs = resolveEntityTransformerConfigsForRuntime(world, world.entities[1]!)
    expect(e1Configs?.[0]?.params?.speed).toBe(10)
    expect(e2Configs?.[0]?.params?.speed).toBe(20)
    expect(e1Configs?.[0]?.params?.power).toBeUndefined()
    expect(e2Configs?.[0]?.params?.power).toBeUndefined()
  })
})

describe('pipe copy and link — transformer order within a pipe', () => {
  it('linked assign preserves manifold member order in entity.transformers', () => {
    const world = linkedTwoEntityWorld()
    expect(world.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's2'])
    expect(world.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s1', 's2'])
    expect(flattenPipeMembers(world.transformerPipes!.drive!, world.transformerPipes!)).toEqual([
      's1',
      's2',
    ])
  })

  it('copy assign preserves stage order with entity-local registry ids', () => {
    const world = baseWorld({
      transformers: {
        s1: { type: 'input', priority: 0 },
        s2: { type: 'car2', priority: 1 },
      },
      transformerPipes: { drive: twoStagePipe() },
    })
    const next = assignPipeToEntity(world, 'e1', twoStagePipe(), 'copy')
    const e1 = next.entities.find((e) => e.id === 'e1')!
    const ids = e1.transformers ?? []
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(/^e1_tf/)
    expect(ids[1]).toMatch(/^e1_tf/)
    expect(ids[0]).not.toBe(ids[1])
    expect(next.transformers?.[ids[0]!]?.type).toBe('input')
    expect(next.transformers?.[ids[1]!]?.type).toBe('car2')
    expect(stageIdsForStackBinding(next, e1, 0)).toEqual(ids)
  })

  it('runtime config order matches entity.transformers order for linked pipes', () => {
    const world = linkedTwoEntityWorld()
    const e1 = world.entities.find((e) => e.id === 'e1')!
    const configs = resolveEntityTransformerConfigsForRuntime(world, e1)
    expect(configs?.map((c) => c.type)).toEqual(['input', 'car2'])
    expect(configs?.map((c) => c.name)).toEqual(['Input', 'Drive'])
  })
})

describe('pipe copy and link — reorder stages within a pipe', () => {
  it('linked: reordering pipe members updates transformer order for all linked entities', () => {
    const world = linkedTwoEntityWorld()
    const reordered = reorderPipeMembers(world, 'drive', 0, 1)
    expect(reordered.transformerPipes?.drive?.members?.map((m) => (m.kind === 'stage' ? m.stageId : null))).toEqual([
      's2',
      's1',
    ])
    expect(reordered.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s2', 's1'])
    expect(reordered.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s2', 's1'])
  })

  it('copy: reordering copy pipe members only updates the copy entity', () => {
    const linked = linkedTwoEntityWorld()
    const mixed = assignPipeToEntity(linked, 'e2', twoStagePipe(), 'copy')
    const copyPipeId = stackBindingPipeId(mixed, 'e2')
    const reordered = reorderPipeMembers(mixed, copyPipeId, 0, 1)
    const synced = applyEntityTransformerSync(reordered, 'e2')
    expect(synced.entities.find((e) => e.id === 'e2')?.transformers).toHaveLength(2)
    const copyIds = synced.entities.find((e) => e.id === 'e2')?.transformers ?? []
    expect(synced.transformers?.[copyIds[0]!]?.type).toBe('car2')
    expect(synced.transformers?.[copyIds[1]!]?.type).toBe('input')
    expect(synced.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's2'])
    expect(synced.transformerPipes?.drive?.members?.map((m) => (m.kind === 'stage' ? m.stageId : null))).toEqual([
      's1',
      's2',
    ])
  })

  it('updateFocusedStageOrder reorders stages and syncs entity flatten cache', () => {
    const world = linkedTwoEntityWorld()
    const next = updateFocusedStageOrder(world, 'e1', [{ kind: 'stack', index: 0 }], ['s2', 's1'])
    expect(next.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s2', 's1'])
    expect(next.transformerPipes?.drive?.members?.[0]).toEqual({ kind: 'stage', stageId: 's2' })
    expect(next.transformerPipes?.drive?.members?.[1]).toEqual({ kind: 'stage', stageId: 's1' })
  })
})

describe('pipe copy and link — remove stages within a pipe', () => {
  it('linked: removing a stage updates pipe members and all linked entity transformers', () => {
    const world = linkedTwoEntityWorld()
    const removed = deletePipeMember(world, 'e1', 'drive', 0)
    expect(removed.transformerPipes?.drive?.members).toEqual([{ kind: 'stage', stageId: 's2' }])
    expect(removed.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s2'])
    expect(removed.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s2'])
    expect(removed.transformers?.s1).toBeDefined()
  })

  it('copy: removing a stage from copy pipe does not affect linked entities or source pipe', () => {
    const linked = linkedTwoEntityWorld()
    const mixed = assignPipeToEntity(linked, 'e2', twoStagePipe(), 'copy')
    const copyPipeId = stackBindingPipeId(mixed, 'e2')
    const removed = deletePipeMember(mixed, 'e2', copyPipeId, 0)
    expect(removed.transformerPipes?.[copyPipeId]?.members).toEqual([{ kind: 'stage', stageId: expect.stringMatching(/^e2_tf/) }])
    expect(removed.entities.find((e) => e.id === 'e2')?.transformers).toHaveLength(1)
    expect(removed.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's2'])
    expect(removed.transformerPipes?.drive?.members).toHaveLength(2)
  })
})

describe('pipe copy and link — add stages within a pipe', () => {
  it('linked: appending a stage extends pipe members and all linked entity transformers', () => {
    const world = linkedTwoEntityWorld()
    const withStage = appendStageToPipe(world, 'e1', 'drive', 's3', {
      type: 'follow',
      priority: 2,
      name: 'Follow',
    })
    expect(withStage.transformerPipes?.drive?.members?.map((m) => (m.kind === 'stage' ? m.stageId : null))).toEqual([
      's1',
      's2',
      's3',
    ])
    expect(withStage.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's2', 's3'])
    expect(withStage.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s1', 's2', 's3'])
  })

  it('copy: appending a stage to copy pipe only updates that entity', () => {
    const linked = linkedTwoEntityWorld()
    const mixed = assignPipeToEntity(linked, 'e2', twoStagePipe(), 'copy')
    const copyPipeId = stackBindingPipeId(mixed, 'e2')
    const newStageId = 'e2_tf2'
    const withStage = appendStageToPipe(mixed, 'e2', copyPipeId, newStageId, {
      type: 'follow',
      priority: 2,
    })
    expect(withStage.transformerPipes?.[copyPipeId]?.members).toHaveLength(3)
    expect(withStage.entities.find((e) => e.id === 'e2')?.transformers).toHaveLength(3)
    expect(withStage.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's2'])
    expect(withStage.transformerPipes?.drive?.members).toHaveLength(2)
    expect(withStage.transformers?.[newStageId]).toMatchObject({ type: 'follow' })
  })
})

describe('pipe copy and link — move stages within and between pipes', () => {
  it('linked: moving a stage within the same pipe reorders all linked entity transformers', () => {
    const world = linkedTwoEntityWorld()
    const moved = moveMemberStage(world, 'e1', 'drive', 0, 'drive', 2)
    expect(moved.transformerPipes?.drive?.members?.map((m) => (m.kind === 'stage' ? m.stageId : null))).toEqual([
      's2',
      's1',
    ])
    expect(moved.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s2', 's1'])
    expect(moved.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s2', 's1'])
  })

  it('copy: moving a stage within copy pipe only reorders that entity', () => {
    const linked = linkedTwoEntityWorld()
    const mixed = assignPipeToEntity(linked, 'e2', twoStagePipe(), 'copy')
    const copyPipeId = stackBindingPipeId(mixed, 'e2')
    const moved = reorderPipeMembers(mixed, copyPipeId, 0, 1)
    const synced = applyEntityTransformerSync(moved, 'e2')
    const copyIds = synced.entities.find((e) => e.id === 'e2')?.transformers ?? []
    expect(synced.transformers?.[copyIds[0]!]?.type).toBe('car2')
    expect(synced.transformers?.[copyIds[1]!]?.type).toBe('input')
    expect(synced.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's2'])
  })

  it('linked: moving a stage into a nested pipe preserves depth-first flatten order', () => {
    const base = linkedTwoEntityWorld()
    const world: RennWorld = {
      ...base,
      transformerPipes: {
        drive: {
          ...twoStagePipe(),
          members: [
            { kind: 'stage', stageId: 's1' },
            { kind: 'pipe', pipeId: 'nested' },
            { kind: 'stage', stageId: 's2' },
          ],
        },
        nested: {
          id: 'nested',
          name: 'Nested',
          stageIds: ['s3'],
          stages: [{ type: 'follow', priority: 2 }],
          members: [{ kind: 'stage', stageId: 's3' }],
        },
      },
      transformers: {
        s1: { type: 'input', priority: 0 },
        s2: { type: 'car2', priority: 1 },
        s3: { type: 'follow', priority: 2 },
      },
    }
    const synced = syncAllLinkedEntitiesForPipe(world, 'drive')
    expect(synced.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's3', 's2'])

    const moved = moveMemberStage(synced, 'e1', 'drive', 2, 'nested', 1)
    expect(moved.transformerPipes?.nested?.members?.map((m) => (m.kind === 'stage' ? m.stageId : null))).toEqual([
      's3',
      's2',
    ])
    expect(moved.transformerPipes?.drive?.members?.some((m) => m.kind === 'stage' && m.stageId === 's2')).toBe(false)
    expect(moved.entities.find((e) => e.id === 'e1')?.transformers).toEqual(['s1', 's3', 's2'])
    expect(moved.entities.find((e) => e.id === 'e2')?.transformers).toEqual(['s1', 's3', 's2'])
  })
})

describe('pipe copy and link — binding param writes (spec: per-entity only)', () => {
  it('linked: updateBindingParams on one entity does not mutate sibling binding storage', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 10 } }] },
        { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 20 } }] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 5 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const next = updateBindingParams(world, 'e1', 0, { speed: 99, extra: 'x' })
    expect(bindingParams(next, 'e1')).toEqual({ speed: 99, extra: 'x' })
    expect(bindingParams(next, 'e2')).toEqual({ speed: 20 })
    expect(runtimeParams(next, 'e1')[0]).toEqual({ speed: 99, extra: 'x' })
    expect(runtimeParams(next, 'e2')[0]).toEqual({ speed: 20 })
  })

  it('linked: partial param merge keeps unspecified keys on the same binding', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'drive', params: { speed: 10, boost: true } }],
        },
      ],
      transformers: { s1: { type: 'car2' } },
      transformerPipes: { drive: drivePipe() },
    }
    const next = updateBindingParams(world, 'e1', 0, { speed: 42 })
    expect(bindingParams(next, 'e1')).toEqual({ speed: 42, boost: true })
  })

  it('linked: shared stage registry edits do not change piped runtime projection', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 10 } }] },
        { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 20 } }] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 5, grip: 1 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const next: RennWorld = {
      ...world,
      transformers: {
        ...world.transformers,
        s1: { type: 'car2', params: { power: 77, grip: 1 } },
      },
    }
    expect(runtimeParams(next, 'e1')[0]).toEqual({ speed: 10 })
    expect(runtimeParams(next, 'e2')[0]).toEqual({ speed: 20 })
  })

  it('linked: binding param edits never write back to world.transformers or pipe definition', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 10, power: 99 } }] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 5 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const next = updateBindingParams(world, 'e1', 0, { speed: 50 })
    expect(next.transformers?.s1?.params).toEqual({ power: 5 })
    expect(next.transformerPipes?.drive?.paramDefs).toEqual(drivePipe().paramDefs)
    expect((next.transformerPipes?.drive as { defaultParams?: unknown }).defaultParams).toBeUndefined()
  })
})

describe('pipe copy and link — copy vs linked param isolation', () => {
  function mixedLinkedCopyWorld(): RennWorld {
    const base = baseWorld({
      transformers: { s1: { type: 'car2', params: { power: 10 } } },
      transformerPipes: { drive: drivePipe() },
    })
    const e1Linked = assignPipeToEntity(base, 'e1', drivePipe(), 'linked', { params: { speed: 50 } })
    return assignPipeToEntity(e1Linked, 'e2', drivePipe(), 'copy', { params: { speed: 5 } })
  }

  it('copy binding param edit does not change linked entity storage or runtime', () => {
    const world = mixedLinkedCopyWorld()
    const e2StackIndex = 0
    const next = updateBindingParams(world, 'e2', e2StackIndex, { speed: 88, boost: true })
    expect(bindingParams(next, 'e1')).toEqual({ speed: 50, boost: false })
    expect(bindingParams(next, 'e2')).toEqual({ speed: 88, boost: true })
    expect(runtimeParams(next, 'e1')[0]).toEqual({ speed: 50, boost: false })
    expect(runtimeParams(next, 'e2')[0]).toEqual({ speed: 88, boost: true })
    expect(countEntitiesLinkingPipe(next, 'drive')).toBe(1)
  })

  it('copy stage registry edit does not affect linked runtime or copy piped runtime projection', () => {
    const world = mixedLinkedCopyWorld()
    const e2 = world.entities.find((e) => e.id === 'e2')!
    const copyStageId = e2.transformers![0]!
    const next: RennWorld = {
      ...world,
      transformers: {
        ...world.transformers,
        [copyStageId]: { type: 'car2', params: { power: 999 } },
      },
    }
    expect(next.transformers?.s1?.params).toEqual({ power: 10 })
    expect(runtimeParams(next, 'e1')[0]).toEqual({ speed: 50, boost: false })
    expect(runtimeParams(next, 'e2')[0]).toEqual({ speed: 5, boost: false })
  })

  it('decoupled copy keeps param isolation from linked sibling after decouple', () => {
    const shared: RennWorld = {
      ...baseWorld(),
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 50 } }] },
        { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 100 } }] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 10 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const decoupled = decoupleStackBindingToCopy(shared, 'e1', 0)
    const next = updateBindingParams(decoupled, 'e1', 0, { speed: 1 })
    expect(bindingParams(next, 'e2')).toEqual({ speed: 100 })
    expect(runtimeParams(next, 'e1')[0]).toEqual({ speed: 1 })
    expect(runtimeParams(next, 'e2')[0]).toEqual({ speed: 100 })
  })

  it('copy assign on entity already linked to donor seeds fresh paramDefs defaults', () => {
    const world = baseWorld({
      transformers: { s1: { type: 'car2' } },
      transformerPipes: { drive: drivePipe() },
    })
    const linked = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 77 } })
    const mixed = assignPipeToEntity(linked, 'e2', drivePipe(), 'copy')
    const e2Binding = mixed.entities.find((e) => e.id === 'e2')?.transformerPipeStack?.[0]
    expect(e2Binding?.mode).toBe('copy')
    expect(e2Binding?.params).toEqual({ speed: 5, boost: false })
    expect(mixed.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.params).toEqual({
      speed: 77,
      boost: false,
    })
  })
})

describe('pipe copy and link — nested scope params (spec: scopeParams per entity)', () => {
  const nestedScopePath = [
    { kind: 'stack' as const, index: 0 },
    { kind: 'member' as const, pipeId: 'root', memberIndex: 1 },
  ]

  it('linked: nested scopeParams on one entity do not appear on sibling bindings', () => {
    const world = nestedManifoldWorld()
    const next = setBindingScopeParams(world, 'e1', 0, nestedScopePath, { grip: 9 })
    const e1Scope = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.scopeParams
    const e2Scope = next.entities.find((e) => e.id === 'e2')?.transformerPipeStack?.[0]?.scopeParams
    const scopeKey = pipeScopeKeyFromPath(nestedScopePath)
    expect(e1Scope?.[scopeKey]).toEqual({ grip: 9 })
    expect(e2Scope?.[scopeKey]).toBeUndefined()
    expect(bindingParams(next, 'e1')).toEqual({ grip: 1 })
    expect(bindingParams(next, 'e2')).toEqual({ grip: 2 })
  })

  it('linked: stack binding.params cascade to all stages; nested scope overrides nested subtree only', () => {
    const world = nestedManifoldWorld()
    const withNestedOverride = setBindingScopeParams(world, 'e1', 0, nestedScopePath, { grip: 9 })
    const params = runtimeParams(withNestedOverride, 'e1')
    expect(params[0]).toEqual({ grip: 1 })
    expect(params[1]).toEqual({ grip: 9 })
  })

  it('linked: resolveEditableScopeParams reads stack root vs nested scope storage separately', () => {
    const world = nestedManifoldWorld()
    const binding = world.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    const withScope = setBindingScopeParams(world, 'e1', 0, nestedScopePath, { grip: 9 })
    const scopedBinding = withScope.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    expect(resolveEditableScopeParams(binding, world.transformerPipes?.root, [{ kind: 'stack', index: 0 }])).toEqual({
      grip: 1,
    })
    expect(
      resolveEditableScopeParams(scopedBinding, withScope.transformerPipes?.root, nestedScopePath),
    ).toEqual({ grip: 9 })
  })

  it('copy: nested scopeParams stay on the copy binding and do not affect linked entities', () => {
    const base = nestedManifoldWorld()
    const mixed = assignPipeToEntity(base, 'e2', base.transformerPipes!.root!, 'copy', { params: { grip: 4 } })
    const e2Binding = mixed.entities.find((e) => e.id === 'e2')?.transformerPipeStack?.[0]
    const copyRootPipeId = e2Binding!.pipeId
    const copyNestedMember = mixed.transformerPipes?.[copyRootPipeId]?.members?.find((m) => m.kind === 'pipe')
    const copyScopePath = [
      { kind: 'stack' as const, index: 0 },
      { kind: 'member' as const, pipeId: copyRootPipeId, memberIndex: 1 },
    ]
    const next = setBindingScopeParams(mixed, 'e2', 0, copyScopePath, { grip: 99 })
    const scopeKey = pipeScopeKeyFromPath(copyScopePath)
    expect(next.entities.find((e) => e.id === 'e2')?.transformerPipeStack?.[0]?.scopeParams?.[scopeKey]).toEqual({
      grip: 99,
    })
    expect(next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.scopeParams).toBeUndefined()
    expect(copyNestedMember?.pipeId).not.toBe('nested')
    expect(runtimeParams(next, 'e2')[1]).toEqual({ grip: 99 })
    expect(runtimeParams(next, 'e1')[1]).toEqual({ grip: 1 })
  })
})

describe('pipe copy and link — mixed stack param combinations', () => {
  it('linked drive + linked steer on one entity apply params only to their own stages', () => {
    const world = baseWorld({
      transformers: {
        s1: { type: 'car2', params: { power: 10 } },
        s2: { type: 'input' },
      },
      transformerPipes: {
        drive: drivePipe(),
        steer: steerPipe(),
      },
    })
    let next = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 50 } })
    next = assignPipeToEntity(next, 'e1', steerPipe(), 'linked', { append: true, params: { softness: 7 } })
    const stack = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack ?? []
    expect(stack[0]?.params).toEqual({ speed: 50, boost: false })
    expect(stack[1]?.params).toEqual({ softness: 7 })
    const params = runtimeParams(next, 'e1')
    expect(params[0]).toEqual({ speed: 50, boost: false })
    expect(params[1]).toEqual({ softness: 7 })
  })

  it('linked drive + copy steer on one entity keep independent binding params', () => {
    const world = baseWorld({
      transformers: {
        s1: { type: 'car2', params: { power: 10 } },
        s2: { type: 'input' },
      },
      transformerPipes: {
        drive: drivePipe(),
        steer: steerPipe(),
      },
    })
    let next = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 11 } })
    next = assignPipeToEntity(next, 'e1', steerPipe(), 'copy', { append: true, params: { softness: 22 } })
    const stack = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack ?? []
    expect(stack[0]?.mode).toBeUndefined()
    expect(stack[1]?.mode).toBe('copy')
    expect(stack[0]?.params).toEqual({ speed: 11, boost: false })
    expect(stack[1]?.params).toEqual({ softness: 22 })
    const params = runtimeParams(next, 'e1')
    expect(params[0]).toEqual({ speed: 11, boost: false })
    expect(params[1]).toEqual({ softness: 22 })
  })

  it('linked + copy of the same pipe template on one stack isolate runtime params per flat index', () => {
    const world = baseWorld({
      transformers: { s1: { type: 'car2', params: { power: 5 } } },
      transformerPipes: { drive: drivePipe() },
    })
    let next = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 10 } })
    next = assignPipeToEntity(next, 'e1', drivePipe(), 'copy', { append: true, params: { speed: 99 } })
    const stack = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack ?? []
    expect(stack[0]?.pipeId).toBe('drive')
    expect(stack[0]?.mode).toBeUndefined()
    expect(stack[1]?.mode).toBe('copy')
    expect(stack[1]?.pipeId).not.toBe('drive')
    const params = runtimeParams(next, 'e1')
    expect(params[0]).toEqual({ speed: 10, boost: false })
    expect(params[1]).toEqual({ speed: 99, boost: false })
    expect(next.entities.find((e) => e.id === 'e1')?.transformers?.[0]).toBe('s1')
    expect(next.entities.find((e) => e.id === 'e1')?.transformers?.[1]).toMatch(/^e1_tf/)
  })

  it('two linked entities with different stack pipe params each keep independent runtime projection', () => {
    const world = baseWorld({
      transformers: {
        s1: { type: 'car2', params: { power: 10 } },
        s2: { type: 'input' },
      },
      transformerPipes: {
        drive: drivePipe(),
        steer: steerPipe(),
      },
    })
    let next = assignPipeToEntity(world, 'e1', drivePipe(), 'linked', { params: { speed: 10 } })
    next = assignPipeToEntity(next, 'e1', steerPipe(), 'linked', { append: true, params: { softness: 1 } })
    next = assignPipeToEntity(next, 'e2', drivePipe(), 'linked', { params: { speed: 20 } })
    next = assignPipeToEntity(next, 'e2', steerPipe(), 'linked', { append: true, params: { softness: 2 } })
    expect(runtimeParams(next, 'e1')).toEqual([
      { speed: 10, boost: false },
      { softness: 1 },
    ])
    expect(runtimeParams(next, 'e2')).toEqual([
      { speed: 20, boost: false },
      { softness: 2 },
    ])
  })
})

describe('pipe copy and link — paramDefs assign combinations', () => {
  function pipeWithoutParamDefs(): TransformerPipe {
    return {
      id: 'plain',
      name: 'Plain',
      stageIds: ['s1'],
      stages: [{ type: 'car2', params: { power: 3 } }],
      members: [{ kind: 'stage', stageId: 's1' }],
      createdAt: 1000,
    }
  }

  it('linked assign without paramDefs leaves binding.params undefined', () => {
    const world = baseWorld({
      transformers: { s1: { type: 'car2', params: { power: 3 } } },
      transformerPipes: { plain: pipeWithoutParamDefs() },
    })
    const next = assignPipeToEntity(world, 'e1', pipeWithoutParamDefs(), 'linked')
    const binding = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    expect(binding?.params).toBeUndefined()
    expect(runtimeParams(next, 'e1')[0]).toEqual({})
  })

  it('copy assign without paramDefs leaves binding.params undefined', () => {
    const world = baseWorld({
      transformers: { s1: { type: 'car2', params: { power: 3 } } },
      transformerPipes: { plain: pipeWithoutParamDefs() },
    })
    const next = assignPipeToEntity(world, 'e1', pipeWithoutParamDefs(), 'copy')
    const binding = next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]
    expect(binding?.params).toBeUndefined()
    const localStageId = firstTransformerId(next, 'e1')
    expect(runtimeParams(next, 'e1')[0]).toEqual({})
    expect(next.transformers?.[localStageId]?.params).toEqual({ power: 3 })
  })

  it('copy assign partial override merges paramDefs defaults for unspecified keys', () => {
    const world = baseWorld({
      transformers: { s1: { type: 'car2' } },
      transformerPipes: { drive: drivePipe() },
    })
    const next = assignPipeToEntity(world, 'e1', drivePipe(), 'copy', { params: { speed: 42 } })
    expect(bindingParams(next, 'e1')).toEqual({ speed: 42, boost: false })
    expect(resolveEditableScopeParams(next.entities[0]?.transformerPipeStack?.[0], drivePipe())).toEqual({
      speed: 42,
      boost: false,
    })
  })

  it('addExistingPipe link on second entity seeds paramDefs defaults, not donor entity binding values', () => {
    const world = baseWorld({
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'drive', params: { speed: 77, boost: true } }],
        },
        { id: 'e2', bodyType: 'dynamic', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [1, 0, 0] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 10 } } },
      transformerPipes: { drive: drivePipe() },
    })
    const { world: next } = addExistingPipeAtFocus(world, 'e2', drivePipe(), 'linked', [])
    const e2Binding = next.entities.find((e) => e.id === 'e2')?.transformerPipeStack?.[0]
    expect(e2Binding?.params).toEqual({ speed: 5, boost: false })
    expect(next.entities.find((e) => e.id === 'e1')?.transformerPipeStack?.[0]?.params).toEqual({
      speed: 77,
      boost: true,
    })
    expect(runtimeParams(next, 'e2')[0]).toEqual({ speed: 5, boost: false })
  })

  it('addExistingPipe copy accepts explicit param overrides independent of stack siblings', () => {
    const world = baseWorld({
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [
            { pipeId: 'existing', params: { speed: 1 } },
          ],
        },
      ],
      transformers: { s1: { type: 'input' }, d1: { type: 'car2' } },
      transformerPipes: {
        existing: {
          id: 'existing',
          name: 'Existing',
          stageIds: ['s1'],
          stages: [{ type: 'input' }],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
        donor: drivePipe({ id: 'donor', name: 'Donor', stageIds: ['d1'], members: [{ kind: 'stage', stageId: 'd1' }] }),
      },
    })
    const donor = world.transformerPipes!.donor!
    const linked = assignPipeToEntity(world, 'e1', donor, 'linked', { append: true, params: { speed: 55 } })
    const e1Before = linked.entities.find((e) => e.id === 'e1')?.transformerPipeStack ?? []
    expect(e1Before[1]?.params).toEqual({ speed: 55, boost: false })
    const { world: copied } = addExistingPipeAtFocus(
      {
        ...linked,
        entities: linked.entities.map((e) =>
          e.id === 'e1'
            ? { ...e, transformerPipeStack: [{ pipeId: 'existing', params: { speed: 1 } }] }
            : e,
        ),
      },
      'e1',
      donor,
      'copy',
      [],
    )
    const stack = copied.entities.find((e) => e.id === 'e1')?.transformerPipeStack ?? []
    expect(stack[0]?.params).toEqual({ speed: 1 })
    expect(stack[1]?.params).toEqual({ speed: 5, boost: false })
  })
})

describe('pipe copy and link — pipe instance param isolation (spec)', () => {
  it('duplicate linked pipes: each binding projects only its own params to every stage underneath', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's2', 's1', 's2'],
          transformerPipeStack: [
            { pipeId: 'drive', params: { test1: '' } },
            { pipeId: 'drive', params: { test2: '' } },
          ],
        },
      ],
      transformers: {
        s1: { type: 'input', priority: 0, params: { power: 5 } },
        s2: { type: 'car2', priority: 1, params: { power: 8 } },
      },
      transformerPipes: { drive: twoStagePipe() },
    }
    expect(runtimeParams(world, 'e1')).toEqual([{ test1: '' }, { test1: '' }, { test2: '' }, { test2: '' }])
  })

  it('linked + copy on one stack: bindings do not merge params across instances', () => {
    const base = baseWorld({
      transformers: {
        s1: { type: 'input', priority: 0, params: { power: 1 } },
        s2: { type: 'car2', priority: 1, params: { power: 2 } },
      },
      transformerPipes: { drive: twoStagePipe() },
    })
    let world = assignPipeToEntity(base, 'e1', twoStagePipe(), 'linked', { params: { test1: '' } })
    world = assignPipeToEntity(world, 'e1', twoStagePipe(), 'copy', { append: true, params: { test2: '' } })
    const ids = world.entities.find((e) => e.id === 'e1')?.transformers ?? []
    expect(ids).toHaveLength(4)
    expect(runtimeParams(world, 'e1')).toEqual([{ test1: '' }, { test1: '' }, { test2: '' }, { test2: '' }])
  })

  it('registry stage params are not projected when entity uses a pipe stack', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        {
          id: 'e1',
          transformers: ['s1'],
          transformerPipeStack: [{ pipeId: 'drive', params: { test1: '' } }],
        },
      ],
      transformers: { s1: { type: 'car2', params: { power: 10, grip: 3 } } },
      transformerPipes: { drive: drivePipe() },
    }
    expect(runtimeParams(world, 'e1')[0]).toEqual({ test1: '' })
    expect(runtimeParams(world, 'e1')[0]).not.toHaveProperty('power')
  })
})

describe('pipe copy and link — live sync scope for param edits (spec)', () => {
  it('resolveMergedTransformerConfigsForEntitySync reflects binding params for one entity only', () => {
    const world: RennWorld = {
      ...baseWorld(),
      entities: [
        { id: 'e1', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 10 } }] },
        { id: 'e2', transformers: ['s1'], transformerPipeStack: [{ pipeId: 'drive', params: { speed: 20 } }] },
      ],
      transformers: { s1: { type: 'car2', params: { power: 5 } } },
      transformerPipes: { drive: drivePipe() },
    }
    const next = updateBindingParams(world, 'e1', 0, { speed: 99 })
    expect(resolveMergedTransformerConfigsForEntitySync(next, 'e1')?.[0]?.params).toEqual({
      speed: 99,
    })
    expect(resolveMergedTransformerConfigsForEntitySync(next, 'e2')?.[0]?.params).toEqual({
      speed: 20,
    })
  })
})
