import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import {
  commitTransformerConfigsToWorld,
  cloneEntityTransformersIntoWorld,
  assignPipeToEntity,
  decoupleEntityFromPipe,
  deletePipeFromWorld,
  savePipeFromEntity,
} from './commitTransformerConfigsToWorld'

function applyStacksToEntities(world: RennWorld, entityIds: string[], configs: TransformerConfig[]): RennWorld {
  let next = world
  for (const id of entityIds) {
    next = commitTransformerConfigsToWorld(next, id, configs)
  }
  return next
}

describe('commitTransformerConfigsToWorld', () => {
  it('matches Builder multi-entity path: defs live in registry, entities hold stable per-entity ids', () => {
    const configs: TransformerConfig[] = [
      { type: 'input', priority: 0, enabled: true, params: {} },
      { type: 'custom', priority: 1, enabled: true, params: {}, code: 'return {};', name: 'C1' },
    ]
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      assets: {},
      entities: [
        {
          id: 'e_a',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['e_a_tf0'],
        },
        {
          id: 'e_b',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [1, 0, 0],
          transformers: ['e_b_tf0'],
        },
      ],
      transformers: {
        e_a_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
        e_b_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
      },
    }

    const next = applyStacksToEntities(world, ['e_a', 'e_b'], configs)

    expect(next.entities.find((e) => e.id === 'e_a')?.transformers).toEqual(['e_a_tf0', 'e_a_tf1'])
    expect(next.entities.find((e) => e.id === 'e_b')?.transformers).toEqual(['e_b_tf0', 'e_b_tf1'])
    expect(next.transformers?.e_a_tf0).toMatchObject(configs[0])
    expect(next.transformers?.e_a_tf1).toMatchObject({ type: 'custom', name: 'C1' })
    expect(next.transformers?.e_b_tf0).toMatchObject(configs[0])
    expect(next.transformers?.e_b_tf1).toMatchObject({ type: 'custom', name: 'C1' })
  })

  it('reorder preserves code on each registry id when orderedRegistryIds is passed', () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      assets: {},
      entities: [
        {
          id: 'e1',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['e1_tf0', 'e1_tf1'],
        },
      ],
      transformers: {
        e1_tf0: {
          type: 'custom',
          priority: 0,
          code: 'return { a: 1 };',
          name: 'A',
        },
        e1_tf1: {
          type: 'custom',
          priority: 1,
          code: 'return { b: 2 };',
          name: 'B',
        },
      },
    }

    const reorderedConfigs: TransformerConfig[] = [
      { ...world.transformers!.e1_tf1!, priority: 0 },
      { ...world.transformers!.e1_tf0!, priority: 1 },
    ]

    const next = commitTransformerConfigsToWorld(world, 'e1', reorderedConfigs, ['e1_tf1', 'e1_tf0'])

    expect(next.entities[0]?.transformers).toEqual(['e1_tf1', 'e1_tf0'])
    expect(next.transformers?.e1_tf0?.code).toBe('return { a: 1 };')
    expect(next.transformers?.e1_tf1?.code).toBe('return { b: 2 };')
  })
})

describe('cloneEntityTransformersIntoWorld', () => {
  it('gives the cloned entity independent registry entries so removing one does not affect the other', () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      assets: {},
      entities: [
        {
          id: 'e1',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['e1_tf0'],
        },
      ],
      transformers: {
        e1_tf0: { type: 'custom', priority: 0, enabled: true, code: 'return {};', name: 'MyTransformer' },
      },
    }

    const cloned = { id: 'e1_copy', transformers: ['e1_tf0'] }
    const { world: nextWorld, newTransformerIds } = cloneEntityTransformersIntoWorld(world, cloned)

    // Clone gets a new unique ID
    expect(newTransformerIds).toHaveLength(1)
    expect(newTransformerIds[0]).not.toBe('e1_tf0')

    // Both registry entries exist and are independent copies
    expect(nextWorld.transformers?.['e1_tf0']).toBeDefined()
    expect(nextWorld.transformers?.[newTransformerIds[0]!]).toBeDefined()
    expect(nextWorld.transformers?.[newTransformerIds[0]!]).not.toBe(nextWorld.transformers?.['e1_tf0'])
    expect(nextWorld.transformers?.[newTransformerIds[0]!]).toMatchObject({ type: 'custom', name: 'MyTransformer' })

    // Simulating removal from clone: deleting clone's registry entry does not affect original
    const afterRemove = commitTransformerConfigsToWorld(
      { ...nextWorld, entities: [...nextWorld.entities, { ...cloned, transformers: newTransformerIds }] },
      'e1_copy',
      [],
      [],
    )
    expect(afterRemove.transformers?.['e1_tf0']).toBeDefined()
    expect(afterRemove.transformers?.[newTransformerIds[0]!]).toBeUndefined()
  })
})

describe('Transformer Pipes utilities', () => {
  const baseWorld: RennWorld = {
    version: '1.0',
    world: { gravity: [0, -9.81, 0] },
    entities: [
      {
        id: 'e1',
        transformers: ['t1'],
      },
      {
        id: 'e2',
        transformers: ['t2'],
      },
    ],
    transformers: {
      t1: { type: 'input', priority: 0 },
      t2: { type: 'input', priority: 0 },
    },
  }

  const samplePipe: TransformerPipe = {
    id: 'p1',
    name: 'Test Pipe',
    stageIds: ['p1_t1'],
    stages: [{ type: 'custom', name: 'Snapshot', priority: 0 }],
    createdAt: 1000,
  }

  describe('assignPipeToEntity', () => {
    it('assigns in linked mode', () => {
      const next = assignPipeToEntity(baseWorld, 'e1', samplePipe, 'linked')
      const e1 = next.entities.find((e) => e.id === 'e1')
      expect(e1?.transformers).toEqual(['p1_t1'])
      expect(e1?.transformerPipeStack).toEqual([{ pipeId: 'p1', enabled: true }])
      expect(e1?.transformerPipe).toBeUndefined()
    })

    it('appends to pipe stack in linked mode', () => {
      const first = assignPipeToEntity(baseWorld, 'e1', samplePipe, 'linked')
      const secondPipe: typeof samplePipe = {
        ...samplePipe,
        id: 'p2',
        stageIds: ['p2_t1'],
      }
      const next = assignPipeToEntity(first, 'e1', secondPipe, 'linked', { append: true })
      const e1 = next.entities.find((e) => e.id === 'e1')
      expect(e1?.transformerPipeStack).toEqual([
        { pipeId: 'p1', enabled: true },
        { pipeId: 'p2', enabled: true },
      ])
      expect(e1?.transformers).toEqual(['p1_t1', 'p2_t1'])
    })

    it('assigns in copy mode', () => {
      const next = assignPipeToEntity(baseWorld, 'e1', samplePipe, 'copy')
      const e1 = next.entities.find((e) => e.id === 'e1')
      expect(e1?.transformers?.[0]).toMatch(/e1_tf/)
      expect(e1?.transformerPipeStack?.[0]?.mode).toBe('copy')
      expect(next.transformers?.[e1!.transformers![0]!]).toMatchObject(samplePipe.stages[0])
    })
  })

  describe('decoupleEntityFromPipe', () => {
    it('clones registry and clears link', () => {
      const linked = assignPipeToEntity(baseWorld, 'e1', samplePipe, 'linked')
      const next = decoupleEntityFromPipe(linked, 'e1')
      const e1 = next.entities.find((e) => e.id === 'e1')
      expect(e1?.transformers?.[0]).not.toBe('p1_t1')
      expect(e1?.transformerPipeStack).toBeUndefined()
      expect(next.transformers?.[e1!.transformers![0]!]).toBeDefined()
    })
  })

  describe('deletePipeFromWorld', () => {
    it('removes pipe and clears all entity links', () => {
      const worldWithPipe = {
        ...baseWorld,
        transformerPipes: { p1: samplePipe },
        entities: baseWorld.entities.map((e) => ({
          ...e,
          transformerPipeStack: [{ pipeId: 'p1' }],
        })),
      }
      const next = deletePipeFromWorld(worldWithPipe, 'p1')
      expect(next.transformerPipes?.p1).toBeUndefined()
      expect(next.entities.every((e) => e.transformerPipeStack === undefined)).toBe(true)
    })
  })

  describe('savePipeFromEntity', () => {
    it('creates a new pipe and links it in linked mode', () => {
      const next = savePipeFromEntity(baseWorld, 'e1', 'New Pipe', 'linked')
      const pipeId = Object.keys(next.transformerPipes || {})[0]!
      const pipe = next.transformerPipes![pipeId]!
      expect(pipe.name).toBe('New Pipe')
      expect(pipe.stageIds).toEqual(['t1'])
      expect(pipe.stages[0]).toMatchObject(baseWorld.transformers!.t1!)
      expect(pipeId).toBe('new_pipe')
      expect(next.entities.find((e) => e.id === 'e1')?.transformerPipeStack).toEqual([
        { pipeId, enabled: true },
      ])
    })
  })
})
