import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { ScriptRunner } from './scriptRunner'
import type { RennWorld } from '@/types/world'
import type { GameAPI } from './gameApi'
import type { LoadedEntity } from '@/loader/loadWorld'

function createMockGameAPI(overrides?: Partial<GameAPI>): GameAPI {
  return {
    get time() {
      return 0
    },
    entities: [],
    getEntity: vi.fn().mockReturnValue(undefined),
    getPosition: vi.fn().mockReturnValue(null),
    setPosition: vi.fn(),
    getRotation: vi.fn().mockReturnValue(null),
    setRotation: vi.fn(),
    getUpVector: vi.fn().mockReturnValue(null),
    getForwardVector: vi.fn().mockReturnValue(null),
    resetRotation: vi.fn(),
    addVectorToPosition: vi.fn(),
    setColor: vi.fn(),
    getColor: vi.fn().mockReturnValue(null),
    applyForce: vi.fn(),
    applyImpulse: vi.fn(),
    setTransformerEnabled: vi.fn(),
    setTransformerParam: vi.fn(),
    log: vi.fn(),
    ...overrides,
  }
}

function createMockWorld(overrides?: Partial<RennWorld>): RennWorld {
  return {
    version: '1.0',
    world: {},
    entities: [],
    scripts: {},
    ...overrides,
  }
}

function createLoadedEntities(world: RennWorld): LoadedEntity[] {
  return world.entities.map((entity) => ({
    entity,
    mesh: new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ),
  }))
}

describe('ScriptRunner', () => {
  it('creates a script runner instance', () => {
    const world = createMockWorld()
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    expect(runner).toBeDefined()
  })

  it('compiles and runs onSpawn script', () => {
    const spawnCalled = vi.fn()

    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['onSpawnScript'],
        },
      ],
      scripts: {
        onSpawnScript: { event: 'onSpawn', source: 'ctx.log(ctx.entity.id)' },
      },
    })
    world.entities = world.entities ?? []

    const game = {
      ...createMockGameAPI(),
      log: spawnCalled,
    } as unknown as GameAPI

    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnSpawn('player')

    expect(spawnCalled).toHaveBeenCalledWith('player')
  })

  it('compiles and runs onUpdate script', () => {
    const updateCalled = vi.fn()

    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['onUpdateScript'],
        },
      ],
      scripts: {
        onUpdateScript: { event: 'onUpdate', source: 'ctx.log(ctx.entity.id, ctx.dt)' },
      },
    })
    world.entities = world.entities ?? []

    const game = {
      ...createMockGameAPI(),
      log: updateCalled,
    } as unknown as GameAPI

    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnUpdate(0.016)

    expect(updateCalled).toHaveBeenCalledWith('player', 0.016)
  })

  it('compiles and runs onCollision script', () => {
    const collisionCalled = vi.fn()

    const world = createMockWorld({
      entities: [
        { id: 'player', scripts: ['onCollisionScript'] },
        { id: 'enemy' },
      ],
      scripts: {
        onCollisionScript: { event: 'onCollision', source: 'ctx.log(ctx.entity.id, ctx.other.id)' },
      },
    })
    world.entities = world.entities ?? []

    const game = {
      ...createMockGameAPI(),
      log: collisionCalled,
    } as unknown as GameAPI

    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnCollision('player', 'enemy')

    expect(collisionCalled).toHaveBeenCalledWith('player', 'enemy')
  })

  it('passes impact (forces) to onCollision script when provided', () => {
    const collisionCalled = vi.fn()
    const world = createMockWorld({
      entities: [
        { id: 'player', scripts: ['onCollisionScript'] },
        { id: 'enemy' },
      ],
      scripts: {
        onCollisionScript: {
          event: 'onCollision',
          source:
            'ctx.log(ctx.entity.id, ctx.other.id, ctx.impact.totalForceMagnitude, ctx.impact.maxForceDirection[0])',
        },
      },
    })
    world.entities = world.entities ?? []
    const game = {
      ...createMockGameAPI(),
      log: collisionCalled,
    } as unknown as GameAPI
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    const impact = {
      totalForce: [1, 2, 3] as [number, number, number],
      totalForceMagnitude: 10,
      maxForceMagnitude: 5,
      maxForceDirection: [0, 1, 0] as [number, number, number],
    }
    runner.runOnCollision('player', 'enemy', impact)
    expect(collisionCalled).toHaveBeenCalledWith('player', 'enemy', 10, 0)
  })

  it('handles missing script gracefully', () => {
    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['nonExistentScript'],
        },
      ],
    })
    world.entities = world.entities ?? []

    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)

    expect(() => runner.runOnSpawn('player')).not.toThrow()
  })

  it('handles script compilation errors', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const world = createMockWorld({
      scripts: {
        badScript: { event: 'onUpdate', source: 'this is not valid javascript {{{' },
      },
    })

    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    expect(() => new ScriptRunner(world, game, getMeshById, entities)).not.toThrow()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('handles script runtime errors', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['errorScript'],
        },
      ],
      scripts: {
        errorScript: { event: 'onUpdate', source: 'throw new Error("Runtime error!")' },
      },
    })
    world.entities = world.entities ?? []

    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)

    expect(() => runner.runOnUpdate(0.016)).not.toThrow()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('runs onUpdate for multiple entities', () => {
    const updateCalled = vi.fn()

    const world = createMockWorld({
      entities: [
        { id: 'player', scripts: ['onUpdateScript'] },
        { id: 'enemy', scripts: ['onUpdateScript'] },
        { id: 'platform' },
      ],
      scripts: {
        onUpdateScript: { event: 'onUpdate', source: 'ctx.log(ctx.entity.id)' },
      },
    })
    world.entities = world.entities ?? []

    const game = {
      ...createMockGameAPI(),
      log: updateCalled,
    } as unknown as GameAPI

    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnUpdate(0.016)

    expect(updateCalled).toHaveBeenCalledTimes(2)
    expect(updateCalled).toHaveBeenCalledWith('player')
    expect(updateCalled).toHaveBeenCalledWith('enemy')
  })

  it('provides game API to scripts', () => {
    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['moveScript'],
        },
      ],
      scripts: {
        moveScript: { event: 'onUpdate', source: 'ctx.setPosition("player", 1, 2, 3)' },
      },
    })
    world.entities = world.entities ?? []

    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnUpdate(0.016)

    expect(game.setPosition).toHaveBeenCalledWith('player', 1, 2, 3)
  })

  it('runs onTimer script when interval elapsed', () => {
    const timerCalled = vi.fn()

    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['timerScript'],
        },
      ],
      scripts: {
        timerScript: { event: 'onTimer', interval: 0.5, source: 'ctx.log(ctx.entity.id, ctx.interval)' },
      },
    })
    world.entities = world.entities ?? []

    const game = {
      ...createMockGameAPI(),
      log: timerCalled,
    } as unknown as GameAPI

    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)

    runner.runOnUpdate(0.2)
    expect(timerCalled).not.toHaveBeenCalled()
    runner.runOnUpdate(0.2)
    expect(timerCalled).not.toHaveBeenCalled()
    runner.runOnUpdate(0.2)
    expect(timerCalled).toHaveBeenCalledWith('player', 0.5)
    timerCalled.mockClear()
    runner.runOnUpdate(0.5)
    expect(timerCalled).toHaveBeenCalledWith('player', 0.5)
  })

  it('ctx.getPosition() and ctx.entity.getPosition() use current entity id when id omitted', () => {
    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: ['poseScript'],
        },
      ],
      scripts: {
        poseScript: {
          event: 'onUpdate',
          source: `
            ctx.getPosition();
            ctx.entity.getPosition();
            ctx.getRotation();
            ctx.entity.getRotation();
          `,
        },
      },
    })
    world.entities = world.entities ?? []

    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)

    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnUpdate(0.016)

    expect(game.getPosition).toHaveBeenCalledWith('player')
    expect(game.getRotation).toHaveBeenCalledWith('player')
    expect(game.getPosition).toHaveBeenCalledTimes(2)
    expect(game.getRotation).toHaveBeenCalledTimes(2)
  })

  it('ctx.other has same API as ctx.entity (getPosition, getUpVector, detect.isUpright)', () => {
    const world = createMockWorld({
      entities: [
        { id: 'player', scripts: ['collScript'] },
        { id: 'enemy' },
      ],
      scripts: {
        collScript: {
          event: 'onCollision',
          source: `
            ctx.other.getPosition();
            ctx.other.getUpVector();
            ctx.other.detect.isUpright();
          `,
        },
      },
    })
    world.entities = world.entities ?? []
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnCollision('player', 'enemy')
    expect(game.getPosition).toHaveBeenCalledWith('enemy')
    expect(game.getUpVector).toHaveBeenCalledWith('enemy')
    // getUpVector called once by ctx.other.getUpVector(), once by ctx.other.detect.isUpright()
    expect(game.getUpVector).toHaveBeenCalledTimes(2)
  })

  it('ctx.setColor and ctx.other.setColor call game.setColor with correct args', () => {
    const world = createMockWorld({
      entities: [
        { id: 'player', scripts: ['colorScript'] },
        { id: 'enemy' },
      ],
      scripts: {
        colorScript: {
          event: 'onCollision',
          source: `
            ctx.setColor(ctx.entity.id, 1, 0, 0);
            ctx.other.setColor(0, 1, 0);
          `,
        },
      },
    })
    world.entities = world.entities ?? []
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnCollision('player', 'enemy')
    expect(game.setColor).toHaveBeenCalledWith('player', 1, 0, 0)
    expect(game.setColor).toHaveBeenCalledWith('enemy', 0, 1, 0)
  })

  it('ctx.getColor and ctx.entity.getColor and ctx.other.getColor call game.getColor with correct id', () => {
    const world = createMockWorld({
      entities: [
        { id: 'player', scripts: ['getColorScript'] },
        { id: 'enemy' },
      ],
      scripts: {
        getColorScript: {
          event: 'onCollision',
          source: `
            ctx.getColor(ctx.entity.id);
            ctx.entity.getColor();
            ctx.other.getColor();
          `,
        },
      },
    })
    world.entities = world.entities ?? []
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnCollision('player', 'enemy')
    expect(game.getColor).toHaveBeenCalledWith('player')
    expect(game.getColor).toHaveBeenCalledWith('player')
    expect(game.getColor).toHaveBeenCalledWith('enemy')
    expect(game.getColor).toHaveBeenCalledTimes(3)
  })

  it('ctx.addVectorToPosition with resetVelocity true passes 5th arg to game', () => {
    const world = createMockWorld({
      entities: [{ id: 'player', scripts: ['moveScript'] }],
      scripts: {
        moveScript: {
          event: 'onUpdate',
          source: 'ctx.addVectorToPosition(undefined, 10, 20, 30, true)',
        },
      },
    })
    world.entities = world.entities ?? []
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnUpdate(0.016)
    expect(game.addVectorToPosition).toHaveBeenCalledWith('player', 10, 20, 30, true)
  })
})
