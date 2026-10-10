import { createRng, type Rng } from '@/avEvolution/core/rng'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { cellCentre, generateMaze } from '@/avEvolution/maze/mazeGen'

/**
 * Seeded driving courses for the policy evolution. The car starts at the origin facing -Z; the route runs along -Z.
 *  - `field`: a closed 38 m wide track (side walls, back and end wall) with scattered boxes whose density grows with distance and a goal
 *    chain near the middle. The track is closed on purpose: an open field lets the car drive around the whole obstacle field.
 *  - `slalom`: a corridor that narrows with distance, staggered pillars from alternating sides, goals in the gaps.
 *  - `maze`: a seeded 6x6 maze; the car starts in a south-row cell, the goal chain follows the shortest route cell by cell to the exit gate
 *    on the north side (the policy has no map: the goal vector is its only hint which way the route turns).
 */
export type CourseKind = 'field' | 'slalom' | 'maze' | 'crowd' | 'free' | 'bay' | 'corridor'

/** The v1 kinds (default sets of the v1 tools). `crowd` is a v2 chain setup kind, see CHAIN_KINDS. */
export const COURSE_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze']
/** Setup kinds of the v2 command-chain training (src/policyEvolution/chains.ts). */
export const CHAIN_KINDS: readonly CourseKind[] = ['field', 'slalom', 'maze', 'crowd']
/** v3 setup kinds: `free` (big closed arena, direction chains with reversals), `bay` (dead-end bays), `corridor` (too narrow to U-turn); see spec-command-chains.md, section v3. */
export const REVERSAL_KINDS: readonly CourseKind[] = ['bay', 'corridor']
export const V3_NEW_KINDS: readonly CourseKind[] = ['free', ...REVERSAL_KINDS]
/** all v3 kinds in report order: the new free-track / reversal kinds and the v2 obstacle kinds */
export const V3_KINDS: readonly CourseKind[] = [...V3_NEW_KINDS, ...CHAIN_KINDS]
export const isV3NewKind = (k: CourseKind) => V3_NEW_KINDS.includes(k)

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
  /** car start position; default COURSE_START. Only start variants (key suffix `~n`, n >= 1) move it */
  startAt?: V2
  /** start variant: 0 = canonical start, n >= 1 = seeded random start offset and heading */
  variant: number
  /** field difficulty 0..1 (1 = full density / box size, the default); only `field` reacts to it */
  difficulty: number
  /** v3 kinds (free / bay / corridor): the seeded layout numbers the chain generator needs (see `bayCourse`, `corridorCourse`) */
  layout?: Record<string, number>
}

export const COURSE_LENGTH = 400
export const COURSE_START: V2 = [0, 0]

const KIND_SALT: Record<CourseKind, number> = { field: 7919, slalom: 104729, maze: 1299709, crowd: 15485863, free: 32452843, bay: 49979687, corridor: 67867967 }

/**
 * `kind:seed` = canonical start; `kind:seed~n` = the same course with the n-th seeded random start pose (offset + heading);
 * `kind:seed~n@d` additionally sets the field difficulty d (0..1, curriculum; omitted = 1 = full).
 */
export function courseKey(kind: CourseKind, seed: number, variant = 0, difficulty = 1): string {
  return `${kind}:${seed}${variant > 0 ? `~${variant}` : ''}${difficulty < 1 ? `@${difficulty}` : ''}`
}

export function withVariant(key: string, variant: number): string {
  const { kind, seed, difficulty } = parseCourseKey(key)
  return courseKey(kind, seed, variant, difficulty)
}

export function withDifficulty(key: string, difficulty: number): string {
  const { kind, seed, variant } = parseCourseKey(key)
  return courseKey(kind, seed, variant, difficulty)
}

export function parseCourseKey(key: string): { kind: CourseKind; seed: number; variant: number; difficulty: number } {
  const [rest, d] = key.split('@')
  const [head, v] = rest!.split('~')
  const [kind, s] = head!.split(':')
  const seed = Number(s)
  const variant = v === undefined ? 0 : Number(v)
  const difficulty = d === undefined ? 1 : Number(d)
  if (!ALL_KINDS.includes(kind as CourseKind) || !Number.isInteger(seed) || !Number.isInteger(variant) || variant < 0 || !(difficulty >= 0 && difficulty <= 1)) throw new Error(`bad course key: ${key}`)
  return { kind: kind as CourseKind, seed, variant, difficulty }
}

const ALL_KINDS: readonly CourseKind[] = V3_KINDS

const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next()

/** half-width of the field track: side walls stand at +-FIELD_HALF_WIDTH (the field is a closed track, it cannot be bypassed) */
export const FIELD_HALF_WIDTH = 19

function fieldCourse(rng: Rng, difficulty: number): Pick<Course, 'boxes' | 'waypoints'> {
  // curriculum: difficulty 1 = the full course (identical to before), 0 = an empty track (walls and goals only), in between fewer and smaller boxes
  const density = difficulty
  const maxSize = 4 + 4 * difficulty
  const waypoints: V2[] = []
  let x = 0
  for (let z = -40; z >= -COURSE_LENGTH; z -= 40) {
    x = Math.max(-8, Math.min(8, x + range(rng, -8, 8)))
    waypoints.push([x, z])
  }
  const boxes: CourseBox[] = []
  // closed track: side walls, a back wall behind the start and an end wall behind the finish
  for (let z = 20; z > -COURSE_LENGTH - 40; z -= 40) for (const side of [-1, 1]) boxes.push({ at: [side * FIELD_HALF_WIDTH, z - 20], size: [2, 40], yawDeg: 0 })
  boxes.push({ at: [0, 24], size: [2 * FIELD_HALF_WIDTH + 2, 2], yawDeg: 0 })
  boxes.push({ at: [0, -COURSE_LENGTH - 24], size: [2 * FIELD_HALF_WIDTH + 2, 2], yawDeg: 0 })
  for (let z0 = -30; z0 > -COURSE_LENGTH - 20; z0 -= 20) {
    const t = Math.min(1, -z0 / COURSE_LENGTH)
    const count = Math.round((2.5 + 6.5 * t) * density)
    for (let i = 0; i < count; i++) {
      const box: CourseBox = {
        at: [range(rng, -(FIELD_HALF_WIDTH - 4), FIELD_HALF_WIDTH - 4), z0 - rng.next() * 20],
        size: [range(rng, 2, maxSize), range(rng, 2, maxSize)],
        yawDeg: range(rng, 0, 180),
      }
      const poly = rectPoly(box.at[0], box.at[1], (box.yawDeg * Math.PI) / 180, box.size[0], box.size[1])
      // keep the start and every goal itself clear (the way between goals is ground the car has to read)
      if (pointPolyGap(COURSE_START[0], COURSE_START[1], poly) < 14) continue
      if (waypoints.some((w) => pointPolyGap(w[0], w[1], poly) < 6)) continue
      boxes.push(box)
    }
  }
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

/** half-width of the crowd track: side walls stand at +-CROWD_HALF_WIDTH (inner face 1 m inside, so ~42 m of drivable width) */
export const CROWD_HALF_WIDTH = 22
const CROWD_SLOT = 4.6
const CROWD_SLOTS = 9

/**
 * `crowd` (v2 setup kind, static only): a closed ~40 m wide track with rows of parked 4 x 8 cars across it. Every row leaves 2 gaps
 * (3-4 empty parking slots wide, 14.4 / 19 m) at random places, aisles between the rows carry a few clutter boxes. The way through is a
 * different sequence of gaps per setup, and several gap sequences exist.
 */
function crowdCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const hw = CROWD_HALF_WIDTH
  const boxes: CourseBox[] = []
  for (let z = 20; z > -COURSE_LENGTH - 40; z -= 40) for (const side of [-1, 1]) boxes.push({ at: [side * hw, z - 20], size: [2, 40], yawDeg: 0 })
  boxes.push({ at: [0, 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  boxes.push({ at: [0, -COURSE_LENGTH - 24], size: [2 * hw + 2, 2], yawDeg: 0 })
  const rowZ: number[] = []
  for (let z = -50; z > -COURSE_LENGTH + 10; z -= range(rng, 28, 36)) rowZ.push(z)
  for (const z of rowZ) {
    const gap = new Array<boolean>(CROWD_SLOTS).fill(false)
    const runs = 2
    for (let r = 0; r < runs; r++) {
      const len = 3 + Math.floor(rng.next() * 2)
      for (let attempt = 0; attempt < 20; attempt++) {
        const s0 = Math.floor(rng.next() * (CROWD_SLOTS - len + 1))
        let ok = true
        for (let i = Math.max(0, s0 - 1); i <= Math.min(CROWD_SLOTS - 1, s0 + len); i++) if (gap[i]) ok = false
        if (!ok) continue
        for (let i = s0; i < s0 + len; i++) gap[i] = true
        break
      }
    }
    for (let i = 0; i < CROWD_SLOTS; i++) {
      if (gap[i]) continue
      boxes.push({ at: [(i - (CROWD_SLOTS - 1) / 2) * CROWD_SLOT, z + range(rng, -1.5, 1.5)], size: [4, 8], yawDeg: range(rng, -3, 3) })
    }
  }
  // clutter in the aisles (central part only, so it never plugs a row gap)
  const edges = [-20, ...rowZ, -COURSE_LENGTH]
  for (let a = 0; a + 1 < edges.length; a++) {
    const zc = (edges[a]! + edges[a + 1]!) / 2
    if (edges[a]! - edges[a + 1]! < 20) continue
    const count = Math.floor(rng.next() * 4)
    for (let i = 0; i < count; i++) boxes.push({ at: [range(rng, -(hw - 6), hw - 6), zc + range(rng, -4, 4)], size: [range(rng, 1.5, 3), range(rng, 1.5, 3)], yawDeg: range(rng, 0, 180) })
  }
  return { boxes, waypoints: [[0, -COURSE_LENGTH]] }
}

/**
 * v2 `slalom` geometry (chain setups): the same narrowing corridor (44 -> 34 m), but the obstacles are central islands (20-26 % of the width, slightly offset
 * to alternating sides) that can be passed on BOTH sides, so several routes through the corridor exist. v1 `slalomCourse` is untouched.
 */
function slalomIslandsCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints'> {
  const widthAt = (z: number) => 44 - 10 * Math.min(1, -z / COURSE_LENGTH)
  const boxes: CourseBox[] = []
  const waypoints: V2[] = []
  for (let z = 20; z > -COURSE_LENGTH - 20; z -= 40) {
    const w = widthAt(z)
    for (const side of [-1, 1]) boxes.push({ at: [side * (w / 2 + 1), z - 20], size: [2, 40], yawDeg: 0 })
  }
  let side = rng.next() < 0.5 ? -1 : 1
  for (let z = -45; z > -COURSE_LENGTH; z -= range(rng, 24, 32)) {
    const w = widthAt(z)
    const p = w * range(rng, 0.2, 0.26)
    const c = side * w * range(rng, 0.04, 0.1)
    boxes.push({ at: [c, z], size: [p, 3], yawDeg: 0 })
    waypoints.push([(-side * (w / 2) + c - (side * p) / 2) / 2, z])
    side = -side
  }
  waypoints.push([0, -COURSE_LENGTH])
  return { boxes, waypoints }
}

/** half size of the free arena: walls stand at +-FREE_HALF (inner faces), nothing inside */
export const FREE_HALF = 100

/** `free` (v3 stage A): a big closed empty arena; the car starts in the middle. Chains are seeded direction chains (v3Chains.ts). */
function freeCourse(): Pick<Course, 'boxes' | 'waypoints'> {
  const h = FREE_HALF
  const boxes: CourseBox[] = [
    { at: [0, -(h + 1)], size: [2 * h + 4, 2], yawDeg: 0 },
    { at: [0, h + 1], size: [2 * h + 4, 2], yawDeg: 0 },
    { at: [-(h + 1), 0], size: [2, 2 * h + 4], yawDeg: 0 },
    { at: [h + 1, 0], size: [2, 2 * h + 4], yawDeg: 0 },
  ]
  return { boxes, waypoints: [] }
}

/** the car's turning circle has a radius of ~10 m (steering 0.1 x wheel angle 1 per metre), so a pocket narrower than ~14 m cannot be turned in */
export const BAY_HALL_HALF = 38
export const BAY_HALL_BACK_Z = 24
export const BAY_HALL_FRONT_Z = -62

/**
 * `bay` (v3 reversal setup): a hall (76 x 86 m, the car starts at the origin facing -Z) whose front wall has one opening, a dead-end bay 12.5-14 m wide and
 * 20-32 m deep: too narrow for a U-turn (or a three-point turn), so a car that drove in has to reverse out. layout: bx (bay centre x), bw, bd (depth).
 */
function bayCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const hx = BAY_HALL_HALF
  const zb = BAY_HALL_BACK_Z
  const zf = BAY_HALL_FRONT_Z
  const bw = range(rng, 12.5, 14)
  const bd = range(rng, 20, 32)
  const bx = range(rng, -12, 12)
  const boxes: CourseBox[] = []
  const t = 2
  boxes.push({ at: [0, zb + t / 2], size: [2 * hx + 2 * t, t], yawDeg: 0 })
  for (const side of [-1, 1]) boxes.push({ at: [side * (hx + t / 2), (zb + zf) / 2], size: [t, zb - zf + t], yawDeg: 0 })
  // front wall left and right of the opening
  const left0 = -hx - t
  const left1 = bx - bw / 2
  boxes.push({ at: [(left0 + left1) / 2, zf - t / 2], size: [left1 - left0, t], yawDeg: 0 })
  const right0 = bx + bw / 2
  const right1 = hx + t
  boxes.push({ at: [(right0 + right1) / 2, zf - t / 2], size: [right1 - right0, t], yawDeg: 0 })
  // pocket: side walls from the front wall plane to the back wall
  for (const side of [-1, 1]) boxes.push({ at: [bx + side * (bw / 2 + t / 2), zf - t - bd / 2], size: [t, bd], yawDeg: 0 })
  boxes.push({ at: [bx, zf - t - bd - t / 2], size: [bw + 2 * t, t], yawDeg: 0 })
  return { boxes, waypoints: [], layout: { bx, bw, bd, zFront: zf - t, hx, zBack: zb } }
}

/**
 * `corridor` (v3 reversal setup): a straight closed corridor 12.5-14 m wide, 22-34 m behind the start and 70-110 m ahead of it, dead ends on both sides:
 * no U-turn or three-point turn is possible, every direction change has to be driven in reverse. layout: cw (width), rear (m behind the start), ahead (m ahead).
 */
function corridorCourse(rng: Rng): Pick<Course, 'boxes' | 'waypoints' | 'layout'> {
  const cw = range(rng, 12.5, 14)
  const rear = range(rng, 22, 34)
  const ahead = range(rng, 70, 110)
  const t = 2
  const boxes: CourseBox[] = []
  const len = rear + ahead
  for (const side of [-1, 1]) boxes.push({ at: [side * (cw / 2 + t / 2), (rear - ahead) / 2], size: [t, len + 2 * t], yawDeg: 0 })
  boxes.push({ at: [0, rear + t / 2], size: [cw, t], yawDeg: 0 })
  boxes.push({ at: [0, -ahead - t / 2], size: [cw, t], yawDeg: 0 })
  return { boxes, waypoints: [], layout: { cw, rear, ahead } }
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

/** Start jitter per kind: lateral (x) and longitudinal (z) offset in m, heading in degrees. Maze corridors are narrow (15 m), so small. */
const START_JITTER: Record<CourseKind, { x: number; z: number; yawDeg: number }> = {
  field: { x: 6, z: 0, yawDeg: 25 },
  slalom: { x: 5, z: 0, yawDeg: 25 },
  maze: { x: 2, z: 2, yawDeg: 20 },
  crowd: { x: 6, z: 0, yawDeg: 25 },
  free: { x: 15, z: 15, yawDeg: 90 },
  bay: { x: 3, z: 3, yawDeg: 12 },
  corridor: { x: 2, z: 3, yawDeg: 10 },
}

/** Seeded random start pose for variant >= 1; keeps the car clear of every wall / box (falls back to the canonical start). */
function jitterStart(course: Course): Course {
  const j = START_JITTER[course.kind]
  const rng = createRng((course.seed * 2246822519 + KIND_SALT[course.kind] * 3266489917 + course.variant * 668265263) >>> 0)
  const baseYaw = course.startYawDeg ?? 0
  for (let attempt = 0; attempt < 12; attempt++) {
    const at: V2 = [COURSE_START[0] + range(rng, -j.x, j.x), COURSE_START[1] + range(rng, -j.z, j.z)]
    const yaw = baseYaw + range(rng, -j.yawDeg, j.yawDeg)
    const hull = rectPoly(at[0], at[1], (yaw * Math.PI) / 180, 4, 8)
    const clear = course.boxes.every((b) => polyGap(hull, rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])) > 0.5)
    if (clear) return { ...course, startAt: [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100], startYawDeg: Math.round(yaw * 10) / 10 }
  }
  return course
}

export function buildCourse(kind: CourseKind, seed: number, variant = 0, difficulty = 1, chainSetup = false): Course {
  const rng = createRng((seed * 2654435761 + KIND_SALT[kind]) >>> 0)
  const body: Pick<Course, 'boxes' | 'waypoints'> & Partial<Pick<Course, 'layout' | 'startYawDeg'>> =
    kind === 'field'
      ? fieldCourse(rng, difficulty)
      : kind === 'slalom'
        ? chainSetup
          ? slalomIslandsCourse(rng)
          : slalomCourse(rng)
        : kind === 'crowd'
          ? crowdCourse(rng)
          : kind === 'free'
            ? freeCourse()
            : kind === 'bay'
              ? bayCourse(rng)
              : kind === 'corridor'
                ? corridorCourse(rng)
                : mazeCourse(seed, rng)
  let length = 0
  let prev: V2 = COURSE_START
  for (const w of body.waypoints) {
    length += Math.hypot(w[0] - prev[0], w[1] - prev[1])
    prev = w
  }
  const course: Course = { key: courseKey(kind, seed, variant, difficulty), kind, seed, length, variant, difficulty, ...body }
  return variant > 0 ? jitterStart(course) : course
}

/** Geometry of a v2 chain setup by setup key (`slalom` uses the island geometry, the other kinds equal `buildCourse`). */
export function buildSetupCourse(setupKey: string): Course {
  const { kind, seed, variant, difficulty } = parseCourseKey(setupKey)
  return buildCourse(kind, seed, variant, difficulty, true)
}

/** Arc-length progress of a point along the route polyline (start + waypoints), searched near a segment hint. */
export class RouteProgress {
  private readonly pts: V2[]
  private readonly cum: number[] = [0]
  private hint = 0
  best = 0
  /** distance of the last position to the route polyline (m) */
  lastDist = 0

  /** `course`: the route is the start plus its waypoints; a point array is used as the polyline as is (v2 command chains). */
  constructor(course: Course | V2[]) {
    this.pts = Array.isArray(course) ? course : [COURSE_START, ...course.waypoints]
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
    this.lastDist = bestD
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

/** HOLDOUT uses start variant 1 (random start pose), TRAIN keys are canonical; training generations add their own variants. */
export function holdoutCourseKeys(perKind = 6, kinds: readonly CourseKind[] = COURSE_KINDS, variant = 1): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(courseKey(k, 1001 + i, variant))
  return keys
}
