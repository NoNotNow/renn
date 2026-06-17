import { describe, it, expect, beforeAll } from 'vitest'
import { loadWorld } from '@/loader/loadWorld'
import { initRapier, createPhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { restoreInitialPosesIntoRegistry, type InitialPoseMap } from '@/runtime/restoreInitialPoses'
import type { RennWorld, Rotation, Vec3 } from '@/types/world'

beforeAll(async () => {
  await initRapier()
})

function worldWithGroundScale(scale: number): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -9.81, 0] },
    entities: [
      {
        id: 'ground',
        bodyType: 'static',
        shape: { type: 'plane' },
        position: [0, 0, 0],
        scale: [scale, scale, scale],
      },
    ],
  }
}

describe('restoreInitialPosesIntoRegistry', () => {
  it('does not overwrite loaded entity scale when pose snapshot ref is empty', async () => {
    const world = worldWithGroundScale(10)
    const { entities } = await loadWorld(world)
    const physics = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, physics)

    expect(registry.getScale('ground')).toEqual([10, 10, 10])

    const initialPosesRef = { current: null as InitialPoseMap | null }
    restoreInitialPosesIntoRegistry(registry, initialPosesRef)

    expect(registry.getScale('ground')).toEqual([10, 10, 10])

    physics.dispose()
  })

  it('applies stored poses only for matching registry ids', async () => {
    const world = worldWithGroundScale(10)
    const { entities } = await loadWorld(world)
    const physics = await createPhysicsWorld(world, entities)
    const registry = RenderItemRegistry.create(entities, physics)

    const stalePoses: InitialPoseMap = new Map([
      ['ground', { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Rotation, scale: [1, 1, 1] as Vec3 }],
    ])
    const initialPosesRef = { current: stalePoses }
    restoreInitialPosesIntoRegistry(registry, initialPosesRef)

    expect(registry.getScale('ground')).toEqual([1, 1, 1])
    expect(initialPosesRef.current).toBeNull()

    physics.dispose()
  })
})
