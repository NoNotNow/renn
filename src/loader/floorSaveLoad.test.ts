import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import { initRapier, createPhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { RennWorld } from '@/types/world'

beforeAll(async () => {
  await initRapier()
})

function createWorldWithFloor(): RennWorld {
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
    },
    entities: [
      {
        id: 'ground',
        name: 'Ground',
        bodyType: 'static',
        shape: { type: 'plane' },
        position: [0, 0, 0],
        friction: 1.0,
        material: { color: [0.3, 0.5, 0.3] },
      },
      {
        id: 'ball',
        name: 'Ball',
        bodyType: 'dynamic',
        shape: { type: 'sphere', radius: 0.5 },
        position: [0, 2, 0],
        mass: 1,
        restitution: 0.3,
      },
    ],
  }
}

/**
 * Simulates the save/load round-trip that Builder.tsx performs:
 * 1. Load world → create physics → create registry
 * 2. getAllPoses() captures poses (done before every save)
 * 3. syncPosesFromScene merges poses into entity data
 * 4. Save the updated world data
 * 5. Load it again
 */
async function simulateSaveLoadRoundTrip(world: RennWorld): Promise<{
  reloadedWorld: RennWorld
  registry: RenderItemRegistry
  physics: ReturnType<typeof createPhysicsWorld> extends Promise<infer T> ? T : never
}> {
  const { entities } = await loadWorld(world)
  const physics = await createPhysicsWorld(world, entities)
  const registry = RenderItemRegistry.create(entities, physics)

  const allPoses = registry.getAllPoses()

  const updatedEntities = world.entities.map((e) => {
    const pose = allPoses.get(e.id)
    return pose ? { ...e, position: pose.position, rotation: pose.rotation } : e
  })
  const savedWorld: RennWorld = { ...world, entities: updatedEntities }

  physics.dispose()

  const reloaded = await loadWorld(savedWorld)
  const reloadedPhysics = await createPhysicsWorld(savedWorld, reloaded.entities)
  const reloadedRegistry = RenderItemRegistry.create(reloaded.entities, reloadedPhysics)

  return {
    reloadedWorld: savedWorld,
    registry: reloadedRegistry,
    physics: reloadedPhysics,
  }
}

describe('Floor save/load round-trip', () => {
  it('ground plane rotation is preserved after save/load', async () => {
    const world = createWorldWithFloor()
    const { entities } = await loadWorld(world)
    const physics = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, physics)

    const allPoses = registry.getAllPoses()
    const groundPose = allPoses.get('ground')!

    // The entity rotation should be [0, 0, 0] — the visual -PI/2 offset
    // should NOT leak into the returned rotation
    expect(groundPose.rotation[0]).toBeCloseTo(0, 5)
    expect(groundPose.rotation[1]).toBeCloseTo(0, 5)
    expect(groundPose.rotation[2]).toBeCloseTo(0, 5)

    physics.dispose()
  })

  it('floor physics collider remains horizontal after save/load', async () => {
    const world = createWorldWithFloor()
    const { registry, physics } = await simulateSaveLoadRoundTrip(world)

    // Place ball above ground and simulate several physics steps
    physics.setPosition('ball', 0, 2, 0)
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60)
    }

    const ballBody = physics.getBody('ball')!
    const ballY = ballBody.translation().y

    // Ball should have landed on the floor (y ~ 0.5 for radius 0.5 on ground at y=0)
    // NOT fallen to -infinity
    expect(ballY).toBeGreaterThan(-1)
    expect(ballY).toBeLessThan(3)

    registry.clear()
    physics.dispose()
  })

  it('items at offset from center land on infinite plane (no fall-through)', async () => {
    const world = createWorldWithFloor()
    const { entities } = await loadWorld(world)
    const physics = await createPhysicsWorld(world, entities)

    // Place ball far from center; with HalfSpace ground it should still land
    physics.setPosition('ball', 6, 2, 6)
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60)
    }
    const ballY6 = physics.getBody('ball')!.translation().y
    expect(ballY6).toBeGreaterThan(-1)

    // Same at larger offset (confirms infinite plane)
    physics.setPosition('ball', 50, 2, 50)
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60)
    }
    const ballY50 = physics.getBody('ball')!.translation().y
    expect(ballY50).toBeGreaterThan(-1)

    physics.dispose()
  })

  it('floor mesh faces upward after save/load', async () => {
    const world = createWorldWithFloor()
    const { entities } = await loadWorld(world)

    const groundMesh = entities.find((e) => e.entity.id === 'ground')!.mesh
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(groundMesh.quaternion)

    // The plane normal (local Z) should point upward after the premultiply
    expect(up.y).toBeCloseTo(1, 1)

    // Now simulate save/load
    const physics1 = await createPhysicsWorld(world, entities)
    const registry1 = RenderItemRegistry.create(entities, physics1)
    const allPoses = registry1.getAllPoses()

    const savedWorld: RennWorld = {
      ...world,
      entities: world.entities.map((e) => {
        const pose = allPoses.get(e.id)
        return pose ? { ...e, position: pose.position, rotation: pose.rotation } : e
      }),
    }
    physics1.dispose()

    // Reload
    const reloaded = await loadWorld(savedWorld)
    const reloadedGroundMesh = reloaded.entities.find((e) => e.entity.id === 'ground')!.mesh
    const upAfterReload = new THREE.Vector3(0, 0, 1).applyQuaternion(reloadedGroundMesh.quaternion)

    // Plane should STILL face upward after reload
    expect(upAfterReload.y).toBeCloseTo(1, 1)
  })

  it('survives multiple save/load cycles without rotation drift', async () => {
    let currentWorld = createWorldWithFloor()

    for (let cycle = 0; cycle < 5; cycle++) {
      const { entities } = await loadWorld(currentWorld)
      const physics = await createPhysicsWorld(currentWorld, entities)
      const registry = RenderItemRegistry.create(entities, physics)

      const allPoses = registry.getAllPoses()
      const groundPose = allPoses.get('ground')!

      expect(groundPose.rotation[0]).toBeCloseTo(0, 3)
      expect(groundPose.rotation[1]).toBeCloseTo(0, 3)
      expect(groundPose.rotation[2]).toBeCloseTo(0, 3)

      currentWorld = {
        ...currentWorld,
        entities: currentWorld.entities.map((e) => {
          const pose = allPoses.get(e.id)
          return pose ? { ...e, position: pose.position, rotation: pose.rotation } : e
        }),
      }

      physics.dispose()
    }
  })
})
