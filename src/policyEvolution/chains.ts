import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { createRng, type Rng } from '@/avEvolution/core/rng'
import { buildSetupCourse, CHAIN_KINDS, COURSE_LENGTH, COURSE_START, courseKey, isV3NewKind, parseCourseKey, V3_KINDS, type Course, type CourseKind } from './courses'
import { generateV3Chains } from './v3Chains'

/**
 * Command chains (v2, see agent-context/spec-command-chains.md). A SETUP is a closed course geometry + start pose (setup key
 * `kind:seed[~variant][@difficulty]`); a CHAIN is an ordered waypoint list from the start to an end region through that setup. Every chain
 * is one episode (`<setupKey>#<chainIndex>`): the policy is commanded along that chain only, progress is counted along that chain only.
 *
 * Generation (deterministic from the setup key): occupancy grid (CELL m) with obstacles inflated by car half width + margin, several END
 * targets per kind, A* to each end, alternative routes by penalising cells near already accepted chains (+ seeded cost noise),
 * string-pulling with line of sight, resampling to waypoints every <= RESAMPLE_M. A chain is accepted only if it is clear of the inflated
 * obstacles (exact geometry), not longer than MAX_DETOUR x the shortest path to its end and at least MIN_HAUSDORFF_M (symmetric Hausdorff
 * distance) away from every accepted chain. A setup with fewer than 2 accepted chains is rejected (`acceptedSetupKeys` skips such seeds).
 */

export const CHAINS_PER_SETUP = 4
/**
 * Field difficulty of the TRAIN / HOLDOUT chain setups. The full v1 field (difficulty 1) leaves no corridor with 2 m + 1.5 m clearance on
 * any of 20 sampled seeds (0 accepted), 0.6 gives 8 / 20, 0.3 gives 19 / 20 (at the old 1.5 m margin); so chain setups use a fixed intermediate field difficulty and
 * the curriculum never raises the field above it.
 */
export const CHAIN_FIELD_DIFFICULTY = 0.3
export const MIN_CHAINS = 2
export const CAR_HALF_WIDTH = 2
/**
 * Inflation margins tried in order (m, added to the car half width; a tighter margin is the fallback for narrow setups) and the exact
 * clearance every accepted chain must keep (m). Open kinds need 2.5 m of margin: with 1.5 a pure-pursuit follower crashed at every second
 * corner (the 4 x 8 m hull swings wide). The maze corridors (15 m wide) leave no room for that, and there the follower fails with
 * the wider margin, which squeezes the chain into a narrow band so that every corner is a sharp one.
 */
export const CLEARANCE: Record<CourseKind, { margins: number[]; min: number }> = {
  // v3 kinds (free / bay / corridor) lay their chains by hand (v3Chains.ts) and do not use the grid planner
  free: { margins: [2.5], min: CAR_HALF_WIDTH + 0.5 },
  bay: { margins: [2.5], min: CAR_HALF_WIDTH + 0.5 },
  corridor: { margins: [2.5], min: CAR_HALF_WIDTH + 0.5 },
  field: { margins: [2.5, 1.5], min: CAR_HALF_WIDTH + 0.5 },
  slalom: { margins: [2.5, 1.5], min: CAR_HALF_WIDTH + 0.5 },
  crowd: { margins: [2.5, 1.5], min: CAR_HALF_WIDTH + 0.5 },
  maze: { margins: [1.5, 1], min: CAR_HALF_WIDTH + 0.25 },
}
/** smallest clearance any chain keeps (all kinds) */
export const MIN_CLEARANCE = CAR_HALF_WIDTH + 0.25
export const MIN_HAUSDORFF_M = 10
export const MAX_DETOUR = 1.8
export const RESAMPLE_M = 10
const CELL = 1

export interface Chain {
  /** waypoints from the start pose (first point) to the end (last point) */
  points: V2[]
  /** polyline length (m) */
  length: number
  /** index of the end target this chain was generated for */
  endIndex: number
  /** v3: point indices where the legs end (leg k runs from the previous end, 0 for the first, to this point; see legs.ts); undefined = one leg */
  legEnds?: number[]
  /** v3: offcourse tolerance (m) of this chain's episodes; undefined = OFF_CHAIN_M */
  offM?: number
}

// --- keys ---------------------------------------------------------------------------------------------------------------------------

/**
 * Episode key `<setupKey>#<i>` (v2: projection progress, stall = no progress) or `<setupKey>#<i>v3` (v3: leg-wise progress, stand-still stall rule, reverse
 * usage reported; works for every setup kind, the v2 kinds are then driven as one-leg chains).
 */
export function chainEpisodeKey(setupKey: string, chainIndex: number, v3 = false): string {
  return `${setupKey}#${chainIndex}${v3 ? 'v3' : ''}`
}

/** `setupKey#i[v3]` -> parts; a plain setup key gives chainIndex -1 */
export function parseChainEpisodeKey(key: string): { setupKey: string; chainIndex: number; v3?: true } {
  const i = key.indexOf('#')
  if (i < 0) return { setupKey: key, chainIndex: -1 }
  const m = /^(\d+)(v3)?$/.exec(key.slice(i + 1))
  if (!m) throw new Error(`bad chain episode key: ${key}`)
  return { setupKey: key.slice(0, i), chainIndex: Number(m[1]), ...(m[2] ? { v3: true as const } : {}) }
}

export const isChainEpisodeKey = (key: string) => key.includes('#')

// --- geometry helpers ---------------------------------------------------------------------------------------------------------------

/** distance from a point to a (rotated) course box, 0 inside */
function boxDist(px: number, pz: number, b: Course['boxes'][number]): number {
  const yaw = (b.yawDeg * Math.PI) / 180
  const dx = px - b.at[0]
  const dz = pz - b.at[1]
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  const lz = -dx * Math.sin(yaw) - dz * Math.cos(yaw)
  return Math.hypot(Math.max(Math.abs(lx) - b.size[0] / 2, 0), Math.max(Math.abs(lz) - b.size[1] / 2, 0))
}

function pointSegDist(px: number, pz: number, a: V2, b: V2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len2))
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
}

function segCross(a: V2, b: V2, c: V2, d: V2): boolean {
  const o = (p: V2, q: V2, r: V2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/** distance between a segment and a convex polygon (0 when they touch / overlap) */
function segPolyDist(a: V2, b: V2, poly: V2[]): number {
  let best = Math.min(pointPolyGap(a[0], a[1], poly), pointPolyGap(b[0], b[1], poly))
  if (best <= 0) return 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    if (segCross(a, b, p, q)) return 0
    best = Math.min(best, pointSegDist(p[0], p[1], a, b), pointSegDist(q[0], q[1], a, b), pointSegDist(a[0], a[1], p, q), pointSegDist(b[0], b[1], p, q))
  }
  return best
}

/** Smallest exact distance (m) between the polyline and any box of the course. */
export function chainClearance(boxes: Course['boxes'], points: V2[]): number {
  let best = Infinity
  const polys = boxes.map((b) => ({ b, poly: rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]), r: Math.hypot(b.size[0], b.size[1]) / 2 }))
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const mx = (a[0] + b[0]) / 2
    const mz = (a[1] + b[1]) / 2
    const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2
    for (const o of polys) {
      if (Math.hypot(o.b.at[0] - mx, o.b.at[1] - mz) - o.r - half > best) continue
      best = Math.min(best, segPolyDist(a, b, o.poly))
    }
  }
  return best
}

export function polylineLength(points: V2[]): number {
  let l = 0
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  return l
}

function densify(points: V2[], step: number): V2[] {
  const out: V2[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/** Largest distance of any point of `from` to the polyline `to` (m). */
export function directedHausdorff(from: V2[], to: V2[]): number {
  let worst = 0
  for (const p of from) {
    let best = Infinity
    if (to.length === 1) best = Math.hypot(p[0] - to[0]![0], p[1] - to[0]![1])
    for (let j = 0; j + 1 < to.length; j++) best = Math.min(best, pointSegDist(p[0], p[1], to[j]!, to[j + 1]!))
    worst = Math.max(worst, best)
  }
  return worst
}

/** Symmetric Hausdorff distance between two polylines (m): the largest distance of any point of one to the other. */
export function hausdorff(a: V2[], b: V2[]): number {
  return Math.max(directedHausdorff(densify(a, 1), b), directedHausdorff(densify(b, 1), a))
}

// --- occupancy grid -----------------------------------------------------------------------------------------------------------------

interface Grid {
  x0: number
  z0: number
  nx: number
  nz: number
  /** distance from the cell centre to the nearest obstacle (capped) */
  clear: Float32Array
  inflate: number
  start: V2
}

const CLEAR_CAP = 30

function buildGrid(course: Course, inflate: number, start: V2): Grid {
  let minX = start[0]
  let maxX = start[0]
  let minZ = start[1]
  let maxZ = start[1]
  for (const b of course.boxes) {
    const r = Math.hypot(b.size[0], b.size[1]) / 2
    minX = Math.min(minX, b.at[0] - r)
    maxX = Math.max(maxX, b.at[0] + r)
    minZ = Math.min(minZ, b.at[1] - r)
    maxZ = Math.max(maxZ, b.at[1] + r)
  }
  const x0 = Math.floor(minX)
  const z0 = Math.floor(minZ)
  const nx = Math.ceil((maxX - x0) / CELL) + 1
  const nz = Math.ceil((maxZ - z0) / CELL) + 1
  const clear = new Float32Array(nx * nz).fill(CLEAR_CAP)
  for (const b of course.boxes) {
    const r = Math.hypot(b.size[0], b.size[1]) / 2 + inflate + 2
    const i0 = Math.max(0, Math.floor((b.at[0] - r - x0) / CELL))
    const i1 = Math.min(nx - 1, Math.ceil((b.at[0] + r - x0) / CELL))
    const j0 = Math.max(0, Math.floor((b.at[1] - r - z0) / CELL))
    const j1 = Math.min(nz - 1, Math.ceil((b.at[1] + r - z0) / CELL))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = boxDist(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL, b)
        const k = j * nx + i
        if (d < clear[k]!) clear[k] = d
      }
    }
  }
  return { x0, z0, nx, nz, clear, inflate, start }
}

const gridCache = new Map<string, Grid>()

function cellOf(g: Grid, p: V2): [number, number] {
  return [Math.min(g.nx - 1, Math.max(0, Math.floor((p[0] - g.x0) / CELL))), Math.min(g.nz - 1, Math.max(0, Math.floor((p[1] - g.z0) / CELL)))]
}
const centre = (g: Grid, i: number, j: number): V2 => [g.x0 + (i + 0.5) * CELL, g.z0 + (j + 0.5) * CELL]

function isFree(g: Grid, i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return false
  if (g.clear[j * g.nx + i]! >= g.inflate) return true
  const c = centre(g, i, j)
  return Math.hypot(c[0] - g.start[0], c[1] - g.start[1]) < 2
}

/** conservative line-of-sight on the inflated grid (nearest cell, every 0.25 m, 0.3 m tolerance for the cell size) */
function lineOfSight(g: Grid, a: V2, b: V2, thr = g.inflate - 0.3): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.ceil(len / 0.25))
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n
    const z = a[1] + ((b[1] - a[1]) * k) / n
    const [i, j] = cellOf(g, [x, z])
    if (g.clear[j * g.nx + i]! < thr && Math.hypot(x - g.start[0], z - g.start[1]) >= 2) return false
  }
  return true
}

// --- search -------------------------------------------------------------------------------------------------------------------------

class MinHeap {
  private keys: number[] = []
  private vals: number[] = []
  get size() {
    return this.keys.length
  }
  push(key: number, val: number) {
    let i = this.keys.length
    this.keys.push(key)
    this.vals.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p]! <= key) break
      this.keys[i] = this.keys[p]!
      this.vals[i] = this.vals[p]!
      i = p
    }
    this.keys[i] = key
    this.vals[i] = val
  }
  pop(): number {
    const top = this.vals[0]!
    const key = this.keys.pop()!
    const val = this.vals.pop()!
    const n = this.keys.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && this.keys[c + 1]! < this.keys[c]!) c++
        if (this.keys[c]! >= key) break
        this.keys[i] = this.keys[c]!
        this.vals[i] = this.vals[c]!
        i = c
      }
      this.keys[i] = key
      this.vals[i] = val
    }
    return top
  }
}

/**
 * Comfort: routes keep away from obstacles when there is room. A* adds up to NEAR_COST x its step cost for cells closer than COMFORT_M to the
 * inflated boundary, and the string-pull never shortcuts below min(inflate + COMFORT_PULL_M, the clearance of the A* path it replaces).
 * (Without this the pulled chains hug obstacle corners, and a pure-pursuit follower cuts those corners into the obstacle.)
 */
const COMFORT_M = 8
const NEAR_COST = 8
const COMFORT_PULL_M = 4

const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

function hashUnit(i: number, seed: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** Cells reachable from the start (4-connected flood fill) with their grid distance in cells. */
function reachable(g: Grid, start: [number, number]): Int32Array {
  const dist = new Int32Array(g.nx * g.nz).fill(-1)
  const queue = [start[1] * g.nx + start[0]]
  dist[queue[0]!] = 0
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi]!
    const i = k % g.nx
    const j = (k - i) / g.nx
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (!isFree(g, ni, nj)) continue
      const nk = nj * g.nx + ni
      if (dist[nk]! >= 0) continue
      dist[nk] = dist[k]! + 1
      queue.push(nk)
    }
  }
  return dist
}

/** A* over the inflated grid; step cost = distance x (1 + noise + penalty). Returns the cell centres, or null. */
function astar(g: Grid, start: [number, number], goal: [number, number], noiseAmp: number, noiseSeed: number, penalty?: Float32Array, comfort = false): V2[] | null {
  const N = g.nx * g.nz
  const gScore = new Float32Array(N).fill(Infinity)
  const from = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const sk = start[1] * g.nx + start[0]
  const gk = goal[1] * g.nx + goal[0]
  const heap = new MinHeap()
  const h = (i: number, j: number) => Math.hypot(i - goal[0], j - goal[1]) * CELL
  gScore[sk] = 0
  heap.push(h(start[0], start[1]), sk)
  while (heap.size) {
    const k = heap.pop()
    if (closed[k]) continue
    closed[k] = 1
    if (k === gk) break
    const i = k % g.nx
    const j = (k - i) / g.nx
    for (const [di, dj, w] of NEIGHBOURS) {
      const ni = i + di
      const nj = j + dj
      if (!isFree(g, ni, nj)) continue
      if (di !== 0 && dj !== 0 && (!isFree(g, i + di, j) || !isFree(g, i, j + dj))) continue
      const nk = nj * g.nx + ni
      if (closed[nk]) continue
      const near = comfort ? Math.max(0, 1 - (g.clear[nk]! - g.inflate) / COMFORT_M) : 0
      const mult = 1 + (noiseAmp > 0 ? noiseAmp * hashUnit(nk, noiseSeed) : 0) + (penalty ? penalty[nk]! : 0) + NEAR_COST * near
      const ng = gScore[k]! + w * CELL * mult
      if (ng < gScore[nk]!) {
        gScore[nk] = ng
        from[nk] = k
        heap.push(ng + h(ni, nj), nk)
      }
    }
  }
  if (from[gk] === -1 && gk !== sk) return null
  const cells: V2[] = []
  for (let k = gk; k !== -1; k = from[k]!) {
    const i = k % g.nx
    cells.push(centre(g, i, (k - i) / g.nx))
  }
  return cells.reverse()
}

/** Greedy string-pull on the line of sight (never tighter than the A* path it replaces, see COMFORT_*); pullAndResample then resamples so no gap exceeds RESAMPLE_M. */
function pullChain(g: Grid, cells: V2[], start: V2, end: V2): V2[] {
  const pts: V2[] = [start, ...cells.slice(1, -1), end]
  const clr = pts.map((p) => {
    const [i, j] = cellOf(g, p)
    return g.clear[j * g.nx + i]!
  })
  const pulled: V2[] = [pts[0]!]
  let anchor = 0
  while (anchor < pts.length - 1) {
    let k = anchor + 1
    let worst = Math.min(clr[anchor]!, clr[k]!)
    while (k + 1 < pts.length) {
      const nextWorst = Math.min(worst, clr[k + 1]!)
      const thr = Math.max(g.inflate - 0.3, Math.min(g.inflate + COMFORT_PULL_M, nextWorst - 0.2))
      if (!lineOfSight(g, pts[anchor]!, pts[k + 1]!, thr)) break
      worst = nextWorst
      k++
    }
    pulled.push(pts[k]!)
    anchor = k
  }
  return pulled
}

const pullAndResample = (g: Grid, cells: V2[], start: V2, end: V2): V2[] => densifyMax(pullChain(g, cells, start, end), RESAMPLE_M)

function densifyMax(points: V2[], maxGap: number): V2[] {
  const out: V2[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxGap))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/** Douglas-Peucker: drops vertices closer than `tol` m to the line through their neighbours (the exact clearance check validates the result). */
export function simplify(points: V2[], tol: number): V2[] {
  if (points.length < 3) return points
  const a = points[0]!
  const b = points[points.length - 1]!
  let worst = 0
  let wi = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointSegDist(points[i]![0], points[i]![1], a, b)
    if (d > worst) {
      worst = d
      wi = i
    }
  }
  if (worst <= tol) return [a, b]
  const left = simplify(points.slice(0, wi + 1), tol)
  const right = simplify(points.slice(wi), tol)
  return [...left.slice(0, -1), ...right]
}

/**
 * Rounds the corners of a polyline with circular arcs of radius `radius` (smaller where the adjacent segments are too short, corners under
 * ~6 degrees stay as they are). The car cannot turn on the spot: a pure-pursuit follower on a sharp 90 degree corner of a 16 m maze cell
 * overshoots into the wall behind it, a filleted corner is a path it can actually drive.
 */
export function roundCorners(points: V2[], radius: number): { points: V2[]; minRadius: number } {
  let minRadius = Infinity
  if (radius <= 0 || points.length < 3) return { points, minRadius }
  const out: V2[] = [points[0]!]
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i - 1]!
    const v = points[i]!
    const b = points[i + 1]!
    const l1 = Math.hypot(v[0] - a[0], v[1] - a[1])
    const l2 = Math.hypot(b[0] - v[0], b[1] - v[1])
    if (l1 < 1e-6 || l2 < 1e-6) continue
    const u1: V2 = [(v[0] - a[0]) / l1, (v[1] - a[1]) / l1]
    const u2: V2 = [(b[0] - v[0]) / l2, (b[1] - v[1]) / l2]
    const cross = u1[0] * u2[1] - u1[1] * u2[0]
    const turn = Math.atan2(Math.abs(cross), u1[0] * u2[0] + u1[1] * u2[1])
    if (turn < 0.1) {
      out.push(v)
      continue
    }
    const tanHalf = Math.tan(turn / 2)
    const d = Math.min(radius * tanHalf, (i === 1 ? 0.95 : 0.5) * l1, (i === points.length - 2 ? 0.95 : 0.5) * l2)
    const r = d / tanHalf
    // kinks under ~11 degrees are driven through at any radius (they are rounded anyway)
    if (turn >= 0.2) minRadius = Math.min(minRadius, r)
    const p1: V2 = [v[0] - u1[0] * d, v[1] - u1[1] * d]
    const sgn = cross > 0 ? 1 : -1 // +1 = turns toward +angle (left in x-z handedness of this plane)
    const centre: V2 = [p1[0] - sgn * u1[1] * r, p1[1] + sgn * u1[0] * r]
    const a0 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0])
    const steps = Math.max(2, Math.ceil((r * turn) / 2))
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + sgn * turn * (k / steps)
      out.push([centre[0] + r * Math.cos(ang), centre[1] + r * Math.sin(ang)])
    }
  }
  out.push(points[points.length - 1]!)
  return { points: out, minRadius }
}

/**
 * The car's tightest turn is a circle of ~10 m radius (full steer at 4.5 m/s, measured). Corners are rounded with these radii (tried in
 * order, first one that keeps the clearance wins) and a chain is REJECTED when any corner ends up tighter than MIN_TURN_RADIUS (e.g. a
 * U-turn inside one 16 m maze cell can not be driven by this car whatever the policy does).
 */
export const CORNER_RADII = [12, 10]
export const MIN_TURN_RADIUS = 6
/** tolerance of the Douglas-Peucker pass before the corners are rounded (m) */
export const SIMPLIFY_M = 1.5

// --- end targets --------------------------------------------------------------------------------------------------------------------

/** nearest reachable free cell to a wanted point */
function nearestReachable(g: Grid, reach: Int32Array, want: V2): [number, number] | null {
  let best: [number, number] | null = null
  let bestD = Infinity
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      if (reach[j * g.nx + i]! < 0) continue
      const c = centre(g, i, j)
      const d = Math.hypot(c[0] - want[0], c[1] - want[1])
      if (d < bestD) {
        bestD = d
        best = [i, j]
      }
    }
  }
  return best
}

/** end targets closer than this collapse into one (the Hausdorff rule on the chains does the real filtering) */
const END_SEPARATION_M = 8
/** non-maze end targets must lie within this distance (along z) of the far end of the track */
const FAR_TOLERANCE_M = 40
const FAR_Z = -(COURSE_LENGTH - 10)

/**
 * 2-4 end targets as grid cells, in priority order. field / slalom / crowd: left, centre, right at the far end of the track; maze: the real
 * exit cell plus reachable maze cells far from the start (different branches), pairwise >= 2 cells apart.
 */
function chooseEnds(kind: CourseKind, course: Course, g: Grid, reach: Int32Array, rng: Rng): Array<[number, number]> {
  const ends: Array<[number, number]> = []
  const add = (c: [number, number] | null) => {
    if (!c) return
    const p = centre(g, c[0], c[1])
    if (ends.every((e) => Math.hypot(centre(g, e[0], e[1])[0] - p[0], centre(g, e[0], e[1])[1] - p[1]) >= END_SEPARATION_M)) ends.push(c)
  }
  if (kind !== 'maze') {
    const half = 11
    for (const x of [0, -half, half]) {
      const c = nearestReachable(g, reach, [x, FAR_Z])
      // a pocket of free space far from the far end is no end target: the setup is not passable along its length at this clearance
      if (c && centre(g, c[0], c[1])[1] <= FAR_Z + FAR_TOLERANCE_M) add(c)
    }
    return ends
  }
  const wp = course.waypoints
  if (wp.length >= 2) add(nearestReachable(g, reach, wp[wp.length - 2]!))
  // maze cell centres lie on the lattice 16 m around the canonical start cell centre (the world origin)
  const cands: Array<[number, number]> = []
  for (let lj = -6; lj <= 6; lj++) {
    for (let li = -6; li <= 6; li++) {
      const c = cellOf(g, [li * 16, lj * 16])
      const p = centre(g, c[0], c[1])
      if (Math.abs(p[0] - li * 16) > 1 || Math.abs(p[1] - lj * 16) > 1) continue
      if (reach[c[1] * g.nx + c[0]]! < 3 * 16 / CELL) continue
      cands.push(c)
    }
  }
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[cands[i], cands[j]] = [cands[j]!, cands[i]!]
  }
  for (const c of cands) {
    if (ends.length >= CHAINS_PER_SETUP) break
    const p = centre(g, c[0], c[1])
    if (ends.every((e) => Math.hypot(centre(g, e[0], e[1])[0] - p[0], centre(g, e[0], e[1])[1] - p[1]) >= 24)) add(c)
  }
  return ends
}

// --- chain set ----------------------------------------------------------------------------------------------------------------------

function penaltyField(g: Grid, accepted: Chain[]): Float32Array {
  const pen = new Float32Array(g.nx * g.nz)
  const R = 14
  for (const c of accepted) {
    for (const p of densify(c.points, 2)) {
      const [ci, cj] = cellOf(g, p)
      const r = Math.ceil(R / CELL)
      for (let j = Math.max(0, cj - r); j <= Math.min(g.nz - 1, cj + r); j++) {
        for (let i = Math.max(0, ci - r); i <= Math.min(g.nx - 1, ci + r); i++) {
          const q = centre(g, i, j)
          const d = Math.hypot(q[0] - p[0], q[1] - p[1])
          if (d < R) pen[j * g.nx + i] = Math.max(pen[j * g.nx + i]!, 5 * (1 - d / R))
        }
      }
    }
  }
  return pen
}

function seedOf(setupKey: string): number {
  let h = 2166136261
  for (let i = 0; i < setupKey.length; i++) h = Math.imul(h ^ setupKey.charCodeAt(i), 16777619) >>> 0
  return h
}

function generate(setupKey: string, margin: number): Chain[] {
  const { kind, seed, difficulty } = parseCourseKey(setupKey)
  const minClearance = CLEARANCE[kind].min
  const course = buildSetupCourse(setupKey)
  const start: V2 = course.startAt ?? COURSE_START
  const inflate = CAR_HALF_WIDTH + margin
  const gridKey = `${kind}:${seed}@${difficulty}:${inflate}`
  let g = gridCache.get(gridKey)
  if (!g) {
    g = buildGrid(course, inflate, COURSE_START)
    if (gridCache.size > 48) gridCache.delete(gridCache.keys().next().value!)
    gridCache.set(gridKey, g)
  }
  const grid: Grid = { ...g, start }
  const sc = cellOf(grid, start)
  const reach = reachable(grid, sc)
  const rng = createRng(seedOf(setupKey))
  const ends = chooseEnds(kind, course, grid, reach, rng)
  const accepted: Chain[] = []
  const shortest: number[] = []
  const tryAccept = (cells: V2[] | null, endIndex: number, endCell: [number, number], limit: number): boolean => {
    if (!cells || accepted.length >= CHAINS_PER_SETUP) return false
    const pulled = simplify(pullChain(grid, cells, start, centre(grid, endCell[0], endCell[1])), SIMPLIFY_M)
    let points: V2[] | null = null
    for (const r of CORNER_RADII) {
      const rounded = roundCorners(pulled, r)
      if (rounded.minRadius < MIN_TURN_RADIUS) continue
      const cand = densifyMax(rounded.points, RESAMPLE_M)
      if (chainClearance(course.boxes, cand) >= minClearance) {
        points = cand
        break
      }
    }
    if (!points) return false
    const length = polylineLength(points)
    if (length > limit) return false
    if (chainClearance(course.boxes, points) < minClearance) return false
    if (accepted.some((a) => hausdorff(a.points, points) < MIN_HAUSDORFF_M)) return false
    accepted.push({ points, length, endIndex })
    return true
  }
  // pass 1: the shortest route to every end
  ends.forEach((e, idx) => {
    const plain = astar(grid, sc, e, 0, 0)
    shortest[idx] = plain ? polylineLength(pullAndResample(grid, plain, start, centre(grid, e[0], e[1]))) : Infinity
    tryAccept(astar(grid, sc, e, 0, 0, undefined, true), idx, e, MAX_DETOUR * shortest[idx]!)
  })
  // pass 2: alternatives that avoid the accepted chains (+ seeded cost noise)
  for (let attempt = 0; attempt < 2 && accepted.length < CHAINS_PER_SETUP; attempt++) {
    ends.forEach((e, idx) => {
      if (accepted.length >= CHAINS_PER_SETUP) return
      const cells = astar(grid, sc, e, 0.3, seedOf(setupKey) + 7 * idx + attempt, penaltyField(grid, accepted), true)
      tryAccept(cells, idx, e, MAX_DETOUR * shortest[idx]!)
    })
  }
  return accepted
}

const chainCache = new Map<string, Chain[]>()

/**
 * Chains of a setup (cached per process / worker), [] when the setup is rejected (fewer than MIN_CHAINS). A tighter inflation margin is
 * tried when the first one yields too few chains.
 */
export function chainsForSetup(setupKey: string): Chain[] {
  const hit = chainCache.get(setupKey)
  if (hit) return hit
  let chains: Chain[] = []
  if (isV3NewKind(parseCourseKey(setupKey).kind)) {
    chains = generateV3Chains(setupKey)
    chainCache.set(setupKey, chains)
    return chains
  }
  for (const margin of CLEARANCE[parseCourseKey(setupKey).kind].margins) {
    chains = generate(setupKey, margin)
    if (chains.length >= MIN_CHAINS) break
  }
  if (chains.length < MIN_CHAINS) chains = []
  if (chainCache.size > 400) chainCache.delete(chainCache.keys().next().value!)
  chainCache.set(setupKey, chains)
  return chains
}

/** The chain of an episode key `setupKey#i`. */
export function chainOfEpisode(key: string): { setupKey: string; chainIndex: number; chain: Chain; v3: boolean } {
  const { setupKey, chainIndex, v3 } = parseChainEpisodeKey(key)
  const chain = chainsForSetup(setupKey)[chainIndex]
  if (!chain) throw new Error(`no chain ${chainIndex} for setup ${setupKey}`)
  return { setupKey, chainIndex, chain, v3: !!v3 }
}

/** All chain episode keys of one setup (empty for a rejected setup). */
export function chainEpisodeKeys(setupKey: string): string[] {
  return chainsForSetup(setupKey).map((_, i) => chainEpisodeKey(setupKey, i))
}

// --- TRAIN / HOLDOUT ----------------------------------------------------------------------------------------------------------------

export interface SetupChains {
  setupKey: string
  /** chain episode keys of this setup */
  keys: string[]
}

/**
 * `perKind` accepted setups per kind (interleaved by kind), seeds counted up from `firstSeed`; seeds whose setup is rejected (< MIN_CHAINS
 * chains) are skipped deterministically.
 */
export function acceptedSetupKeys(perKind: number, kinds: readonly CourseKind[], firstSeed: number, variant = 0): string[] {
  const perKindKeys = kinds.map((kind) => {
    const keys: string[] = []
    for (let seed = firstSeed; keys.length < perKind && seed < firstSeed + 20 * perKind + 50; seed++) {
      const k = courseKey(kind, seed, variant, kind === 'field' ? CHAIN_FIELD_DIFFICULTY : 1)
      if (chainsForSetup(k).length >= MIN_CHAINS) keys.push(k)
    }
    return keys
  })
  const out: string[] = []
  for (let i = 0; i < perKind; i++) for (const keys of perKindKeys) if (keys[i]) out.push(keys[i]!)
  return out
}

/** Caps the field difficulty of a setup key at CHAIN_FIELD_DIFFICULTY (other kinds untouched). */
export function capFieldDifficulty(setupKey: string): string {
  const { kind, seed, variant, difficulty } = parseCourseKey(setupKey)
  return kind === 'field' && difficulty > CHAIN_FIELD_DIFFICULTY ? courseKey(kind, seed, variant, CHAIN_FIELD_DIFFICULTY) : setupKey
}

export const groupBySetup = (setupKeys: string[], v3 = false): SetupChains[] => setupKeys.map((setupKey) => ({ setupKey, keys: v3 ? v3EpisodeKeys(setupKey) : chainEpisodeKeys(setupKey) }))

/** TRAIN setups (seeds 1..) with all their chain episodes, grouped by setup. */
export function trainChainEpisodes(perKind = 6, kinds: readonly CourseKind[] = CHAIN_KINDS): SetupChains[] {
  return groupBySetup(acceptedSetupKeys(perKind, kinds, 1))
}

/** HOLDOUT setups (seeds 1001.., random start variant) with all their chain episodes, grouped by setup. */
export function holdoutChainEpisodes(perKind = 6, kinds: readonly CourseKind[] = CHAIN_KINDS, variant = 1): SetupChains[] {
  return groupBySetup(acceptedSetupKeys(perKind, kinds, 1001, variant))
}

export const flattenChainKeys = (groups: SetupChains[]): string[] => groups.flatMap((g) => g.keys)

// --- v3 TRAIN / HOLDOUT ---------------------------------------------------------------------------------------------------------------

/** v3 TRAIN setups (seeds 1..) of the given kinds (any v3 kind), episode keys with the `v3` flag, grouped by setup. */
export function trainV3Episodes(perKind = 6, kinds: readonly CourseKind[] = V3_KINDS): SetupChains[] {
  return groupBySetup(acceptedSetupKeys(perKind, kinds, 1), true)
}

/** v3 HOLDOUT setups (seeds 1001.., random start variant) of the given kinds, grouped by setup. */
export function holdoutV3Episodes(perKind = 6, kinds: readonly CourseKind[] = V3_KINDS, variant = 1): SetupChains[] {
  return groupBySetup(acceptedSetupKeys(perKind, kinds, 1001, variant), true)
}

/** episode keys of one setup in v3 mode */
export const v3EpisodeKeys = (setupKey: string): string[] => chainsForSetup(setupKey).map((_, i) => chainEpisodeKey(setupKey, i, true))
