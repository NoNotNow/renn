import type { RennWorld } from '@/types/world'
import { buildMazeEpisodeWorld, EXAMPLE_MAZE_SEED, type MazeEpisodeSpec } from './episodes'

/** Episode shown in the shipped example world (the first TRAIN start). */
export const EXAMPLE_EPISODE: MazeEpisodeSpec = { key: 'example', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [1, 6], startYaw: 0 }

export const GOAL_MARKER_ID = 'maze_goal_marker'

function carIdOf(world: RennWorld): string {
  const car = world.entities.find((e) => e.transformerPipeStack?.length)
  if (!car) throw new Error('no AV car in the episode world')
  return car.id
}

/** Example-world flavour of an episode: the episode world plus a flat goal marker (sunk flush with the ground, so it neither blocks nor is sensed as an obstacle) and a follow camera. */
export function buildMazeExampleWorld(source: RennWorld, ep: MazeEpisodeSpec = EXAMPLE_EPISODE): RennWorld {
  const world = buildMazeEpisodeWorld(source, ep)
  const carId = carIdOf(world)
  const wander = (world.transformers as Record<string, { params?: { perimeter?: { center: number[] } } }>)[`${carId}_tf10`]
  const c = wander?.params?.perimeter?.center ?? [0, 0, 0]
  world.entities = [
    ...world.entities,
    {
      id: GOAL_MARKER_ID,
      name: 'Goal',
      bodyType: 'static',
      shape: { type: 'cylinder', radius: 5, height: 0.2 },
      position: [c[0]!, -0.09, c[2]!],
      rotation: [0, 0, 0],
      material: { color: [1, 0.85, 0.1] },
    },
  ] as RennWorld['entities']
  world.world = {
    ...world.world,
    camera: { mode: 'thirdPerson', target: carId, control: 'follow', distance: 40, height: 60, cameraTargetLag: 120, cameraPositionLag: 180 },
  }
  return world
}
