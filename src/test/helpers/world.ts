import type { RennWorld, Entity } from '@/types/world'

/**
 * Create a test world with optional overrides
 */
export function createTestWorld(overrides?: Partial<RennWorld>): RennWorld {
  return {
    version: '1.0',
    world: {},
    entities: [],
    ...overrides,
  }
}

/**
 * Create a test world with a list of entities
 */
export function createWorldWithEntities(entities: Entity[]): RennWorld {
  return createTestWorld({ entities })
}
