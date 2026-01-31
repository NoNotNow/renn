import type { RennWorld, Vec3 } from '@/types/world'

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
