import type { RennWorld, Vec3 } from '@/types/world'

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
