import type { ArenaSpec, V2 } from '@/test/fixtures/avEvasionArena'
import type { RennWorld } from '@/types/world'
import { buildArenaWorldFrom } from './arenaWorld'
import { cellCentre, DEFAULT_MAZE, generateMaze, type Maze, type MazeParams } from './mazeGen'

/**
 * Maze-escape episodes for AV speed optimisation: a seeded maze, the AV car in an inner cell with a defined heading,
 * the goal ~25 m outside the single exit gate. Every episode builds a FRESH world (defined start).
 */

export interface MazeEpisodeSpec {
  key: string
  mazeSeed: number
  /** [col, row] of an inner cell (1 .. n-2). */
  startCell: [number, number]
  /** Heading in degrees, 0 = facing -Z (north), positive = left / counter-clockwise from above. */
  startYaw: number
}

/** Sim seconds an episode may take (the optimiser's per-episode timeout). */
export const MAZE_EPISODE_SECONDS = 120

/** Maze of the shipped example world. */
export const EXAMPLE_MAZE_SEED = 7

export function mazeParamsFor(mazeSeed: number): MazeParams {
  return { seed: mazeSeed, ...DEFAULT_MAZE }
}

/** Tuned on the TRAIN / HOLDOUT split: disjoint start cells within the example maze, holdout also on other mazes. */
export const TRAIN_EPISODES: MazeEpisodeSpec[] = [
  { key: 'tr1', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [1, 6], startYaw: 0 },
  { key: 'tr2', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [6, 6], startYaw: 90 },
  { key: 'tr3', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [3, 4], startYaw: 180 },
  { key: 'tr4', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [1, 1], startYaw: -90 },
  { key: 'tr5', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [5, 3], startYaw: 45 },
  { key: 'tr6', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [4, 6], startYaw: 0 },
]

export const HOLDOUT_EPISODES: MazeEpisodeSpec[] = [
  { key: 'ho1', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [2, 2], startYaw: 135 },
  { key: 'ho2', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [6, 1], startYaw: -45 },
  { key: 'ho3', mazeSeed: 11, startCell: [3, 5], startYaw: 0 },
  { key: 'ho4', mazeSeed: 11, startCell: [6, 2], startYaw: 90 },
  { key: 'ho5', mazeSeed: 23, startCell: [2, 4], startYaw: 180 },
  { key: 'ho6', mazeSeed: 42, startCell: [5, 5], startYaw: -90 },
]

export function listMazeEpisodes(): { train: MazeEpisodeSpec[]; holdout: MazeEpisodeSpec[] } {
  return { train: TRAIN_EPISODES, holdout: HOLDOUT_EPISODES }
}

const mazeCache = new Map<number, Maze>()
function mazeOf(seed: number): Maze {
  let m = mazeCache.get(seed)
  if (!m) mazeCache.set(seed, (m = generateMaze(mazeParamsFor(seed))))
  return m
}

/** Arena spec (boxes, start pose, goal) of an episode; feed it to `buildArenaWorldFrom` / `runScenario`. */
export function mazeArenaSpec(ep: MazeEpisodeSpec): ArenaSpec {
  const maze = mazeOf(ep.mazeSeed)
  const at: V2 = cellCentre(maze, ep.startCell[0], ep.startCell[1])
  return { car: { at, yawDeg: ep.startYaw }, goal: maze.goal, boxes: maze.walls, puppets: [] }
}

/** Fresh world of an episode. `source` = the world holding the AV car (`self_hunt_flexible`, current library code). */
export function buildMazeEpisodeWorld(source: RennWorld, ep: MazeEpisodeSpec): RennWorld {
  return buildArenaWorldFrom(source, mazeArenaSpec(ep))
}

/** Maze of an episode (walls, goal, exit). */
export function mazeOfEpisode(ep: MazeEpisodeSpec): Maze {
  return mazeOf(ep.mazeSeed)
}
