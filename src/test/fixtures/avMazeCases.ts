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
  /** Max peak lateral acceleration (m/s^2, see ScenarioMetrics.peakLatAcc). */
  maxLatAcc?: number
  /** Max direction reversals (a K-turn costs 2-3). */
  maxReversals: number
  /** The case judges leaving / stalling only (a tracked chaser in it makes the car flee instead of heading for the goal). */
  noGoal?: boolean
  /** Max seconds without moving (> 0.5 m/s). */
  maxStalledSec?: number
  /** Allowed shuttle / jitter episodes (a K-turn in a dead end reads as one, <= 6 s each). Default 0. */
  maxShuttle?: number
  /** Min hull gap to chasers / parked cars (default 1 m). */
  minGap?: number
  /** Max distance driven in reverse (m). */
  maxReverseDist?: number
  /** Min mean |speed| while reversing (m/s) and max seconds until the car is 15 m away from its start. */
  minReverseMeanSpeed?: number
  maxLeaveSec?: number
  /** Min physics gap (m) to any static obstacle over the run (ScenarioMetrics.minStaticGap): wall clearance for fast manoeuvres. */
  minStaticGap?: number
  /** Time-to-goal limit tuned on the full CPU budget: skipped in the eco / normal suites. */
  fullBudgetOnly?: boolean
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

/** Round obstacle (large cylinder prop) as a shell of 24 thin boxes. */
function cylinder(c: V2, r: number): ArenaBox[] {
  const n = 24
  const out: ArenaBox[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    const side = 2 * r * Math.sin(Math.PI / n) + 0.3
    // tangent direction = a + 90 deg; arena box yaw 0 = size[0] along X
    out.push({ at: [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)], size: [side, WALL_T], yawDeg: -((a + Math.PI / 2) * 180) / Math.PI, height: WALL_H })
  }
  return out
}

/** Car at speed along a wall (x = -d), a 14 m gap 90 m ahead, goal outside the gap. */
function gapEntry(d: number): ArenaSpec {
  const gz0 = -90
  const gw = 14
  return {
    car: { at: [0, 0], yawDeg: 0, speed: 25 },
    goal: [-d - 40, gz0 - gw / 2],
    boxes: [seg([-d, 60], [-d, gz0]), seg([-d, gz0 - gw], [-d, -240])],
    puppets: [],
  }
}

export const MAZE_CASES: MazeCase[] = [
  {
    name: 'turnaround-open',
    about: 'goal 80 m straight behind the car on open ground (no walls): turn around (U-turn / 3-point turn) and drive forward, do not reverse the whole way',
    seconds: 20,
    maxReversals: 4,
    maxReverseDist: 12,
    spec: () => ({ car: { at: [0, 0], yawDeg: 0 }, goal: [0, 80], boxes: [], puppets: [] }),
  },
  {
    name: 'turnaround-corridor',
    about: '14 m wide, 200 m long corridor, goal 80 m behind the car inside it: a 3-point turn fits a 4 x 8 car, so turn instead of reversing the corridor',
    seconds: 30,
    maxReversals: 16,
    // the lab monitor reads each leg of a K-turn in a 14 m corridor (minimum turn radius 8.7 m) as a short shuttle episode
    maxShuttle: 6,
    maxReverseDist: 30,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, 80],
      boxes: [seg([-7.5, 130], [-7.5, -70]), seg([7.5, 130], [7.5, -70])],
      puppets: [],
    }),
  },
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
    maxShuttle: 1,
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
    maxShuttle: 1,
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
    seconds: 15,
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
    maxShuttle: 2,
    spec: () => ({ car: { at: [-256, 68], yawDeg: -3 }, goal: [-254, -41], boxes: worldMazeWalls('wall_maze_C'), puppets: [] }),
  },
  {
    name: 'pocket-escape',
    about: 'live-build case: wall 1.5 m left of the hull, a 15 m radius cylinder 1.5 m ahead, a parked car right-front leaving a 2 m gap (car is 4 m wide), open ground 25 m behind: reverse out committed, then go around',
    seconds: 20,
    maxReversals: 4,
    maxStalledSec: 3,
    maxShuttle: 1,
    minGap: 0.4,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, -120],
      boxes: [seg([-4, 25], [-4, -20]), ...cylinder([0, -20.5], 15)],
      puppets: [{ id: 'parked_car', size: [4, 8], at: [6, -3], yawDeg: 0, motion: { kind: 'park' } }],
    }),
  },
  {
    name: 'pocket-ghost',
    about: 'pocket-escape, and a chaser-like car sits 0.2 m behind the bumper for 1.5 s, then drives off (its fixed memory marks hug the hull, where the free-space clearing used to start one cell out): the way back is open, reverse out at once instead of sitting out the 15 s memory (hullClear:false = stalled 16 s, left after 23 s)',
    seconds: 25,
    maxReversals: 6,
    maxStalledSec: 5,
    maxShuttle: 2,
    minGap: 0.1,
    maxLeaveSec: 14,
    noGoal: true,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, -120],
      boxes: [seg([-4, 3], [-4, -20]), ...cylinder([0, -20.5], 15)],
      puppets: [
        { id: 'parked_car', size: [4, 8], at: [6, -3], yawDeg: 0, motion: { kind: 'park' } },
        // across the rear (+Z), heading +X (yaw -90): the near flank is 0.5 m behind the 8 m hull; it leaves after 1.5 s
        { id: 'rear_car', size: [2.5, 12], at: [0, 5.45], yawDeg: -90, delay: 1.5, motion: { kind: 'line', speed: 10 } },
      ],
    }),
  },
  {
    name: 'flee-wall-ahead',
    about: 'two homing 25 m/s chasers 40 m behind the car (gap commit), a 300 m long wall 70 m ahead with the goal behind it: the best open-space escape heading (straight ahead, away from the pack) ends at the wall; run along the wall and around it instead of committing a goal behind it (gapWalls off = commits through the wall, reaches the goal after 34.5 s, > 30; opt-in param gapWalls: true)',
    seconds: 30,
    maxReversals: 2,
    minGap: 0.5,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0, speed: 25 },
      goal: [0, -160],
      extraParams: { gapWalls: true },
      boxes: [seg([-150, -70], [150, -70])],
      puppets: [
        { id: 'chaser_a', size: CHASER, at: [-12, 40], yawDeg: 0, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.3 } },
        { id: 'chaser_b', size: CHASER, at: [12, 40], yawDeg: 0, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.3 } },
      ],
    }),
  },
  {
    name: 'flee-aim-wall',
    about: 'two homing chasers behind the car (gap commit), a 60 m wall 55 m ahead on the line to the goal: the straight line to the flee goal is blocked, so the car follows the route carrot around the wall end; time-to-goal criterion (fleeAimLos: false = aims at the flee goal, reaches the goal later than the limit)',
    seconds: 6.4,
    fullBudgetOnly: true,
    maxReversals: 2,
    minGap: 0.5,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0, speed: 20 },
      goal: [0, -150],
      boxes: [seg([-30, -55], [30, -55])],
      puppets: [
        { id: 'chaser_a', size: CHASER, at: [-12, 40], yawDeg: 0, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.3 } },
        { id: 'chaser_b', size: CHASER, at: [12, 40], yawDeg: 0, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.3 } },
      ],
    }),
  },
  {
    name: 'maze-b-rev-door',
    about: 'maze B of the example world: car in cell (107.5, 292.5) facing north (-Z), goal 45 m straight behind it (107.5, 337.5): reverse out through the door past the wall ends (reverse manoeuvre at ~6 m/s). Hard rule: the car never touches a wall (minStaticGap > 0.05)',
    seconds: 12,
    maxReversals: 4,
    maxShuttle: 2,
    minStaticGap: 0.3,
    spec: () => ({ car: { at: [107.5, 292.5], yawDeg: 0 }, goal: [107.5, 337.5], boxes: worldMazeWalls('wall_maze_B'), puppets: []}),
  },
  {
    name: 'gap-entry-wall10',
    about: 'no pursuers, car at 25 m/s along a wall, a 14 m gap in it 90 m ahead, goal behind the gap, wall 10 m beside the car: brake early enough (route speed limit over the braking distance, from the car pose) to turn into the gap instead of driving past it (routeLimitFull: false = takes it at 35 m/s with 44 m/s^2 lateral). Criteria: goal within 12 s, no static contact, peak lateral acceleration <= 30 m/s^2 (full budget: 28, routeLimitFull: false: 44)',
    seconds: 12,
    fullBudgetOnly: true, // eco: the route is 2.5x staler, the car still takes the gap at 32 m/s (lat 33-37)
    maxLatAcc: 30,
    maxReversals: 1,
    spec: () => gapEntry(10),
  },
]
