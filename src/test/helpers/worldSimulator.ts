/**
 * WorldSimulator: headless physics + transformer simulation harness for integration tests.
 *
 * Loads a RennWorld JSON (primitive shapes only — no GLB assets required), wires up
 * Rapier physics and the transformer pipeline, and exposes a simple scripted-input API
 * for writing scenarios that assert entity positions over time.
 *
 * Usage:
 *   const sim = await WorldSimulator.create(world)
 *   sim.setInput({ w: true })
 *   sim.runFrames(60)  // 1 second at default 60 fps
 *   expect(sim.getPosition('car')[2]).toBeLessThan(0)
 *   sim.dispose()
 */

import * as THREE from 'three'
import { initRapier, createPhysicsWorld, PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { createTransformerChain } from '@/transformers/transformerRegistry'
import type { RennWorld, Entity } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RawInput, RawKeyboardState } from '@/types/transformer'
import { createMeshForShape } from './three'

export const DEFAULT_DT = 1 / 60

const EMPTY_KEYS: RawKeyboardState = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false,
}

function buildRawInput(keys: Partial<RawKeyboardState>): RawInput {
  return {
    keys: { ...EMPTY_KEYS, ...keys },
    wheel: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 },
  }
}

function buildLoadedEntities(world: RennWorld): LoadedEntity[] {
  return world.entities.map((entity: Entity) => ({
    entity,
    mesh: entity.shape
      ? createMeshForShape(entity.shape)
      : new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
  }))
}

/**
 * Snapshot of all dynamic/kinematic entity states at a point in time.
 * Useful for logging before converting to assertions.
 */
export interface SimSnapshot {
  [entityId: string]: {
    position: [number, number, number]
    velocity: [number, number, number]
    rotation: { x: number; y: number; z: number; w: number }
  }
}

export class WorldSimulator {
  private physicsWorld: PhysicsWorld
  private registry: RenderItemRegistry
  private currentKeys: Partial<RawKeyboardState> = {}
  private entities: LoadedEntity[]
  private wind: [number, number, number] | undefined

  private constructor(
    physicsWorld: PhysicsWorld,
    registry: RenderItemRegistry,
    entities: LoadedEntity[],
    wind?: [number, number, number],
  ) {
    this.physicsWorld = physicsWorld
    this.registry = registry
    this.entities = entities
    this.wind = wind
  }

  /**
   * Build a simulator from a RennWorld definition.
   * Rapier is initialised once globally; subsequent calls are no-ops.
   *
   * @param world  Parsed RennWorld (from JSON import or inline).
   * @param warmupFrames  Frames to advance before returning so transformer chains
   *                      finish their async init. Default 15 (~250 ms at 60 fps).
   */
  static async create(world: RennWorld, warmupFrames = 15): Promise<WorldSimulator> {
    await initRapier()

    const entities = buildLoadedEntities(world)
    const physicsWorld = await createPhysicsWorld(world, entities)

    let currentKeys: Partial<RawKeyboardState> = {}
    const rawInputGetter = (): RawInput => buildRawInput(currentKeys)

    const registry = RenderItemRegistry.create(entities, physicsWorld, rawInputGetter)

    // Eagerly build transformer chains for entities that declare them so tests
    // don't need to wait for the async fire-and-forget inside RenderItemRegistry.
    for (const { entity } of entities) {
      if (entity.transformers && entity.transformers.length > 0) {
        const chain = await createTransformerChain(
          entity.transformers,
          rawInputGetter,
          entity,
        )
        const item = registry.get(entity.id)
        if (item && chain) {
          item.transformerChain = chain
        }
      }
    }

    registry.setRawInputGetter(rawInputGetter)

    const wind = world.world.wind as [number, number, number] | undefined
    const sim = new WorldSimulator(physicsWorld, registry, entities, wind)
    // currentKeys lives in the outer scope; wire it through the instance so
    // setInput updates the same reference the getter captures.
    sim.currentKeys = currentKeys
    // Replace the getter reference so it always reads from sim.currentKeys.
    const simInputGetter = (): RawInput => buildRawInput(sim.currentKeys)
    registry.setRawInputGetter(simInputGetter)
    for (const { entity } of entities) {
      const item = registry.get(entity.id)
      if (item?.transformerChain) {
        item.transformerChain.getAll().forEach((t) => {
          if (typeof (t as any).setRawInputGetter === 'function') {
            ;(t as any).setRawInputGetter(simInputGetter)
          }
        })
      }
    }

    if (warmupFrames > 0) {
      sim.runFrames(warmupFrames)
    }

    return sim
  }

  // ---------------------------------------------------------------------------
  // Input control
  // ---------------------------------------------------------------------------

  /**
   * Set which keys are currently held. Unspecified keys default to false.
   * Call clearInput() to release all keys.
   */
  setInput(keys: Partial<RawKeyboardState>): void {
    this.currentKeys = keys
  }

  /** Release all keys. */
  clearInput(): void {
    this.currentKeys = {}
  }

  // ---------------------------------------------------------------------------
  // Simulation stepping
  // ---------------------------------------------------------------------------

  /**
   * Advance the simulation by `count` frames of `dt` seconds each.
   * Mirrors the production frame loop: transformers → physics step → sync.
   */
  runFrames(count: number, dt = DEFAULT_DT): void {
    for (let i = 0; i < count; i++) {
      this.registry.executeTransformers(dt, this.wind)
      this.physicsWorld.step(dt)
      this.registry.syncFromPhysics()
    }
  }

  /**
   * Advance the simulation for `seconds` wall-clock seconds at the given frame rate.
   */
  runSeconds(seconds: number, dt = DEFAULT_DT): void {
    this.runFrames(Math.round(seconds / dt), dt)
  }

  // ---------------------------------------------------------------------------
  // State reading
  // ---------------------------------------------------------------------------

  /** Position of an entity as [x, y, z]. Returns [0,0,0] if entity not found. */
  getPosition(entityId: string): [number, number, number] {
    const cached = this.physicsWorld.getCachedTransform(entityId)
    if (cached) {
      return [cached.position.x, cached.position.y, cached.position.z]
    }
    const body = this.physicsWorld.getBody(entityId)
    if (body) {
      const t = body.translation()
      return [t.x, t.y, t.z]
    }
    return [0, 0, 0]
  }

  /** Linear velocity of an entity as [x, y, z]. Returns [0,0,0] if entity not found. */
  getVelocity(entityId: string): [number, number, number] {
    return this.physicsWorld.getLinearVelocity(entityId) ?? [0, 0, 0]
  }

  /** Rapier quaternion rotation of an entity. */
  getRotation(entityId: string): { x: number; y: number; z: number; w: number } {
    const cached = this.physicsWorld.getCachedTransform(entityId)
    if (cached) return cached.rotation
    const body = this.physicsWorld.getBody(entityId)
    if (body) {
      const r = body.rotation()
      return { x: r.x, y: r.y, z: r.z, w: r.w }
    }
    return { x: 0, y: 0, z: 0, w: 1 }
  }

  /**
   * Capture the current state of all dynamic/kinematic entities.
   * Log the result (JSON.stringify) to build expected values for assertions.
   */
  snapshot(): SimSnapshot {
    const result: SimSnapshot = {}
    for (const { entity } of this.entities) {
      if (!entity.bodyType || entity.bodyType === 'static') continue
      result[entity.id] = {
        position: this.getPosition(entity.id),
        velocity: this.getVelocity(entity.id),
        rotation: this.getRotation(entity.id),
      }
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.physicsWorld.dispose()
  }
}
