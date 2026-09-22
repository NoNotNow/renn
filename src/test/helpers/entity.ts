import type { Entity } from '@/types/world'

/**
 * Create a test entity with optional overrides
 */
export function createTestEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'test_entity',
    name: 'Test Entity',
    bodyType: 'static',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    ...overrides,
  }
}
