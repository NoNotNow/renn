import type { ArenaSpec, V2 } from '@/test/fixtures/avEvasionArena'
import type { RennWorld } from '@/types/world'
import { buildArenaWorldFrom } from './arenaWorld'
import { cellCentre, DEFAULT_MAZE, generateMaze, mulberry32, type Maze, type MazeParams } from './mazeGen'

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

/**
 * Episode set version. 1 = E1 (6 starts in the single seed-7 maze). 2 = D1: TRAIN = 8 fresh mazes x 3 starts, no maze seed
 * shared with any HOLDOUT episode; HOLDOUT keeps the 6 original keys and gains an extra set of 18 on 6 more fresh mazes.
 */
export const EPISODE_SET_VERSION = 2

/** Deterministic start poses of a generated maze: inner cells (1..6), headings in multiples of 45 degrees, no repeated cell. */
function generatedStarts(mazeSeed: number, n: number): Pick<MazeEpisodeSpec, 'startCell' | 'startYaw'>[] {
  const rnd = mulberry32(mazeSeed * 7919 + 13)
  const out: Pick<MazeEpisodeSpec, 'startCell' | 'startYaw'>[] = []
  const used = new Set<string>()
  while (out.length < n) {
    const c = 1 + Math.floor(rnd() * 6)
    const r = 1 + Math.floor(rnd() * 6)
    const yaw = (Math.floor(rnd() * 8) - 3) * 45
    if (used.has(`${c},${r}`)) continue
    used.add(`${c},${r}`)
    out.push({ startCell: [c, r], startYaw: yaw })
  }
  return out
}

function generatedSet(prefix: string, seeds: number[], perMaze: number): MazeEpisodeSpec[] {
  return seeds.flatMap((mazeSeed) => generatedStarts(mazeSeed, perMaze).map((st, i) => ({ key: `${prefix}${mazeSeed}${'abcdef'[i]}`, mazeSeed, ...st })))
}

/** Maze seeds of TRAIN (v2) and of the extra HOLDOUT set; both disjoint from each other and from the original HOLDOUT seeds. */
export const TRAIN_MAZE_SEEDS = [101, 102, 103, 104, 105, 106, 107, 108]
export const HOLDOUT_EXTRA_MAZE_SEEDS = [201, 202, 203, 204, 205, 206]

/** Episode set v1 TRAIN (E1): 6 starts in the example maze. Still resolvable by key; NOT part of TRAIN any more (its maze is shared with ho1/ho2). */
export const LEGACY_TRAIN_EPISODES: MazeEpisodeSpec[] = [
  { key: 'tr1', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [1, 6], startYaw: 0 },
  { key: 'tr2', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [6, 6], startYaw: 90 },
  { key: 'tr3', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [3, 4], startYaw: 180 },
  { key: 'tr4', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [1, 1], startYaw: -90 },
  { key: 'tr5', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [5, 3], startYaw: 45 },
  { key: 'tr6', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [4, 6], startYaw: 0 },
]

/** TRAIN (v2): 8 mazes x 3 starts. */
export const TRAIN_EPISODES: MazeEpisodeSpec[] = generatedSet('t', TRAIN_MAZE_SEEDS, 3)

/** Original 6 held-out episodes (keys unchanged since E1). */
export const HOLDOUT_EPISODES: MazeEpisodeSpec[] = [
  { key: 'ho1', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [2, 2], startYaw: 135 },
  { key: 'ho2', mazeSeed: EXAMPLE_MAZE_SEED, startCell: [6, 1], startYaw: -45 },
  { key: 'ho3', mazeSeed: 11, startCell: [3, 5], startYaw: 0 },
  { key: 'ho4', mazeSeed: 11, startCell: [6, 2], startYaw: 90 },
  { key: 'ho5', mazeSeed: 23, startCell: [2, 4], startYaw: 180 },
  { key: 'ho6', mazeSeed: 42, startCell: [5, 5], startYaw: -90 },
]

/** Extra held-out episodes: 6 fresh mazes x 3 starts (never used in TRAIN, any maze seed). */
export const HOLDOUT_EXTRA_EPISODES: MazeEpisodeSpec[] = generatedSet('h', HOLDOUT_EXTRA_MAZE_SEEDS, 3)

export function listMazeEpisodes(): { train: MazeEpisodeSpec[]; holdout: MazeEpisodeSpec[]; holdoutExtra: MazeEpisodeSpec[]; legacyTrain: MazeEpisodeSpec[] } {
  return { train: TRAIN_EPISODES, holdout: HOLDOUT_EPISODES, holdoutExtra: HOLDOUT_EXTRA_EPISODES, legacyTrain: LEGACY_TRAIN_EPISODES }
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
