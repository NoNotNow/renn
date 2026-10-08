import type { RennWorld } from '@/types/world'
import { buildMazeEpisodeWorld, EXAMPLE_MAZE_SEED, type MazeEpisodeSpec } from './episodes'
import evolvedCarParams from './mazeEscapeDefaultCar.json'

/**
 * Default car params of the shipped maze-escape example world (flat AV param overrides, saver false).
 * Source: evolved set "c667+s2" = c667 from evolution E6 + heading-aware K-turn genes (cuspHeadW 20, cuspReachW 20,
 * gearIncW 8, cuspCommit); HOLDOUT-24 21.8 s mean, 24/24 reach, 3 contacts. Values live in ./mazeEscapeDefaultCar.json
 * (replace that file to swap in a newer evolved set, then re-export the example world).
 * Merged in buildMazeExampleWorld AFTER the pinned maze params; deliberately NOT part of MAZE_PINNED_CAR_PARAMS so
 * evolution baselines and harness episodes stay unchanged.
 */
export const MAZE_ESCAPE_DEFAULT_CAR_PARAMS: Record<string, unknown> = evolvedCarParams

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
  const binding = (world.entities.find((e) => e.id === carId)?.transformerPipeStack as Array<{ params?: Record<string, unknown> }>)[0]!
  binding.params = { ...binding.params, ...MAZE_ESCAPE_DEFAULT_CAR_PARAMS, saver: false }
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
