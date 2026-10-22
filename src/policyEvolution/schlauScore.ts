/**
 * The schlau score geometry: the geodesic (shortest drivable) distance field and path for the "schlau" car — the second
 * self-driving policy trained on START -> GOAL tasks only (no waypoint chains; see schlauPolicy.ts). The score is the
 * reduction of the shortest drivable distance from the car's nose to the goal, where the path must not cross obstacles
 * and must respect the car's width (hull 4 x 8 m, half width 2 m). Computations stay SIMPLE: a 1 m grid
 * (SCHLAU_CELL), Dijkstra over the 8-connected free cells, string-pulling with EXACT line of sight.
 *
 *  - `schlauDistanceField`: Dijkstra from the goal cell at SCHLAU_INFLATE_M (2.5 m); `at(x, z)` reads the nearest cell —
 *    the drivable distance to the goal. An unreachable cell reads span * 2 + euclid(x, z, goal): a finite cut-off, so
 *    the score reduction saturates at 0 instead of going negative.
 *  - `schlauGeodesicPath` / `schlauGeodesicPathInflated`: Dijkstra with a parent trace from the start cell to the goal
 *    cell at SCHLAU_PATH_INFLATE_M (4 m — the drawn route must clear obstacles, not graze their corners diagonally,
 *    user decision 2026-10-23), with a FALLBACK to SCHLAU_INFLATE_M when no 4 m route exists (no seed explodes; the
 *    field and the course reachability BFS stay at 2.5 m). The cell path is string-pulled with EXACT line of sight
 *    (segment <-> box gap >= inflate, no grid-sample slack), its corners rounded as a polyline fillet
 *    (SCHLAU_FILLET_M, sampled as short straight segments — the route stays a STRAIGHT-SEGMENT polyline, no
 *    car-curve modelling) and resampled so consecutive gaps stay <= 10 m; null when the goal is unreachable even at
 *    the fallback inflation.
 */
import type { CourseBox } from './courses'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'

/** grid cell size (m) */
export const SCHLAU_CELL = 1
/** obstacle inflation of the distance field / reachability BFS (m): car half width 2 m + 0.5 m margin — a cell is FREE when its centre keeps this much clearance */
export const SCHLAU_INFLATE_M = 2.5
/**
 * Obstacle inflation of the geodesic PATH (m): car half width 2 m + 2 m margin (user decision 2026-10-23 — the old
 * 2.5 m let the string-pulled route graze obstacle corners diagonally, the "schräg streifen" complaint). The path's
 * straight segments are validated EXACTLY against every box (segment <-> box gap >= inflate), so the drawn route
 * keeps this clearance everywhere; when no route exists at 4 m, `schlauGeodesicPathInflated` falls back to
 * SCHLAU_INFLATE_M.
 */
export const SCHLAU_PATH_INFLATE_M = 4
/**
 * Corner-rounding radius (m) of the path's string-pulled corners (user decision 2026-10-23): a polyline fillet
 * sampled as short straight segments (<= 1 m, far below the 10 m resample gap) — the route stays a STRAIGHT-SEGMENT
 * polyline, no car-curve modelling. A corner whose fillet cannot keep the path's clearance keeps its sharp vertex.
 */
export const SCHLAU_FILLET_M = 5

// --- touch penalties (shared by the in-world score stage and the headless episode) ----------------------------------------------

/**
 * Touch penalties of the schlau worlds (POINTS per second of contact — the in-world score stage currency; user
 * decision 2026-10-23: wall contact 12 -> 30, object contact 4 -> 15). schlauTraining.ts bakes these into the score
 * stage params; the maze / crux worlds keep their OWN constants (MAZE_TRAIN_SCORE / CRUX_TRAIN_SCORE) — these are
 * schlau-only.
 */
export const SCHLAU_WALL_TOUCH_PENALTY_PER_S = 30
export const SCHLAU_OBJECT_TOUCH_PENALTY_PER_S = 15
/**
 * Per-frame touch penalties of a schlau EPISODE (norm currency, runSchlauEpisode): the old v3 borrow
 * (V3_WALL_TOUCH_PENALTY 0.0125 / V3_OBJECT_TOUCH_PENALTY 0.005 per frame, es.ts) scaled by the same factors as the
 * 2026-10-23 decision (wall 12 -> 30 = x2.5, object 4 -> 15 = x3.75) — 0.03125 / 0.01875 per touching frame, i.e.
 * 1.875 / 1.125 norm per second of contact at the episode's 60 fps.
 */
export const SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME = 0.0125 * (SCHLAU_WALL_TOUCH_PENALTY_PER_S / 12)
export const SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME = 0.005 * (SCHLAU_OBJECT_TOUCH_PENALTY_PER_S / 4)

/** Per-episode touch penalty of a schlau episode in norm currency (frames x the per-frame rates above). */
export function schlauTouchPenaltyNorm(touchWallFrames: number | undefined, touchObjectFrames: number | undefined): number {
  return (touchWallFrames ?? 0) * SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME + (touchObjectFrames ?? 0) * SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME
}

/** The geodesic distance field of one goal: `at(x, z)` = shortest drivable distance from (x, z) to the goal (m). */
export interface SchlauField {
  x0: number
  z0: number
  nx: number
  nz: number
  inflate: number
  /** max(nx, nz) * SCHLAU_CELL: the grid's span (m); the unreachable cut-off starts at span * 2 */
  span: number
  /** drivable distance of the nearest cell to the goal (m); an unreachable cell reads span * 2 + euclid(x, z, goal) */
  at(x: number, z: number): number
}

// --- occupancy grid -------------------------------------------------------------------------------------------------------------

/** The shared internal grid: SCHLAU_CELL cells over the boxes + the given points (+ margin), per-cell clearance. */
interface SchlauGrid {
  x0: number
  z0: number
  nx: number
  nz: number
  /** per-cell clearance: min over all boxes of pointPolyGap(cellCentre, rectPoly(...)) (0 inside a box) */
  clear: Float32Array
  /** free-cell inflation (m): a cell is FREE when its centre keeps this much clearance */
  inflate: number
  /** the box corner polys, grid order — the EXACT line-of-sight / fillet checks read these */
  polys: V2[][]
}

/**
 * Grid builder shared by the field and the path: bounds = min/max over all box centres +/- their bounding radius
 * (hypot(size) / 2), plus `points`, padded by `margin`; cell size SCHLAU_CELL. A cell is FREE when its centre keeps
 * `inflate` of clearance.
 */
function schlauGrid(boxes: CourseBox[], points: V2[], margin: number, inflate = SCHLAU_INFLATE_M): SchlauGrid {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const polys = boxes.map((b) => ({
    at: b.at,
    r: Math.hypot(b.size[0], b.size[1]) / 2,
    poly: rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]),
  }))
  for (const b of polys) {
    minX = Math.min(minX, b.at[0] - b.r)
    maxX = Math.max(maxX, b.at[0] + b.r)
    minZ = Math.min(minZ, b.at[1] - b.r)
    maxZ = Math.max(maxZ, b.at[1] + b.r)
  }
  for (const p of points) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minZ = Math.min(minZ, p[1])
    maxZ = Math.max(maxZ, p[1])
  }
  const x0 = Math.floor(minX - margin)
  const z0 = Math.floor(minZ - margin)
  const nx = Math.ceil((maxX + margin - x0) / SCHLAU_CELL) + 1
  const nz = Math.ceil((maxZ + margin - z0) / SCHLAU_CELL) + 1
  const clear = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    const cz = z0 + (j + 0.5) * SCHLAU_CELL
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * SCHLAU_CELL
      let c = Infinity
      for (const b of polys) {
        // pointPolyGap >= |cellCentre - boxCentre| - r: skip the boxes that cannot beat the current best
        if (Math.hypot(cx - b.at[0], cz - b.at[1]) - b.r >= c) continue
        c = Math.min(c, pointPolyGap(cx, cz, b.poly))
      }
      clear[j * nx + i] = c
    }
  }
  return { x0, z0, nx, nz, clear, inflate, polys: polys.map((b) => b.poly) }
}

/** cell of a point, clamped to the grid (the nearest cell) */
const schlauCellOf = (g: SchlauGrid, x: number, z: number): [number, number] => [
  Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / SCHLAU_CELL))),
  Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.z0) / SCHLAU_CELL))),
]

const schlauCentre = (g: SchlauGrid, i: number, j: number): V2 => [g.x0 + (i + 0.5) * SCHLAU_CELL, g.z0 + (j + 0.5) * SCHLAU_CELL]

// --- search ---------------------------------------------------------------------------------------------------------------------

/** binary min-heap of (key, cell index) — the Dijkstra frontier */
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

/** 8-connected steps: [di, dj, euclidean cell-centre distance / SCHLAU_CELL] */
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

/**
 * Dijkstra over the free cells (8-connected, step cost = euclidean distance between cell centres); the source cell is
 * seeded with 0 even when it is blocked. Stops when `dst` is popped (its distance is final then); without `dst` it
 * floods the whole reachable region. `parent` traces every reached cell back to the source (-1 at the source).
 */
function schlauDijkstra(g: SchlauGrid, src: [number, number], dst?: [number, number]): { dist: Float64Array; parent: Int32Array } {
  const N = g.nx * g.nz
  const dist = new Float64Array(N).fill(Infinity)
  const parent = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const sk = src[1] * g.nx + src[0]
  dist[sk] = 0
  const dk = dst ? dst[1] * g.nx + dst[0] : -1
  const heap = new MinHeap()
  heap.push(0, sk)
  while (heap.size) {
    const k = heap.pop()
    if (closed[k]) continue
    closed[k] = 1
    if (k === dk) break
    const i = k % g.nx
    const j = (k - i) / g.nx
    const d = dist[k]!
    for (const [di, dj, w] of NEIGHBOURS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue
      if (g.clear[nj * g.nx + ni]! < g.inflate) continue
      const nk = nj * g.nx + ni
      const nd = d + w * SCHLAU_CELL
      if (nd < dist[nk]!) {
        dist[nk] = nd
        parent[nk] = k
        heap.push(nd, nk)
      }
    }
  }
  return { dist, parent }
}

// --- string-pull + fillet + resample --------------------------------------------------------------------------------------------

/**
 * EXACT line of sight for the path pull: the straight segment a -> b keeps `inflate` of clearance from every box
 * (polyGap of the segment and the box poly — exact for convex polys, 0 when they cross). The old grid-sample LOS
 * (0.25 m samples with a 0.3 m slack) is what let the pulled route graze obstacle corners diagonally.
 */
function schlauLos(g: SchlauGrid, a: V2, b: V2): boolean {
  const seg: V2[] = [a, b]
  for (const poly of g.polys) if (polyGap(seg, poly) < g.inflate) return false
  return true
}

/** greedy string-pull of the cell-centre path: from each anchor keep the farthest cell centre in line of sight */
function schlauPull(g: SchlauGrid, cells: V2[]): V2[] {
  const pulled: V2[] = [cells[0]!]
  let anchor = 0
  while (anchor < cells.length - 1) {
    let k = anchor + 1
    while (k + 1 < cells.length && schlauLos(g, cells[anchor]!, cells[k + 1]!)) k++
    pulled.push(cells[k]!)
    anchor = k
  }
  return pulled
}

/**
 * Polyline fillet of the pulled corners (user decision 2026-10-23): each interior corner is replaced by a tangent
 * arc of radius min(SCHLAU_FILLET_M, what the adjacent segment halves allow), sampled as short straight segments
 * (<= 1 m). The route stays a STRAIGHT-SEGMENT polyline — no car-curve modelling. An arc is kept only when every
 * chord of the final polyline — the previous vertex through the arc samples to the exit tangency — keeps the full
 * inflation of clearance (EXACT segment <-> box gap); otherwise the radius halves, and a corner where even 0.75 m
 * does not fit keeps its sharp vertex.
 */
function schlauFillet(g: SchlauGrid, pts: V2[]): V2[] {
  if (pts.length < 3) return pts
  const out: V2[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!
    const c = pts[i]!
    const q = pts[i + 1]!
    const lu = Math.hypot(c[0] - p[0], c[1] - p[1])
    const lv = Math.hypot(q[0] - c[0], q[1] - c[1])
    if (lu < 1e-9 || lv < 1e-9) {
      out.push(c)
      continue
    }
    const u: V2 = [(c[0] - p[0]) / lu, (c[1] - p[1]) / lu]
    const v: V2 = [(q[0] - c[0]) / lv, (q[1] - c[1]) / lv]
    // deflection angle: 0 = straight, PI = hairpin; the tangent length of a radius-r fillet is r * tan(deflection / 2)
    const cosA = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))
    const turn = Math.acos(cosA)
    const half = Math.min(lu, lv) / 2
    const tanHalf = Math.tan(turn / 2)
    if (turn < 0.02 || tanHalf * 0.75 > half) {
      out.push(c)
      continue
    }
    // arc centre: offset from the entry tangent point along the normal of u toward the turn side; a radius-r
    // fillet touches both legs at r * tan(turn / 2) from the corner, so the segments' halves cap the radius
    const left = u[0] * v[1] - u[1] * v[0] > 0
    const n: V2 = left ? [-u[1], u[0]] : [u[1], -u[0]]
    let filleted = false
    for (let r = Math.min(SCHLAU_FILLET_M, half / tanHalf); r >= 0.75; r /= 2) {
      const t = r * tanHalf
      const e: V2 = [c[0] - u[0] * t, c[1] - u[1] * t]
      const x: V2 = [c[0] + v[0] * t, c[1] + v[1] * t]
      const o: V2 = [e[0] + n[0] * r, e[1] + n[1] * r]
      const a0 = Math.atan2(e[1] - o[1], e[0] - o[0])
      const sweep = left ? turn : -turn
      const steps = Math.max(2, Math.ceil((r * turn) / 1))
      const arc: V2[] = []
      for (let k = 1; k < steps; k++) {
        const a = a0 + (sweep * k) / steps
        arc.push([o[0] + r * Math.cos(a), o[1] + r * Math.sin(a)])
      }
      arc.push(x)
      // EXACT: every chord of the final polyline — from the previous vertex through the arc samples to the exit
      // tangency — keeps the full inflation of clearance (schlauLos = exact segment <-> box gap, no sampling slack)
      let ok = true
      let prev: V2 = out[out.length - 1]!
      for (const s of arc) {
        if (!schlauLos(g, prev, s)) {
          ok = false
          break
        }
        prev = s
      }
      if (!ok) continue
      out.push(...arc)
      filleted = true
      break
    }
    if (!filleted) out.push(c)
  }
  out.push(pts[pts.length - 1]!)
  return out
}

/** resample a polyline so no consecutive gap exceeds maxGap (m) */
function schlauResample(points: V2[], maxGap: number): V2[] {
  const out: V2[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxGap))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/** resample gap of the geodesic path (m) */
const SCHLAU_RESAMPLE_M = 10

// --- exports ---------------------------------------------------------------------------------------------------------------------

/**
 * The geodesic distance field of `goal` over `boxes`: a SCHLAU_CELL grid (bounds: the boxes +/- their bounding radius
 * plus the goal, padded by `margin`) whose cells keep SCHLAU_INFLATE_M of clearance, Dijkstra from the goal cell over
 * the 8-connected free cells (step cost = euclidean cell-centre distance). `at(x, z)` reads the nearest cell; an
 * unreachable cell reads span * 2 + euclid(x, z, goal) — a finite cut-off so the score reduction saturates at 0 instead
 * of going negative.
 */
export function schlauDistanceField(boxes: CourseBox[], goal: V2, margin = 12): SchlauField {
  const g = schlauGrid(boxes, [goal], margin)
  const [gi, gj] = schlauCellOf(g, goal[0], goal[1])
  const { dist } = schlauDijkstra(g, [gi, gj])
  const span = Math.max(g.nx, g.nz) * SCHLAU_CELL
  return {
    x0: g.x0,
    z0: g.z0,
    nx: g.nx,
    nz: g.nz,
    inflate: g.inflate,
    span,
    at(x, z) {
      const [i, j] = schlauCellOf(g, x, z)
      const d = dist[j * g.nx + i]!
      return Number.isFinite(d) ? d : span * 2 + Math.hypot(x - goal[0], z - goal[1])
    },
  }
}

/**
 * The shortest drivable path (m) from `start` to `goal` over the boxes: Dijkstra with a parent trace from the start
 * cell to the goal cell at SCHLAU_PATH_INFLATE_M (4 m), with a FALLBACK to SCHLAU_INFLATE_M (2.5 m) when no route
 * keeps 4 m of clearance (no seed explodes; the field and the course reachability BFS stay at 2.5 m). The cell path
 * is string-pulled with EXACT line of sight, its corners rounded as a polyline fillet (SCHLAU_FILLET_M) and
 * resampled so consecutive gaps stay <= 10 m. `inflate` reports the inflation the path actually keeps. null when
 * the goal is unreachable even at the fallback inflation.
 */
export interface SchlauPath {
  /** the path polyline: straight segments, start cell centre -> goal cell centre, gaps <= 10 m */
  pts: V2[]
  /** the inflation (m) the path keeps from every box: SCHLAU_PATH_INFLATE_M, or SCHLAU_INFLATE_M on the fallback */
  inflate: number
}

/** The shortest drivable path with its inflation — see `SchlauPath` (schlauGeodesicPath is the pts-only wrapper). */
export function schlauGeodesicPathInflated(boxes: CourseBox[], start: V2, goal: V2): SchlauPath | null {
  const g = schlauGrid(boxes, [start, goal], 12, SCHLAU_PATH_INFLATE_M)
  const [si, sj] = schlauCellOf(g, start[0], start[1])
  const [gi, gj] = schlauCellOf(g, goal[0], goal[1])
  let { dist, parent } = schlauDijkstra(g, [si, sj], [gi, gj])
  const gk = gj * g.nx + gi
  let inflate = SCHLAU_PATH_INFLATE_M
  if (!Number.isFinite(dist[gk]!)) {
    // fallback: no route keeps 4 m of clearance — the old 2.5 m inflation, so no seed explodes
    inflate = SCHLAU_INFLATE_M
    g.inflate = SCHLAU_INFLATE_M
    ;({ dist, parent } = schlauDijkstra(g, [si, sj], [gi, gj]))
    if (!Number.isFinite(dist[gk]!)) return null
  }
  const cells: V2[] = []
  for (let k = gk; k !== -1; k = parent[k]!) {
    const i = k % g.nx
    cells.push(schlauCentre(g, i, (k - i) / g.nx))
  }
  cells.reverse()
  return { pts: schlauResample(schlauFillet(g, schlauPull(g, cells)), SCHLAU_RESAMPLE_M), inflate }
}

/**
 * The shortest drivable path (m) from `start` to `goal` over the boxes (see `schlauGeodesicPathInflated`): built at
 * SCHLAU_PATH_INFLATE_M with a fallback to SCHLAU_INFLATE_M, string-pulled with EXACT line of sight, corners rounded
 * as a polyline fillet, resampled so consecutive gaps stay <= 10 m. null when the goal is unreachable even at the
 * fallback inflation.
 */
export function schlauGeodesicPath(boxes: CourseBox[], start: V2, goal: V2): V2[] | null {
  return schlauGeodesicPathInflated(boxes, start, goal)?.pts ?? null
}
