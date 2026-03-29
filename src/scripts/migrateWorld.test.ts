import { describe, it, expect } from 'vitest'
import {
  migrateWorldScripts,
  migrateWorldSimplificationFields,
  clampTrimeshSimplificationConfig,
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

describe('migrateWorldSimplificationFields', () => {
  it('clamps trimesh shape.simplification maxError into schema range and maxTriangles to at least 500', () => {
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
    expect(sim.maxError).toBe(1)
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

describe('clampTrimeshSimplificationConfig', () => {
  it('returns a new object with clamped maxError and maxTriangles', () => {
    const a = { enabled: true, maxTriangles: 400, maxError: 2, algorithm: 'meshoptimizer' as const }
    const b = clampTrimeshSimplificationConfig(a)
    expect(b).not.toBe(a)
    expect(b.maxError).toBe(1)
    expect(b.maxTriangles).toBe(500)
  })
})
