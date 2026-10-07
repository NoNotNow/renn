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

export type V2 = [number, number]

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

/** Direction vector of a heading (0 = -Z; positive yaw turns left). */
export function headingDir(yawRad: number): V2 {
  return [-Math.sin(yawRad), -Math.cos(yawRad)]
}

export function buildArenaWorld(spec: ArenaSpec): RennWorld {
  const extra = process.env.AV_PARAMS ? JSON.parse(process.env.AV_PARAMS) : {}
  return buildArenaWorldFrom(sourceWorld(), spec, extra)
}

// ---------------------------------------------------------------------------------------------------------------------
// Planar geometry (hull-to-hull gaps, XZ plane)
// ---------------------------------------------------------------------------------------------------------------------

/** Corners of a rectangle: `w` along its side axis, `l` along its heading (0 = -Z). */
export function rectPoly(cx: number, cz: number, yawRad: number, w: number, l: number): V2[] {
  const f = headingDir(yawRad)
  const s: V2 = [Math.cos(yawRad), -Math.sin(yawRad)]
  const out: V2[] = []
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
    out.push([cx + (a * w * s[0]) / 2 + (b * l * f[0]) / 2, cz + (a * w * s[1]) / 2 + (b * l * f[1]) / 2])
  }
  return out
}

function overlapSat(a: V2[], b: V2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!
      const q = poly[(i + 1) % poly.length]!
      const nx = -(q[1] - p[1])
      const nz = q[0] - p[0]
      let aMin = Infinity
      let aMax = -Infinity
      let bMin = Infinity
      let bMax = -Infinity
      for (const v of a) {
        const d = v[0] * nx + v[1] * nz
        aMin = Math.min(aMin, d)
        aMax = Math.max(aMax, d)
      }
      for (const v of b) {
        const d = v[0] * nx + v[1] * nz
        bMin = Math.min(bMin, d)
        bMax = Math.max(bMax, d)
      }
      if (aMax < bMin || bMax < aMin) return false
    }
  }
  return true
}

function pointSegDist(px: number, pz: number, a: V2, b: V2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
}

/** Distance between two convex polygons (0 when they overlap). */
export function polyGap(a: V2[], b: V2[]): number {
  if (overlapSat(a, b)) return 0
  let best = Infinity
  for (const [p, q] of [[a, b], [b, a]] as const) {
    for (const v of p) for (let i = 0; i < q.length; i++) best = Math.min(best, pointSegDist(v[0], v[1], q[i]!, q[(i + 1) % q.length]!))
  }
  return best
}

/** Distance from a point to a convex polygon (0 inside). */
export function pointPolyGap(px: number, pz: number, poly: V2[]): number {
  const tiny: V2[] = [[px - 1e-3, pz - 1e-3], [px + 1e-3, pz - 1e-3], [px + 1e-3, pz + 1e-3], [px - 1e-3, pz + 1e-3]]
  return polyGap(tiny, poly)
}

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
