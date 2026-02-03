import { initRapier } from '@/physics/rapierPhysics'
import type { RennWorld } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import { createMeshForShape } from './three'

/**
 * Setup Rapier physics for tests (to be used in beforeAll)
 */
export async function setupRapier(): Promise<void> {
  await initRapier()
}

/**
 * Create loaded entities from a world for testing
 */
export function createLoadedEntities(world: RennWorld): LoadedEntity[] {
  return world.entities.map((entity) => ({
    entity,
    mesh: entity.shape ? createMeshForShape(entity.shape) : createMeshForShape({ type: 'box', width: 1, height: 1, depth: 1 }),
  }))
}
