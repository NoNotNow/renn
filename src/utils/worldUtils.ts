import type { RennWorld, Vec3, Entity } from '@/types/world'

/**
 * Find an entity by its ID in the world.
 * @param world - The world containing entities
 * @param entityId - The ID of the entity to find
 * @returns The entity if found, undefined otherwise
 */
export function findEntityById(world: RennWorld, entityId: string): Entity | undefined {
  return world.entities.find((e) => e.id === entityId)
}

/**
 * Find an entity by its ID in an array of entities.
 * @param entities - Array of entities to search
 * @param entityId - The ID of the entity to find
 * @returns The entity if found, undefined otherwise
 */
export function findEntityByIdInArray(entities: Entity[], entityId: string): Entity | undefined {
  return entities.find((e) => e.id === entityId)
}

/**
 * Update an entity's position in the world.
 * @param world - The world containing the entity
 * @param entityId - The ID of the entity to update
 * @param position - The new position
 * @returns A new world with the updated entity
 */
export function updateEntityPosition(
  world: RennWorld,
  entityId: string,
  position: Vec3
): RennWorld {
  return {
    ...world,
    entities: world.entities.map((e) =>
      e.id === entityId ? { ...e, position } : e
    ),
  }
}
