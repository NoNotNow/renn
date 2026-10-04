import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArenaBox, ArenaSpec, V2 } from '@/test/fixtures/avEvasionArena'

/**
 * Deterministic maze / labyrinth cases for the AV routing (see `av-maze-scenarios.test.ts`, `agent-context/feature-av-stack.md`).
 * Walls match the `self_hunt_flexible` labyrinth: 1 m thick, 1.5 m high, corridors ~14 m. North = -Z, the car starts facing north (yaw 0).
 */

export const WALL_H = 1.5
export const WALL_T = 1

/** Axis-aligned wall from `a` to `b` (one coordinate must match), 1 m thick, ends extended by half a thickness so corners close. */
export function seg(a: V2, b: V2): ArenaBox {
  const horizontal = Math.abs(a[1] - b[1]) < 1e-9
  const len = Math.abs(horizontal ? b[0] - a[0] : b[1] - a[1]) + WALL_T
  return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], size: horizontal ? [len, WALL_T] : [WALL_T, len], height: WALL_H }
}

export interface MazeCase {
  name: string
  about: string
  seconds: number
  spec: () => ArenaSpec
  /** Max direction reversals (a K-turn costs 2-3). */
  maxReversals: number
  /** Max seconds without moving (> 0.5 m/s). */
  maxStalledSec?: number
}

/** Walls of one maze of the example world (ids `wall_maze_<A|B|C>_*`) as arena boxes. */
function worldMazeWalls(prefix: string): ArenaBox[] {
  const w = JSON.parse(readFileSync(join(process.cwd(), 'public/exampleWorlds/self_hunt_flexible/world.json'), 'utf8')) as {
    entities: { id: string; position: number[]; rotation: number[]; shape: { width: number; depth: number } }[]
  }
  return w.entities
    .filter((e) => e.id.startsWith(prefix))
    .map((e) => ({ at: [e.position[0]!, e.position[2]!] as V2, size: [e.shape.width, e.shape.depth] as V2, yawDeg: (e.rotation[1]! * 180) / Math.PI, height: WALL_H }))
}

const CHASER: V2 = [2.5, 5]

export const MAZE_CASES: MazeCase[] = [
  {
    name: 'maze-goal-behind-wall',
    about: 'goal 100 m ahead behind a 180 m long wall 40 m in front of the car: drive around it (90 m detour)',
    seconds: 40,
    maxReversals: 1,
    spec: () => ({ car: { at: [0, 0], yawDeg: 0 }, goal: [0, -100], boxes: [seg([-90, -40], [90, -40])], puppets: [] }),
  },
  {
    name: 'maze-dead-end',
    about: 'goal east behind an L-shaped dead-end corridor the car starts in (the end of the L is hidden until it gets there): turn around, leave, go around',
    seconds: 55,
    maxReversals: 8,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [100, -51],
      boxes: [seg([-7.5, 10], [-7.5, -58]), seg([7.5, 10], [7.5, -44]), seg([-7.5, -58], [60, -58]), seg([7.5, -44], [60, -44]), seg([60, -58], [60, -44])],
      puppets: [],
    }),
  },
  {
    name: 'maze-u-trap',
    about: 'goal straight through the closed side of a 16 m wide, 40 m deep U (opening towards the car): do not enter, go around',
    seconds: 40,
    maxReversals: 2,
    spec: () => ({
      car: { at: [0, 60], yawDeg: 0 },
      goal: [0, -120],
      boxes: [seg([-8.5, -50], [-8.5, -10]), seg([8.5, -50], [8.5, -10]), seg([-8.5, -50], [8.5, -50])],
      puppets: [],
    }),
  },
  {
    name: 'maze-u-trap-inside',
    about: 'car starts deep inside the 16 m wide U (nose to the closed side), goal straight through it: back out / turn around, go around the arm',
    seconds: 45,
    maxReversals: 8,
    spec: () => ({
      car: { at: [0, -30], yawDeg: 0 },
      goal: [0, -120],
      boxes: [seg([-8.5, -50], [-8.5, 10]), seg([8.5, -50], [8.5, 10]), seg([-8.5, -50], [8.5, -50])],
      puppets: [],
    }),
  },
  {
    name: 'maze-corridor-chase',
    about: '14 m wide, 320 m long corridor, a homing 25 m/s chaser enters 60 m behind the car: outrun it to the open end, no contact',
    seconds: 22,
    maxReversals: 1,
    spec: () => ({
      car: { at: [0, 40], yawDeg: 0 },
      goal: [0, -380],
      boxes: [seg([-7.5, 60], [-7.5, -260]), seg([7.5, 60], [7.5, -260])],
      puppets: [{ id: 'chaser_a', size: CHASER, at: [0, 100], yawDeg: 0, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.3 } }],
    }),
  },
  {
    name: 'maze-gate-exit',
    about: 'maze C of the example world (lab seed 3 shuttle): car in the dead-end pocket facing the north wall, goal north behind the maze: out through the east gate and around',
    seconds: 45,
    maxReversals: 8,
    spec: () => ({ car: { at: [-256, 68], yawDeg: -3 }, goal: [-254, -41], boxes: worldMazeWalls('wall_maze_C'), puppets: [] }),
  },
]
