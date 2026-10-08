import { createRng, type Rng } from '@/avEvolution/core/rng'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'

/**
 * Seeded driving courses for the policy evolution. The car starts at the origin facing -Z; the route runs along -Z.
 *  - `field`: open ground, scattered boxes whose density grows with distance, a wandering goal chain.
 *  - `slalom`: a corridor that narrows with distance, staggered pillars from alternating sides, goals in the gaps.
 */
export type CourseKind = 'field' | 'slalom'

export interface CourseBox {
  at: V2
  /** extent across (x) and along (z) the box before yaw */
  size: V2
  yawDeg: number
}

export interface Course {
  key: string
  kind: CourseKind
  seed: number
  boxes: CourseBox[]
  /** goal chain in driving order (the car's start is not included) */
  waypoints: V2[]
  /** route length from the start through the last waypoint (m) */
  length: number
}

export const COURSE_LENGTH = 400
export const COURSE_START: V2 = [0, 0]

const KIND_SALT: Record<CourseKind, number> = { field: 7919, slalom: 104729 }

export function courseKey(kind: CourseKind, seed: number): string {
  return `${kind}:${seed}`
}

export function parseCourseKey(key: string): { kind: CourseKind; seed: number } {
  const [kind, s] = key.split(':')
  const seed = Number(s)
  if ((kind !== 'field' && kind !== 'slalom') || !Number.isInteger(seed)) throw new Error(`bad course key: ${key}`)
  return { kind, seed }
}

const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next()

function fieldCourse(seed: number, rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const waypoints: V2[] = []
  let x = 0
  for (let z = -40; z >= -COURSE_LENGTH; z -= 40) {
    x = Math.max(-25, Math.min(25, x + range(rng, -15, 15)))
    waypoints.push([x, z])
  }
  const boxes: CourseBox[] = []
  for (let z0 = -30; z0 > -COURSE_LENGTH - 20; z0 -= 20) {
    const t = Math.min(1, -z0 / COURSE_LENGTH)
    const count = Math.round(2 + 6 * t)
    for (let i = 0; i < count; i++) {
      const box: CourseBox = {
        at: [range(rng, -35, 35), z0 - rng.next() * 20],
        size: [range(rng, 2, 8), range(rng, 2, 8)],
        yawDeg: range(rng, 0, 180),
      }
      const poly = rectPoly(box.at[0], box.at[1], (box.yawDeg * Math.PI) / 180, box.size[0], box.size[1])
      // keep the start and every goal itself clear (the way between goals is open ground the car has to read)
      if (pointPolyGap(COURSE_START[0], COURSE_START[1], poly) < 14) continue
      if (waypoints.some((w) => pointPolyGap(w[0], w[1], poly) < 6)) continue
      boxes.push(box)
    }
  }
  void seed
  return { boxes, waypoints }
}

function slalomCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const widthAt = (z: number) => 28 - 12 * Math.min(1, -z / COURSE_LENGTH)
  const boxes: CourseBox[] = []
  const waypoints: V2[] = []
  for (let z = 20; z > -COURSE_LENGTH - 20; z -= 40) {
    const w = widthAt(z)
    for (const side of [-1, 1]) boxes.push({ at: [side * (w / 2 + 1), z - 20], size: [2, 40], yawDeg: 0 })
  }
  let side = rng.next() < 0.5 ? -1 : 1
  let z = -45
  while (z > -COURSE_LENGTH) {
    const w = widthAt(z)
    const p = w * range(rng, 0.5, 0.58)
    boxes.push({ at: [side * (w / 2 - p / 2), z], size: [p, 3], yawDeg: 0 })
    waypoints.push([-side * (p / 2), z])
    const next = z - range(rng, 22, 30)
    if (next > -COURSE_LENGTH) waypoints.push([0, (z + next) / 2])
    side = -side
    z = next
  }
  waypoints.push([0, -COURSE_LENGTH])
  return { boxes, waypoints }
}

export function buildCourse(kind: CourseKind, seed: number): Course {
  const rng = createRng((seed * 2654435761 + KIND_SALT[kind]) >>> 0)
  const body = kind === 'field' ? fieldCourse(seed, rng) : slalomCourse(rng)
  let length = 0
  let prev: V2 = COURSE_START
  for (const w of body.waypoints) {
    length += Math.hypot(w[0] - prev[0], w[1] - prev[1])
    prev = w
  }
  return { key: courseKey(kind, seed), kind, seed, length, ...body }
}

/** Arc-length progress of a point along the route polyline (start + waypoints), searched near a segment hint. */
export class RouteProgress {
  private readonly pts: V2[]
  private readonly cum: number[] = [0]
  private hint = 0
  best = 0

  constructor(course: Course) {
    this.pts = [COURSE_START, ...course.waypoints]
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(this.pts[i]![0] - this.pts[i - 1]![0], this.pts[i]![1] - this.pts[i - 1]![1]))
  }

  /** Update with a position, returns the best (monotone) progress so far. */
  update(px: number, pz: number): number {
    const last = this.pts.length - 2
    let bestD = Infinity
    let bestS = this.best
    let bestSeg = this.hint
    for (let i = Math.max(0, this.hint - 1); i <= Math.min(last, this.hint + 2); i++) {
      const a = this.pts[i]!
      const b = this.pts[i + 1]!
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const len2 = dx * dx + dz * dz || 1
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len2))
      const d = Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
      if (d < bestD) {
        bestD = d
        bestS = this.cum[i]! + t * Math.sqrt(len2)
        bestSeg = i
      }
    }
    this.hint = bestSeg
    if (bestS > this.best) this.best = bestS
    return this.best
  }
}

/** Fixed episode sets: TRAIN seeds never appear in HOLDOUT. */
export function trainCourseKeys(perKind = 6): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) keys.push(courseKey('field', 1 + i), courseKey('slalom', 1 + i))
  return keys
}

export function holdoutCourseKeys(perKind = 6): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) keys.push(courseKey('field', 1001 + i), courseKey('slalom', 1001 + i))
  return keys
}
