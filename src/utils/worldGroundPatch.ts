import type { Entity, RennWorld } from '@/types/world'

/** Map the first plane (ground) entity; caller must ensure `ground` is the current plane from `world`. */
export function patchFirstPlaneEntity(
  world: RennWorld,
  ground: Entity,
  mapEntity: (e: Entity) => Entity,
): RennWorld {
  return {
    ...world,
    entities: world.entities.map((e) => (e.id === ground.id ? mapEntity(e) : e)),
  }
}
