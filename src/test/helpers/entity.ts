import type { Entity } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { getDefaultShapeForType } from '@/data/entityDefaults'

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

/**
 * Create a test entity with a specific shape type
 */
export function createEntityWithShape(
  shapeType: AddableShapeType,
  overrides?: Partial<Entity>
): Entity {
  return createTestEntity({
    shape: getDefaultShapeForType(shapeType),
    name: `${shapeType} entity`,
    ...overrides,
  })
}
