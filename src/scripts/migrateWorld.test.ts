import { describe, it, expect } from 'vitest'
import { migrateWorldScripts } from './migrateWorld'

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
