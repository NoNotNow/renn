import type { RennWorld, Entity } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { getDefaultShapeForType } from '@/data/entityDefaults'

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

/**
 * Create a test world with entities for each shape type
 */
export function createWorldWithShapes(shapes: AddableShapeType[]): RennWorld {
  const entities: Entity[] = shapes.map((shapeType, index) => ({
    id: `entity_${shapeType}_${index}`,
    name: `${shapeType} entity`,
    bodyType: 'static' as const,
    shape: getDefaultShapeForType(shapeType),
    position: [index * 2, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  }))
  
  return createTestWorld({ entities })
}
