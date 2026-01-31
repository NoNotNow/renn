import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { ScriptRunner } from './scriptRunner'
import type { RennWorld } from '@/types/world'
import type { GameAPI } from './gameApi'
import type { LoadedEntity } from '@/loader/loadWorld'

function createMockGameAPI(): GameAPI {
  return {
    time: { current: 0, delta: 0 },
    getEntity: vi.fn().mockReturnValue(null),
    getPosition: vi.fn().mockReturnValue(null),
    setPosition: vi.fn(),
    applyForce: vi.fn(),
    applyImpulse: vi.fn(),
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
          scripts: { onSpawn: 'onSpawnScript' },
        },
      ],
      scripts: {
        onSpawnScript: 'game.spawnCalled(entity.id)',
      },
    })
    
    const game = {
      ...createMockGameAPI(),
      spawnCalled,
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
          scripts: { onUpdate: 'onUpdateScript' },
        },
      ],
      scripts: {
        onUpdateScript: 'game.updateCalled(entity.id, dt)',
      },
    })
    
    const game = {
      ...createMockGameAPI(),
      updateCalled,
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
        {
          id: 'player',
          scripts: { onCollision: 'onCollisionScript' },
        },
        {
          id: 'enemy',
        },
      ],
      scripts: {
        onCollisionScript: 'game.collisionCalled(entity.id, other.id)',
      },
    })
    
    const game = {
      ...createMockGameAPI(),
      collisionCalled,
    } as unknown as GameAPI
    
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnCollision('player', 'enemy')
    
    expect(collisionCalled).toHaveBeenCalledWith('player', 'enemy')
  })

  it('handles missing script gracefully', () => {
    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: { onSpawn: 'nonExistentScript' },
        },
      ],
    })
    
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    
    // Should not throw
    expect(() => runner.runOnSpawn('player')).not.toThrow()
  })

  it('handles script compilation errors', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    const world = createMockWorld({
      scripts: {
        badScript: 'this is not valid javascript {{{',
      },
    })
    
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    
    // Should not throw during construction
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
          scripts: { onUpdate: 'errorScript' },
        },
      ],
      scripts: {
        errorScript: 'throw new Error("Runtime error!")',
      },
    })
    
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    
    // Should not throw
    expect(() => runner.runOnUpdate(0.016)).not.toThrow()
    expect(consoleSpy).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('runs onUpdate for multiple entities', () => {
    const updateCalled = vi.fn()
    
    const world = createMockWorld({
      entities: [
        {
          id: 'player',
          scripts: { onUpdate: 'onUpdateScript' },
        },
        {
          id: 'enemy',
          scripts: { onUpdate: 'onUpdateScript' },
        },
        {
          id: 'platform', // No script
        },
      ],
      scripts: {
        onUpdateScript: 'game.updateCalled(entity.id)',
      },
    })
    
    const game = {
      ...createMockGameAPI(),
      updateCalled,
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
          scripts: { onUpdate: 'moveScript' },
        },
      ],
      scripts: {
        moveScript: 'game.setPosition("player", 1, 2, 3)',
      },
    })
    
    const game = createMockGameAPI()
    const getMeshById = vi.fn()
    const entities = createLoadedEntities(world)
    
    const runner = new ScriptRunner(world, game, getMeshById, entities)
    runner.runOnUpdate(0.016)
    
    expect(game.setPosition).toHaveBeenCalledWith('player', 1, 2, 3)
  })
})
