import { describe, it, expect } from 'vitest'
import {
  migrateWorldScripts,
  migrateWorldSimplificationFields,
  migrateCustomTransformerNames,
  clampTrimeshSimplificationConfig,
  migrateWorldRingShapesToCylinder,
  migrateEntityTransformersToRegistry,
  migrateTransformerPipeToStack,
  migrateTransformerPipeDefaultParams,
} from './migrateWorld'

describe('migrateWorldScripts', () => {
  it('converts legacy scripts map and entity.scripts to new format', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [
        { id: 'a', scripts: { onSpawn: 'spawnScript', onUpdate: 'updateScript' } },
        { id: 'b', scripts: { onCollision: 'collisionScript' } },
      ],
      scripts: {
        spawnScript: 'ctx.log("spawn")',
        updateScript: 'ctx.log("update")',
        collisionScript: 'ctx.log("collision")',
      },
    }
    migrateWorldScripts(world)
    expect(world.scripts).toEqual({
      spawnScript: { event: 'onSpawn', source: 'ctx.log("spawn")' },
      updateScript: { event: 'onUpdate', source: 'ctx.log("update")' },
      collisionScript: { event: 'onCollision', source: 'ctx.log("collision")' },
    })
    expect(world.entities[0].scripts).toEqual(['spawnScript', 'updateScript'])
    expect(world.entities[1].scripts).toEqual(['collisionScript'])
  })

  it('duplicates script when same id used for multiple events', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [
        { id: 'a', scripts: { onSpawn: 'foo' } },
        { id: 'b', scripts: { onUpdate: 'foo' } },
      ],
      scripts: { foo: 'ctx.log(1)' },
    }
    migrateWorldScripts(world)
    expect(world.scripts.foo).toEqual({ event: 'onSpawn', source: 'ctx.log(1)' })
    expect((world.scripts as Record<string, unknown>)['foo_onUpdate']).toEqual({
      event: 'onUpdate',
      source: 'ctx.log(1)',
    })
    expect(world.entities[0].scripts).toEqual(['foo'])
    expect(world.entities[1].scripts).toEqual(['foo_onUpdate'])
  })

  it('is no-op when already migrated', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [{ id: 'a', scripts: ['x'] }],
      scripts: { x: { event: 'onUpdate', source: 'ctx.log(1)' } },
    }
    migrateWorldScripts(world)
    expect(world.scripts).toEqual({ x: { event: 'onUpdate', source: 'ctx.log(1)' } })
    expect(world.entities[0].scripts).toEqual(['x'])
  })
})

describe('migrateCustomTransformerNames', () => {
  it('names nameless custom transformers per entity in stack order', () => {
    const world = {
      entities: [
        {
          id: 'a',
          transformers: [
            { type: 'input', priority: 0 },
            { type: 'custom', code: 'return {}' },
            { type: 'custom', name: 'Already', code: 'return {}' },
            { type: 'custom', code: 'return {}' },
          ],
        },
      ],
    }
    migrateCustomTransformerNames(world)
    const tr = (world.entities[0] as { transformers: { type: string; name?: string }[] }).transformers
    expect(tr[1].name).toBe('Custom')
    expect(tr[2].name).toBe('Already')
    expect(tr[3].name).toBe('Custom 2')
  })

  it('is no-op when all customs have names', () => {
    const world = {
      entities: [
        {
          id: 'a',
          transformers: [{ type: 'custom', name: 'A', code: 'return {}' }],
        },
      ],
    }
    migrateCustomTransformerNames(world)
    expect(
      ((world.entities[0] as { transformers: { name: string }[] }).transformers[0] as { name: string }).name,
    ).toBe('A')
  })
})

describe('migrateWorldSimplificationFields', () => {
  it('clamps trimesh shape.simplification maxTriangles to at least 500; leaves maxError uncapped above minimum', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [
        {
          id: 't',
          shape: {
            type: 'trimesh',
            model: 'm1',
            simplification: { enabled: true, maxTriangles: 200, maxError: 5, algorithm: 'meshoptimizer' },
          },
        },
      ],
    }
    const warnings: string[] = []
    migrateWorldSimplificationFields(world, warnings)
    const sim = (world.entities[0] as { shape: { simplification: Record<string, unknown> } }).shape
      .simplification
    expect(sim.maxError).toBe(5)
    expect(sim.maxTriangles).toBe(500)
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/simplification settings were adjusted/i)
  })

  it('clamps entity.modelSimplification the same way', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [
        {
          id: 'e',
          model: 'vis',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          modelSimplification: { enabled: true, maxTriangles: 100, maxError: 0 },
        },
      ],
    }
    migrateWorldSimplificationFields(world)
    const ms = (world.entities[0] as { modelSimplification: Record<string, unknown> }).modelSimplification
    expect(ms.maxError).toBe(0.0001)
    expect(ms.maxTriangles).toBe(500)
  })

  it('is no-op when simplification absent', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [{ id: 'x', shape: { type: 'trimesh', model: 'a' } }],
    }
    migrateWorldSimplificationFields(world)
    expect((world.entities[0] as { shape: object }).shape).toEqual({ type: 'trimesh', model: 'a' })
  })
})

describe('migrateWorldRingShapesToCylinder', () => {
  it('converts ring shapes to cylinders matching former physics proxy', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [
        { id: 'a', shape: { type: 'ring', innerRadius: 0.1, outerRadius: 2, height: 0.3 } },
        { id: 'b', shape: { type: 'box', width: 1, height: 1, depth: 1 } },
      ],
    }
    const warnings: string[] = []
    migrateWorldRingShapesToCylinder(world, warnings)
    expect(world.entities[0].shape).toEqual({ type: 'cylinder', radius: 2, height: 0.3 })
    expect(world.entities[1].shape).toEqual({ type: 'box', width: 1, height: 1, depth: 1 })
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/ring/i)
  })

  it('uses defaults when ring radii or height are invalid', () => {
    const world = {
      entities: [{ id: 'x', shape: { type: 'ring', innerRadius: 1, outerRadius: NaN } }],
    }
    migrateWorldRingShapesToCylinder(world)
    expect(world.entities[0]).toMatchObject({
      shape: { type: 'cylinder', radius: 0.5, height: 0.1 },
    })
  })
})

describe('clampTrimeshSimplificationConfig', () => {
  it('returns a new object with clamped maxError and maxTriangles', () => {
    const a = { enabled: true, maxTriangles: 400, maxError: 2, algorithm: 'meshoptimizer' as const }
    const b = clampTrimeshSimplificationConfig(a)
    expect(b).not.toBe(a)
    expect(b.maxError).toBe(2)
    expect(b.maxTriangles).toBe(500)
  })
})

describe('migrateEntityTransformersToRegistry', () => {
  it('extracts embedded TransformerConfig[] into world.transformers and replaces with IDs', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [
        {
          id: 'car',
          transformers: [
            { type: 'input', priority: 0 },
            { type: 'car2', priority: 1, params: { power: 500 } },
          ],
        },
        {
          id: 'player',
          transformers: [{ type: 'custom', name: 'MyScript', code: 'return {}' }],
        },
      ],
    }
    migrateEntityTransformersToRegistry(world)

    const registry = (world as Record<string, unknown>).transformers as Record<string, unknown>
    expect(registry).toBeDefined()
    expect(registry['car_tf0']).toEqual({ type: 'input', priority: 0 })
    expect(registry['car_tf1']).toEqual({ type: 'car2', priority: 1, params: { power: 500 } })
    expect(registry['player_tf0']).toEqual({ type: 'custom', name: 'MyScript', code: 'return {}' })

    expect(world.entities[0].transformers).toEqual(['car_tf0', 'car_tf1'])
    expect(world.entities[1].transformers).toEqual(['player_tf0'])
  })

  it('is no-op when entity.transformers is already string[]', () => {
    const world = {
      version: '1.0',
      world: {},
      transformers: { tf1: { type: 'input', priority: 0 } },
      entities: [{ id: 'car', transformers: ['tf1'] }],
    }
    migrateEntityTransformersToRegistry(world)
    expect(world.entities[0].transformers).toEqual(['tf1'])
    expect(Object.keys((world as Record<string, unknown>).transformers as object)).toHaveLength(1)
  })

  it('is no-op when entities have no transformers', () => {
    const world = {
      version: '1.0',
      world: {},
      entities: [{ id: 'box' }],
    }
    migrateEntityTransformersToRegistry(world)
    expect((world as Record<string, unknown>).transformers).toEqual({})
    expect((world.entities[0] as Record<string, unknown>).transformers).toBeUndefined()
  })

  it('creates world.transformers registry when absent', () => {
    const world = {
      entities: [{ id: 'e', transformers: [{ type: 'input' }] }],
    }
    migrateEntityTransformersToRegistry(world)
    expect((world as Record<string, unknown>).transformers).toEqual({ e_tf0: { type: 'input' } })
    expect(world.entities[0].transformers).toEqual(['e_tf0'])
  })

  it('preserves existing registry entries when migrating more entities', () => {
    const world = {
      transformers: { existing_tf0: { type: 'car2' } },
      entities: [{ id: 'new', transformers: [{ type: 'input' }] }],
    }
    migrateEntityTransformersToRegistry(world)
    const registry = (world as Record<string, unknown>).transformers as Record<string, unknown>
    expect(registry['existing_tf0']).toEqual({ type: 'car2' })
    expect(registry['new_tf0']).toEqual({ type: 'input' })
  })

  it('handles multiple entities with independent ID namespacing', () => {
    const world = {
      entities: [
        { id: 'a', transformers: [{ type: 'input' }] },
        { id: 'b', transformers: [{ type: 'car2' }] },
      ],
    }
    migrateEntityTransformersToRegistry(world)
    const registry = (world as Record<string, unknown>).transformers as Record<string, unknown>
    expect(registry['a_tf0']).toEqual({ type: 'input' })
    expect(registry['b_tf0']).toEqual({ type: 'car2' })
    expect(world.entities[0].transformers).toEqual(['a_tf0'])
    expect(world.entities[1].transformers).toEqual(['b_tf0'])
  })
})

describe('migrateTransformerPipeDefaultParams', () => {
  it('moves defaultParams into binding.params and strips pipe defaults', () => {
    const world = {
      entities: [
        { id: 'e1', transformerPipeStack: [{ pipeId: 'p1' }] },
        { id: 'e2', transformerPipeStack: [{ pipeId: 'p1', params: { speed: 9 } }] },
      ],
      transformerPipes: {
        p1: { id: 'p1', defaultParams: { speed: 1, height: 2 } },
      },
    }
    migrateTransformerPipeDefaultParams(world)
    const e0Binding = world.entities[0].transformerPipeStack![0]!
    const e1Binding = world.entities[1].transformerPipeStack![0]!
    expect('params' in e0Binding ? e0Binding.params : undefined).toEqual({ speed: 1, height: 2 })
    expect('params' in e1Binding ? e1Binding.params : undefined).toEqual({ speed: 9 })
    expect(world.transformerPipes.p1.defaultParams).toBeUndefined()
  })
})

describe('migrateTransformerPipeToStack', () => {
  it('migrates legacy transformerPipe to stack', () => {
    const world = {
      entities: [{ id: 'e1', transformerPipe: 'pipe_a' }],
    }
    migrateTransformerPipeToStack(world)
    expect((world.entities[0] as { transformerPipeStack?: unknown }).transformerPipeStack).toEqual([
      { pipeId: 'pipe_a' },
    ])
    expect((world.entities[0] as Record<string, unknown>).transformerPipe).toBeUndefined()
  })

  it('is no-op when stack already exists', () => {
    const world = {
      entities: [
        {
          id: 'e1',
          transformerPipe: 'legacy',
          transformerPipeStack: [{ pipeId: 'pipe_b' }],
        },
      ],
    }
    migrateTransformerPipeToStack(world)
    expect(world.entities[0].transformerPipeStack).toEqual([{ pipeId: 'pipe_b' }])
  })
})
