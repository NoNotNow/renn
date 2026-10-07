import { loadLabWorld } from '@/test/avLab/lab'
import type { RennWorld } from '@/types/world'
import { AV_CAR_SOURCE_ID, CAR_START_Y, buildArenaWorldFrom } from '@/avEvolution/maze/arenaWorld'

/**
 * Flat test arena for scripted AV scenarios (see `av-evasion-scenarios.test.ts`, `agent-context/feature-av-lab.md`).
 *
 * The AV car is copied from `public/exampleWorlds/self_hunt_flexible` (entity `AV_CAR_SOURCE_ID`, its pipe binding with all
 * params, the wanderer + car2 actuator stages, the current global library code), so the scenarios test exactly the stack the
 * example world drives. Only three things are scenario specific: the start pose, the goal (the preset wanderer's perimeter
 * is collapsed onto one point, so it hands the stack that fixed non-final goal) and `threatIds` (= the scripted chasers).
 *
 * Chasers are kinematic PUPPETS: their pose is a pure function of time (and, for homing chasers, of the car pose), so a run
 * is a pure function of (scenario, seed).
 */

export type { V2 } from '@/avEvolution/eval/geometry'
import type { V2 } from '@/avEvolution/eval/geometry'
import { headingDir } from '@/avEvolution/eval/geometry'

export const AV_CAR_SOURCE_WORLD = 'self_hunt_flexible'
export { AV_CAR_SOURCE_ID, CAR_START_Y }
export const ARENA_CAR_ID = AV_CAR_SOURCE_ID
export const CAR_SIZE: V2 = [4, 8]

/** Static box. `yawDeg` 0 = `size[0]` along X, `size[1]` along Z. */
export interface ArenaBox {
  at: V2
  size: V2
  yawDeg?: number
  height?: number
}

/** Light dynamic cubes (bouncy clutter). */
export interface ClutterSpec {
  at: V2
  size?: number
  mass?: number
  restitution?: number
}

export type PuppetMotion =
  | { kind: 'park' }
  /** Constant velocity along its heading. */
  | { kind: 'line'; speed: number }
  /** Pure pursuit of the car (target = car position + car velocity * lead), fixed speed, limited turn rate (rad/s). */
  | { kind: 'home'; speed: number; turnRate: number; lead?: number }

export interface PuppetSpec {
  id: string
  /** [width, length] in m. */
  size: V2
  at: V2
  /** Heading in degrees, same convention as the car (0 = facing -Z, positive = left / counter-clockwise from above). */
  yawDeg: number
  motion: PuppetMotion
  /** Seconds the puppet waits at its start pose. */
  delay?: number
  /** false = background traffic: a moving body the car only perceives (not in `threatIds`, no pursuit prediction). Default true. */
  threat?: boolean
}

export interface CarStart {
  at: V2
  yawDeg: number
  /** Initial forward speed (m/s); default 0 (standing start). */
  speed?: number
}

/** Body / actuator overrides of the scenario car (reusability tests: other masses, powers, grip, sizes). Defaults = the example world car (4 x 8, mass 2, friction 0.01, car2 power 2400). */
export interface VehicleSpec {
  /** [width, length] in m: collider and hull. */
  size?: V2
  mass?: number
  friction?: number
  /** car2 `power` (impulse magnitude; acceleration at full command ~ power / mass). */
  power?: number
  /** car2 `lateralGrip`. */
  lateralGrip?: number
  /** Friction of the ground slab (default 1): a low value makes the whole arena icy. */
  groundFriction?: number
}

export interface ArenaSpec {
  car: CarStart
  /** Other body / actuator than the example car. */
  vehicle?: VehicleSpec
  /**
   * Generic car: the pipe binding params are REPLACED by these (plus `threatIds` = the puppets) instead of the example world's hand-tuned car params.
   * Use `{ preset: 'chaser-evasion' }` etc. to test a vehicle with nothing but the preset.
   */
  carParams?: Record<string, unknown>
  /** Merged over the example car's params (e.g. `{ budget: 'eco' }`); ignored with `carParams`. */
  extraParams?: Record<string, unknown>
  goal: V2
  boxes: ArenaBox[]
  puppets: PuppetSpec[]
  clutter?: ClutterSpec[]
}


/** Hull size [width, length] of the scenario car. */
export function carSizeOf(spec: ArenaSpec): V2 {
  return spec.vehicle?.size ?? CAR_SIZE
}

let sourceCache: RennWorld | null = null
function sourceWorld(): RennWorld {
  // loaded once; `loadLabWorld` also upgrades the stage code to the current global library
  if (!sourceCache) {
    sourceCache = loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD })
  }
  return sourceCache
}

export function buildArenaWorld(spec: ArenaSpec): RennWorld {
  const extra = process.env.AV_PARAMS ? JSON.parse(process.env.AV_PARAMS) : {}
  return buildArenaWorldFrom(sourceWorld(), spec, extra)
}

// ---------------------------------------------------------------------------------------------------------------------
// Planar geometry (hull-to-hull gaps, XZ plane)
// ---------------------------------------------------------------------------------------------------------------------

export { rectPoly, polyGap, pointPolyGap, headingDir } from '@/avEvolution/eval/geometry'

// ---------------------------------------------------------------------------------------------------------------------
// Puppet kinematics
// ---------------------------------------------------------------------------------------------------------------------

export interface PuppetState {
  x: number
  z: number
  yaw: number
}

export function initialPuppetState(p: PuppetSpec): PuppetState {
  return { x: p.at[0], z: p.at[1], yaw: (p.yawDeg * Math.PI) / 180 }
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/** Advance a puppet by `dt` at simulation time `t` (before the step). `car` = pose / velocity of the AV. */
export function stepPuppet(p: PuppetSpec, s: PuppetState, t: number, dt: number, car: { pos: V2; vel: V2 }): void {
  if (t < (p.delay ?? 0) || p.motion.kind === 'park') return
  if (p.motion.kind === 'home') {
    const lead = p.motion.lead ?? 0
    const tx = car.pos[0] + car.vel[0] * lead - s.x
    const tz = car.pos[1] + car.vel[1] * lead - s.z
    const want = Math.atan2(-tx, -tz)
    const diff = wrapPi(want - s.yaw)
    const lim = p.motion.turnRate * dt
    s.yaw += Math.max(-lim, Math.min(lim, diff))
  }
  const d = headingDir(s.yaw)
  s.x += d[0] * p.motion.speed * dt
  s.z += d[1] * p.motion.speed * dt
}
