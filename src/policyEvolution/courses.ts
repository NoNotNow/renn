import { createRng, type Rng } from '@/avEvolution/core/rng'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { cellCentre, generateMaze } from '@/avEvolution/maze/mazeGen'

/**
 * Seeded driving courses for the policy evolution. The car starts at the origin facing -Z; the route runs along -Z.
 *  - `field`: open ground, scattered boxes whose density grows with distance, a wandering goal chain.
 *  - `slalom`: a corridor that narrows with distance, staggered pillars from alternating sides, goals in the gaps.
 *  - `maze`: a seeded 6x6 maze; the car starts in a south-row cell, the goal chain follows the shortest route cell by cell to the exit gate
 *    on the north side (the policy has no map: the goal vector is its only hint which way the route turns).
 */
export type CourseKind = 'field' | 'slalom' | 'maze'

export const COURSE_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze']

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
  /** car heading at the start in degrees (0 = -Z, positive turns left); default 0 */
  startYawDeg?: number
}

export const COURSE_LENGTH = 400
export const COURSE_START: V2 = [0, 0]

const KIND_SALT: Record<CourseKind, number> = { field: 7919, slalom: 104729, maze: 1299709 }

export function courseKey(kind: CourseKind, seed: number): string {
  return `${kind}:${seed}`
}

export function parseCourseKey(key: string): { kind: CourseKind; seed: number } {
  const [kind, s] = key.split(':')
  const seed = Number(s)
  if (!COURSE_KINDS.includes(kind as CourseKind) || !Number.isInteger(seed)) throw new Error(`bad course key: ${key}`)
  return { kind: kind as CourseKind, seed }
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

const MAZE_CELLS = 6
const MAZE_PITCH = 16

function mazeCourse(seed: number, rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'startYawDeg'> {
  const maze = generateMaze({ seed, cols: MAZE_CELLS, rows: MAZE_CELLS, cell: MAZE_PITCH, loopFraction: 0.1, goalDist: 0 })
  const startCol = Math.floor(rng.next() * MAZE_CELLS)
  const startRow = MAZE_CELLS - 1
  const exitRow = 0
  // shortest route over the cell graph (breadth first)
  const key = (c: number, r: number) => r * MAZE_CELLS + c
  const prev = new Map<number, number>([[key(startCol, startRow), -1]])
  const queue: Array<[number, number]> = [[startCol, startRow]]
  for (let qi = 0; qi < queue.length; qi++) {
    const [c, r] = queue[qi]!
    const next: Array<[number, number]> = []
    if (r > 0 && !maze.hWall[r]![c]) next.push([c, r - 1])
    if (r < MAZE_CELLS - 1 && !maze.hWall[r + 1]![c]) next.push([c, r + 1])
    if (c > 0 && !maze.vWall[r]![c]) next.push([c - 1, r])
    if (c < MAZE_CELLS - 1 && !maze.vWall[r]![c + 1]) next.push([c + 1, r])
    for (const [nc, nr] of next) {
      if (prev.has(key(nc, nr))) continue
      prev.set(key(nc, nr), key(c, r))
      queue.push([nc, nr])
    }
  }
  const route: Array<[number, number]> = []
  for (let k = key(maze.exitCol, exitRow); k !== -1; k = prev.get(k)!) route.unshift([k % MAZE_CELLS, Math.floor(k / MAZE_CELLS)])
  // world frame: the start cell centre is the origin
  const [sx, sz] = cellCentre(maze, startCol, startRow)
  const shift = (p: V2): V2 => [p[0] - sx, p[1] - sz]
  const waypoints: V2[] = route.slice(1).map(([c, r]) => shift(cellCentre(maze, c, r)))
  const [ex, ez] = shift(cellCentre(maze, maze.exitCol, exitRow))
  waypoints.push([ex, ez - MAZE_PITCH])
  const first = waypoints[0]!
  const yawDeg = (Math.atan2(-first[0], -first[1]) * 180) / Math.PI
  const boxes: CourseBox[] = maze.walls.map((w) => ({ at: shift(w.at), size: w.size, yawDeg: 0 }))
  return { boxes, waypoints, startYawDeg: Math.round(yawDeg) }
}

export function buildCourse(kind: CourseKind, seed: number): Course {
  const rng = createRng((seed * 2654435761 + KIND_SALT[kind]) >>> 0)
  const body = kind === 'field' ? fieldCourse(seed, rng) : kind === 'slalom' ? slalomCourse(rng) : mazeCourse(seed, rng)
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
export function trainCourseKeys(perKind = 6, kinds: readonly CourseKind[] = COURSE_KINDS): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(courseKey(k, 1 + i))
  return keys
}

export function holdoutCourseKeys(perKind = 6, kinds: readonly CourseKind[] = COURSE_KINDS): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(courseKey(k, 1001 + i))
  return keys
}
