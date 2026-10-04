/* eslint-disable @typescript-eslint/no-explicit-any -- raw world JSON surgery */
import { loadLabWorld } from '@/test/avLab/lab'
import type { RennWorld } from '@/types/world'

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
export const AV_CAR_SOURCE_ID = 'entity_1779823253285_brtkx1p'
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
}

export interface CarStart {
  at: V2
  yawDeg: number
  /** Initial forward speed (m/s); default 0 (standing start). */
  speed?: number
}

export interface ArenaSpec {
  car: CarStart
  goal: V2
  boxes: ArenaBox[]
  puppets: PuppetSpec[]
  clutter?: ClutterSpec[]
}

export const CAR_START_Y = 0.494

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
  const src = JSON.parse(JSON.stringify(sourceWorld())) as RennWorld & Record<string, any>
  const car = (src.entities as any[]).find((e) => e.id === AV_CAR_SOURCE_ID)
  if (!car) throw new Error(`${AV_CAR_SOURCE_ID} missing in ${AV_CAR_SOURCE_WORLD}`)
  const rad = (d: number) => (d * Math.PI) / 180
  // keep body / shape / stage list / pipe binding; drop render-only and scripting leftovers
  for (const k of ['model', 'modelScale', 'modelRotation', 'avatar', 'scripts']) delete car[k]
  car.position = [spec.car.at[0], CAR_START_Y, spec.car.at[1]]
  car.rotation = [0, rad(spec.car.yawDeg), 0]
  const binding = car.transformerPipeStack[0]
  binding.params = { ...binding.params, threatIds: spec.puppets.map((p) => p.id) }
  // goal: collapse the wanderer perimeter onto the goal point
  const wander = src.transformers![`${AV_CAR_SOURCE_ID}_tf10`] as any
  if (!wander || wander.type !== 'wanderer') throw new Error('wanderer stage of the AV car not found')
  wander.params = { ...wander.params, perimeter: { center: [spec.goal[0], 0, spec.goal[1]], halfExtents: [0, 0, 0] } }

  const entities: any[] = [{ id: 'ground', name: 'Ground', bodyType: 'static', shape: { type: 'plane' }, position: [0, 0, 0], rotation: [0, 0, 0], friction: 1 }, car]
  spec.boxes.forEach((b, i) => {
    const h = b.height ?? 6
    entities.push({
      id: `arena_box_${i}`,
      name: `Box ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: b.size[0], height: h, depth: b.size[1] },
      position: [b.at[0], h / 2, b.at[1]],
      rotation: [0, rad(b.yawDeg ?? 0), 0],
      friction: 0.5,
    })
  })
  for (const p of spec.puppets) {
    entities.push({
      id: p.id,
      name: p.id,
      bodyType: 'kinematic',
      shape: { type: 'box', width: p.size[0], height: 1.5, depth: p.size[1] },
      position: [p.at[0], 0.75, p.at[1]],
      rotation: [0, rad(p.yawDeg), 0],
    })
  }
  ;(spec.clutter ?? []).forEach((c, i) => {
    const s = c.size ?? 1.2
    entities.push({
      id: `clutter_${i}`,
      name: `Clutter ${i}`,
      bodyType: 'dynamic',
      shape: { type: 'box', width: s, height: s, depth: s },
      position: [c.at[0], s / 2 + 0.02, c.at[1]],
      rotation: [0, 0, 0],
      mass: c.mass ?? 0.3,
      restitution: c.restitution ?? 0.8,
      friction: 0.4,
    })
  })
  src.entities = entities as RennWorld['entities']
  src.scripts = {}
  src.groups = []
  return src
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
