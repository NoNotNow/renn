/**
 * Maze training worlds: five playable maze worlds that train and showcase the evolved v3 driving policy
 * exclusively on mazes. Shared contract between:
 * - the world builder + exporter (`tools/renn-mcp/export-maze-training-worlds.ts`),
 * - the world tests (`src/test/scenarios/maze-training-worlds.test.ts`),
 * - the Builder dialog (`src/components/MazeTrainingDialog.tsx`).
 *
 * Keep this module free of node imports (no `node:fs`): the dialog imports it inside the browser bundle.
 * The registry block below is the stable contract (ids, seeds, names, meta shape); the chain taper,
 * world builder and score-stage code live in this file too, owned by the exporter side.
 */
import type { RennWorld } from '@/types/world'
import { createRng } from '@/avEvolution/core/rng'
import { cellCentre, generateMaze } from '@/avEvolution/maze/mazeGen'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { buildCourse, KIND_SALT, type Course, type CourseBox } from './courses'
import { POLICY_CAR_ID, POLICY_GROUND, policyCourseParts, type CmdConfig } from './episode'

export interface MazeTrainingWorldSpec {
  /** example world id (= folder name under public/exampleWorlds/, also the File-menu/dialog key) */
  id: string
  /** maze seed for `buildCourse('maze', seed)` (deterministic 6x6 maze, 16 m pitch) */
  seed: number
  name: string
}

/**
 * The five training mazes. Seeds 2001-2005 are distinct from every training/holdout course seed
 * (train 1001-1016 range) so the worlds are neither trained-on nor holdout mazes.
 */
export const MAZE_TRAINING_WORLDS: MazeTrainingWorldSpec[] = [
  { id: 'maze_train_1', seed: 2001, name: 'Maze Training 1' },
  { id: 'maze_train_2', seed: 2002, name: 'Maze Training 2' },
  { id: 'maze_train_3', seed: 2003, name: 'Maze Training 3' },
  { id: 'maze_train_4', seed: 2004, name: 'Maze Training 4' },
  { id: 'maze_train_5', seed: 2005, name: 'Maze Training 5' },
]

export interface MazeTrainingCandidate {
  policy: 'v3'
  /** human-readable label shown in the dialog, e.g. "v3 shipped (gen 1000)" */
  label: string
  /** generation of the candidate genome */
  gen: number
  /** where the genome came from */
  source: string
}

/** Written by the exporter next to each world.json and shown on the dialog cards. */
export interface MazeTrainingMeta {
  id: string
  seed: number
  name: string
  candidate: MazeTrainingCandidate
  /** best headless score of the candidate on this maze (max over all route cars; points = vector path + speed bonus); null until measured */
  bestScore: number | null
  /** stats of the primary (shortest forward) guidance chain */
  chain: { points: number; lengthM: number }
  /** how many ways the world trains on: forward routes + routes driven in reverse direction (bias removal) */
  routes: { forward: number; reversed: number }
}

/** Route mix per world: several distinct routes through the maze, some of them driven in reverse direction. */
export const MAZE_TRAIN_ROUTES = {
  /** max distinct forward routes kept (shortest first, filtered for diversity) */
  forward: 3,
  /** max routes additionally kept in REVERSE direction (driven start<->goal swapped) */
  reversed: 2,
  /** x distance between the per-route maze copies (m) */
  spacingM: 130,
} as const

/** Command config of the in-world policy stage (middle of the training ranges, like the AV neural stage defaults). */
export const MAZE_TRAIN_CMD = { lmin: 8, tau: 0.6, period: 0.5, noiseDeg: 3, seed: 4711 } as const

/** Chain taper: guidance vectors are dense and exact at the start, sparser and noisier deeper in the maze. */
export const MAZE_TRAIN_TAPER = {
  /** chain point spacing at the start (m): dense, one point per curve */
  spacingStartM: 8,
  /** chain point spacing at the far end (m): coarse, guidance fades */
  spacingEndM: 40,
  /** perpendicular waypoint noise at the start (m): none */
  noiseStartM: 0,
  /** perpendicular waypoint noise at the far end (m): unexact guidance */
  noiseEndM: 3.5,
} as const

/** Scoring: 1 point per metre of vector path travelled (monotone arc-length progress) plus a speed bonus. */
export const MAZE_TRAIN_SCORE = {
  /** speed counted as "full" for the bonus (m/s) */
  vRef: 20,
  /** bonus points per second at full speed */
  bonusRate: 5,
} as const

/** Colors of the drawn guidance chain (api.visualizeLine): start green, deep orange. */
export const MAZE_TRAIN_CHAIN_COLORS = { start: '#44ff77', end: '#ffaa44' } as const

/** Reversed-direction routes draw in blue tones so forward and reverse ways are distinguishable in-world. */
export const MAZE_TRAIN_CHAIN_COLORS_REVERSED = { start: '#44bbff', end: '#ffaa44' } as const

export type MazeTrainingBuildFn = (spec: MazeTrainingWorldSpec) => RennWorld

// --- route enumeration + tapered guidance chain (pure, browser-safe) ------------------------------------------------------------------

/** Hard cap of chain points (visualizeLine renders at most 200 entries per frame: n-1 segments + 1 carrot line). */
export const MAZE_CHAIN_MAX_POINTS = 80
/** Noisy chain points must keep at least this distance to every course wall box (m). */
export const MAZE_CHAIN_WALL_CLEAR_M = 1.5

/** One training route through the maze: the full driving polyline in course coords (start cell centre = origin). */
export interface MazeRoute {
  /** true = the route is driven in REVERSE direction (start/goal swapped: the car starts beyond the north gate) */
  reversed: boolean
  /** car start pose: position = the first route point, heading facing the second route point (mazeCourse's rule) */
  startAt: V2
  startYawDeg: number
  /** [start, ...cell centres along the path, 16 m beyond the exit gate] (reversed: that list reversed) */
  route: V2[]
}

/** maze geometry constants of `mazeCourse` (src/policyEvolution/courses.ts): 6x6 cells, 16 m pitch, 10 % loops. */
const MAZE_CELLS = 6
const MAZE_PITCH = 16
/** DFS caps of the route enumeration: longer simple paths and more collected paths stop the search. */
const ROUTE_MAX_CELLS = 24
const ROUTE_MAX_PATHS = 64
/** a candidate route is kept only if its CELL set shares at most this fraction with every kept route. */
const ROUTE_MAX_SHARE = 0.6

/**
 * All training routes of one maze (deterministic in the seed; the coordinate frame matches `buildCourse('maze', seed)`:
 * the start cell centre is the origin). Primary forward route first (BFS shortest, the course's own route), then the
 * other kept forward routes (next-shortest first, filtered for diversity), then the reversed directions of the first
 * kept forward routes (the car starts 16 m beyond the north gate and drives the maze backwards).
 */
export function mazeRoutes(course: Course, seed: number): MazeRoute[] {
  const maze = generateMaze({ seed, cols: MAZE_CELLS, rows: MAZE_CELLS, cell: MAZE_PITCH, loopFraction: 0.1, goalDist: 0 })
  const rng = createRng((seed * 2654435761 + KIND_SALT.maze) >>> 0)
  const startCol = Math.floor(rng.next() * MAZE_CELLS)
  const startRow = MAZE_CELLS - 1
  const exitRow = 0
  const exitCol = maze.exitCol
  const key = (c: number, r: number) => r * MAZE_CELLS + c
  // same neighbour order as mazeCourse (N, S, W, E) so the BFS route matches course.waypoints
  const neighbours = (c: number, r: number): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    if (r > 0 && !maze.hWall[r]![c]) out.push([c, r - 1])
    if (r < MAZE_CELLS - 1 && !maze.hWall[r + 1]![c]) out.push([c, r + 1])
    if (c > 0 && !maze.vWall[r]![c]) out.push([c - 1, r])
    if (c < MAZE_CELLS - 1 && !maze.vWall[r]![c + 1]) out.push([c + 1, r])
    return out
  }
  // primary route: BFS shortest (the course's own route)
  const prev = new Map<number, number>([[key(startCol, startRow), -1]])
  const queue: Array<[number, number]> = [[startCol, startRow]]
  for (let qi = 0; qi < queue.length; qi++) {
    const [c, r] = queue[qi]!
    for (const [nc, nr] of neighbours(c, r)) {
      if (prev.has(key(nc, nr))) continue
      prev.set(key(nc, nr), key(c, r))
      queue.push([nc, nr])
    }
  }
  const primaryCells: Array<[number, number]> = []
  for (let k = key(exitCol, exitRow); k !== -1; k = prev.get(k)!) primaryCells.unshift([k % MAZE_CELLS, Math.floor(k / MAZE_CELLS)])
  // all simple cell paths start -> exit (DFS over the wall graph, capped)
  const paths: Array<Array<[number, number]>> = []
  const onPath = new Set<number>([key(startCol, startRow)])
  const stack: Array<[number, number]> = [[startCol, startRow]]
  const dfs = (c: number, r: number) => {
    if (c === exitCol && r === exitRow) {
      paths.push(stack.map((p) => [p[0], p[1]] as [number, number]))
      return
    }
    if (stack.length >= ROUTE_MAX_CELLS || paths.length >= ROUTE_MAX_PATHS) return
    for (const [nc, nr] of neighbours(c, r)) {
      if (onPath.has(key(nc, nr))) continue
      onPath.add(key(nc, nr))
      stack.push([nc, nr])
      dfs(nc, nr)
      stack.pop()
      onPath.delete(key(nc, nr))
      if (paths.length >= ROUTE_MAX_PATHS) return
    }
  }
  dfs(startCol, startRow)
  // world frame: the start cell centre is the origin (the same shift as mazeCourse)
  const [sx, sz] = cellCentre(maze, startCol, startRow)
  const shift = (p: V2): V2 => [p[0] - sx, p[1] - sz]
  const routePoints = (cells: Array<[number, number]>): V2[] => {
    const pts: V2[] = cells.map(([c, r]) => shift(cellCentre(maze, c, r)))
    const [ex, ez] = shift(cellCentre(maze, exitCol, exitRow))
    pts.push([ex, ez - MAZE_PITCH])
    return pts
  }
  const sameCells = (a: Array<[number, number]>, b: Array<[number, number]>) => a.length === b.length && a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1])
  // diversity selection: keep the primary, then greedily add the next-shortest route whose cell set shares <= 60 % with every kept route
  const kept: Array<Array<[number, number]>> = [primaryCells]
  const keptSets: Set<number>[] = [new Set(primaryCells.map(([c, r]) => key(c, r)))]
  const share = (a: Set<number>, b: Set<number>) => {
    let inter = 0
    for (const k of a) if (b.has(k)) inter++
    return inter / Math.min(a.size, b.size)
  }
  for (const p of [...paths].sort((a, b) => a.length - b.length)) {
    if (kept.length >= MAZE_TRAIN_ROUTES.forward) break
    if (sameCells(p, primaryCells)) continue
    const ps = new Set(p.map(([c, r]) => key(c, r)))
    if (keptSets.every((ks) => share(ps, ks) <= ROUTE_MAX_SHARE)) {
      kept.push(p)
      keptSets.push(ps)
    }
  }
  const pose = (pts: V2[]): { startAt: V2; startYawDeg: number } => {
    const [a, b] = [pts[0]!, pts[1]!]
    return { startAt: [a[0], a[1]], startYawDeg: Math.round((Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180) / Math.PI) }
  }
  const routes: MazeRoute[] = kept.map((cells) => {
    const pts = routePoints(cells)
    return { reversed: false, ...pose(pts), route: pts }
  })
  const nReversed = Math.min(kept.length, MAZE_TRAIN_ROUTES.reversed)
  for (let i = 0; i < nReversed; i++) {
    const pts = [...routePoints(kept[i]!)].reverse()
    routes.push({ reversed: true, ...pose(pts), route: pts })
  }
  // frame check: the primary route must be the course's own route polyline
  const coursePts: V2[] = [[...(course.startAt ?? [0, 0])] as V2, ...course.waypoints]
  const eq = (a: V2[], b: V2[]) => a.length === b.length && a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1])
  if (!eq(routes[0]!.route, coursePts)) throw new Error(`mazeRoutes: frame mismatch with buildCourse('maze', ${seed}) — the startCol rng derivation must mirror mazeCourse`)
  return routes
}

function cumulative(points: V2[]): number[] {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]))
  return cum
}

function pointAt(points: V2[], cum: number[], s: number): V2 {
  if (s <= 0) return points[0]!
  const total = cum[points.length - 1]!
  if (s >= total) return points[points.length - 1]!
  let i = 0
  while (i < points.length - 2 && cum[i + 1]! < s) i++
  const t = (s - cum[i]!) / (cum[i + 1]! - cum[i]! || 1)
  return [points[i]![0] + (points[i + 1]![0] - points[i]![0]) * t, points[i]![1] + (points[i + 1]![1] - points[i]![1]) * t]
}

/** Resample the route at growing spacing (spacing(s) = lerp(start, end, s/len) by arc length); start and end stay exact. */
function resample(route: V2[], scale: number): V2[] {
  const cum = cumulative(route)
  const total = cum[route.length - 1]!
  const { spacingStartM, spacingEndM } = MAZE_TRAIN_TAPER
  const pts: V2[] = [route[0]!]
  let s = 0
  for (let guard = 0; guard < 8 * MAZE_CHAIN_MAX_POINTS; guard++) {
    s += (spacingStartM + (spacingEndM - spacingStartM) * (s / total)) * scale
    if (s >= total - 1e-6) break
    pts.push(pointAt(route, cum, s))
  }
  pts.push(route[route.length - 1]!)
  return pts
}

/**
 * Tapered guidance chain: the route resampled at growing spacing with perpendicular waypoint noise that grows with arc
 * length (dense and exact at the start, sparse and unexact deep in the maze). First and last points stay exact; noisy
 * points are reduced (halved, then dropped) when they would come within `MAZE_CHAIN_WALL_CLEAR_M` of a wall box.
 */
export function taperChain(route: V2[], seed: number, boxes?: CourseBox[]): V2[] {
  if (route.length < 2) return route.map((p) => [...p] as V2)
  let scale = 1
  let pts = resample(route, scale)
  for (let attempt = 0; attempt < 8 && pts.length > MAZE_CHAIN_MAX_POINTS; attempt++) {
    scale *= pts.length / (MAZE_CHAIN_MAX_POINTS - 2)
    pts = resample(route, scale)
  }
  const cum = cumulative(pts)
  const total = cum[pts.length - 1]!
  const rng = createRng((seed * 2246822519 + 0x9e3779b9) >>> 0)
  const polys = boxes?.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))
  const { noiseStartM, noiseEndM } = MAZE_TRAIN_TAPER
  const round = (v: number) => Math.round(v * 1000) / 1000
  const out: V2[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const base = pts[i]!
    const amp = noiseStartM + (noiseEndM - noiseStartM) * (cum[i]! / total)
    let p = base
    if (amp > 0) {
      const a = pts[i - 1]!
      const b = pts[i + 1]!
      let dx = b[0] - a[0]
      let dz = b[1] - a[1]
      const l = Math.hypot(dx, dz) || 1
      dx /= l
      dz /= l
      const nx = -dz
      const nz = dx
      let mag = (rng.next() * 2 - 1) * amp
      for (let k = 0; k < 5; k++) {
        const cand: V2 = [base[0] + nx * mag, base[1] + nz * mag]
        if (!polys || polys.every((poly) => pointPolyGap(cand[0], cand[1], poly) >= MAZE_CHAIN_WALL_CLEAR_M)) {
          p = cand
          break
        }
        mag /= 2
      }
    }
    out.push([round(p[0]), round(p[1])])
  }
  out.push(pts[pts.length - 1]!)
  return out
}

/** Course + all training routes + their tapered chains of one training maze (deterministic in the seed). */
export interface MazeTrainingSetup {
  course: Course
  routes: MazeRoute[]
  /** chains[i] = taperChain(routes[i].route, spec.seed * 31 + i, course.boxes): one chain per route, deterministic per route */
  chains: V2[][]
}

export function mazeTrainingRoutes(spec: MazeTrainingWorldSpec): MazeTrainingSetup {
  const course = buildCourse('maze', spec.seed)
  const routes = mazeRoutes(course, spec.seed)
  const chains = routes.map((r, i) => taperChain(r.route, spec.seed * 31 + i, course.boxes))
  return { course, routes, chains }
}

// --- in-world scoring stage ---------------------------------------------------------------------------------------------------------

/** Transformer id base of the per-car score stages (attached to each car, priority 6: after the drive stage, before the car2 actuator): `<base><copy index>`. */
export const MAZE_SCORE_STAGE_BASE = 'maze_score_'
/** Entity id prefix of the per-copy goal slabs (one per route, floating at the route end): `<prefix><copy index>`. */
export const MAZE_GOAL_PREFIX = 'maze_goal_'
/** Score stage id of maze copy i. */
export const mazeScoreStageId = (i: number) => `${MAZE_SCORE_STAGE_BASE}${i}`
/** Goal slab entity id of maze copy i. */
export const mazeGoalId = (i: number) => `${MAZE_GOAL_PREFIX}${i}`
/** Car entity id of maze copy i (one car per route copy, like policy_chains_maze: one car per chain). */
export const mazeCarId = (i: number) => `${POLICY_CAR_ID}_${i}`
/**
 * The v3 net brakes to a stop ~5-8 m before the chain end (the leg-off margin): a car within this distance of its goal
 * has cleared its route (exporter early-stop + the MAZE_TRAIN_SIM-gated test assertion).
 */
export const MAZE_GOAL_REACH_M = 8
/** Height of the floating goal slabs: above the 6 m walls, the car and the 0.5 m policy rays — nothing ever touches them. */
export const MAZE_GOAL_Y = 9
/** Color of the guidance carrot line (car -> ~8 m ahead on its chain). */
export const MAZE_CARROT_COLOR = '#aa44ff'

/**
 * Custom-transformer code of the per-car score stage (same code string on every car, params differ: `chain` = the own
 * shifted chain, `chains` = ALL shifted chains, `chainColors` = per-chain [start, end] color pairs, `cars` = all car
 * entity ids, `idx` = the own copy index, `hud` = only car 0 writes the HUD score). Monotone arc-length progress along
 * the own tapered chain (1 pt / m, never backwards) plus a speed bonus (up to `bonusRate` pt/s at `vRef`).
 * DRAWING happens only from car 0's stage (api.visualizeLine renders for the entity named by
 * world.debugTargetLineEntityId): every chain in its color pair (forward green -> orange, reversed blue -> orange,
 * y = 0.35) plus one carrot per car (own from input.position at state.s + 8, the others via api.getWorldPosition,
 * nearest chain point + 8 m ahead).
 */
export const MAZE_SCORE_STAGE_CODE = `function transform(input, dt, params, state, api) {
  var ch = params.chain
  var n = ch.length
  if (!state.cum) {
    state.cum = [0]
    for (var q = 1; q < n; q++) state.cum.push(state.cum[q - 1] + Math.hypot(ch[q][0] - ch[q - 1][0], ch[q][1] - ch[q - 1][1]))
    state.s = 0
    state.bonus = 0
    state.seg = 0
  }
  var total = state.cum[n - 1]
  var px = input.position[0], pz = input.position[2]
  var bestD = Infinity, bestS = state.s, bestSeg = state.seg
  for (var i = Math.max(0, state.seg - 2); i <= Math.min(n - 2, state.seg + 3); i++) {
    var ax = ch[i][0], az = ch[i][1]
    var dx = ch[i + 1][0] - ax, dz = ch[i + 1][1] - az
    var len2 = dx * dx + dz * dz || 1
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    var d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
    if (d < bestD) {
      bestD = d
      bestS = state.cum[i] + t * Math.sqrt(len2)
      bestSeg = i
    }
  }
  state.seg = bestSeg
  if (bestS > state.s) state.s = bestS
  var vRef = params.vRef || 20
  var v = Math.min(Math.hypot(input.velocity[0], input.velocity[2]), vRef)
  state.bonus += (v / vRef) * dt * (params.bonusRate || 5)
  var score = Math.floor(state.s + state.bonus)
  if (params.hud) api.setScore(score)
  api.watch('maze.score', score + ' pts')
  api.watch('maze.prog', state.s.toFixed(1) + ' / ' + total.toFixed(0) + ' m')
  api.watch('maze.speed', v.toFixed(1) + ' m/s')
  if (params.hud) {
    function hexChannel(h, k) {
      return parseInt(h.slice(1 + k * 2, 3 + k * 2), 16)
    }
    function hexLerp(a, b, t) {
      var out = '#'
      for (var k = 0; k < 3; k++) {
        var va = hexChannel(a, k), vb = hexChannel(b, k)
        var vv = Math.round(va + (vb - va) * t)
        out += (vv < 16 ? '0' : '') + vv.toString(16)
      }
      return out
    }
    if (!state.cums) {
      state.cums = []
      for (var c = 0; c < params.chains.length; c++) {
        var chC = params.chains[c]
        var cumC = [0]
        for (var q2 = 1; q2 < chC.length; q2++) cumC.push(cumC[q2 - 1] + Math.hypot(chC[q2][0] - chC[q2 - 1][0], chC[q2][1] - chC[q2 - 1][1]))
        state.cums.push(cumC)
      }
    }
    function chainPoint(ch2, cum2, s2) {
      var i2 = 0
      while (i2 < ch2.length - 2 && cum2[i2 + 1] < s2) i2++
      var t2 = (s2 - cum2[i2]) / (cum2[i2 + 1] - cum2[i2] || 1)
      return [ch2[i2][0] + (ch2[i2 + 1][0] - ch2[i2][0]) * t2, ch2[i2][1] + (ch2[i2 + 1][1] - ch2[i2][1]) * t2]
    }
    for (var k2 = 0; k2 < params.chains.length; k2++) {
      var chK = params.chains[k2], colK = params.chainColors[k2] || ['#44ff77', '#ffaa44']
      for (var s3 = 0; s3 < chK.length - 1; s3++) {
        api.visualizeLine([chK[s3][0], 0.35, chK[s3][1]], [chK[s3 + 1][0], 0.35, chK[s3 + 1][1]], hexLerp(colK[0], colK[1], chK.length > 2 ? s3 / (chK.length - 2) : 0))
      }
    }
    for (var k3 = 0; k3 < params.cars.length; k3++) {
      var fx = px, fz = pz, arc = 0
      if (k3 === params.idx) {
        arc = Math.min(state.s + 8, total)
      } else {
        var w = api.getWorldPosition(params.cars[k3])
        if (!w) continue
        fx = w[0]
        fz = w[2]
        var chW = params.chains[k3], cumW = state.cums[k3]
        var bd = Infinity
        for (var i3 = 0; i3 < chW.length - 1; i3++) {
          var ax2 = chW[i3][0], az2 = chW[i3][1]
          var dx2 = chW[i3 + 1][0] - ax2, dz2 = chW[i3 + 1][1] - az2
          var l2 = dx2 * dx2 + dz2 * dz2 || 1
          var t3 = Math.max(0, Math.min(1, ((fx - ax2) * dx2 + (fz - az2) * dz2) / l2))
          var d2 = Math.hypot(fx - (ax2 + t3 * dx2), fz - (az2 + t3 * dz2))
          if (d2 < bd) {
            bd = d2
            arc = cumW[i3] + t3 * Math.sqrt(l2)
          }
        }
        arc = Math.min(arc + 8, cumW[chW.length - 1])
      }
      var tp = chainPoint(params.chains[k3], state.cums[k3], arc)
      api.visualizeLine([fx, 0.35, fz], [tp[0], 0.35, tp[1]], '${MAZE_CARROT_COLOR}')
    }
  }
  return {}
}`

// --- world builder -------------------------------------------------------------------------------------------------------------------

/**
 * One playable maze training world: one copy of the maze per training route (copy i at x = i * MAZE_TRAIN_ROUTES.spacingM,
 * like policy_chains_maze: one setup copy per chain), the shipped v3 policy driving every copy on its own tapered
 * guidance chain, one score stage per car (car 0 also draws every chain + one carrot per car and writes the HUD score).
 * The genome is handed in (the browser bundle must not read shippedPolicyV3.json from disk — the exporter and the
 * tests pass `shippedGenomeV3()`).
 */
export function buildMazeTrainingWorld(spec: MazeTrainingWorldSpec, genome?: number[]): RennWorld {
  if (!genome || genome.length === 0) throw new Error('buildMazeTrainingWorld: pass the v3 genome (shippedGenomeV3() on the exporter/test side)')
  const { course, routes, chains } = mazeTrainingRoutes(spec)
  const spacing = MAZE_TRAIN_ROUTES.spacingM
  const carIds = routes.map((_, i) => mazeCarId(i))
  const chainsShifted: V2[][] = chains.map((ch, i) => ch.map((p) => [p[0] + i * spacing, p[1]] as V2))
  const chainColors = routes.map((r) =>
    r.reversed ? [MAZE_TRAIN_CHAIN_COLORS_REVERSED.start, MAZE_TRAIN_CHAIN_COLORS_REVERSED.end] : [MAZE_TRAIN_CHAIN_COLORS.start, MAZE_TRAIN_CHAIN_COLORS.end],
  )
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  routes.forEach((route, i) => {
    const courseI = { ...course, startAt: route.startAt, startYawDeg: route.startYawDeg }
    const parts = policyCourseParts(courseI, genome, {
      origin: [i * spacing, 0],
      suffix: `_${i}`,
      chain: chains[i]!,
      cmd: MAZE_TRAIN_CMD as CmdConfig,
      legEnds: [chains[i]!.length - 1],
      offM: 8,
      v3: true,
    })
    const car = parts.entities[0] as { transformers: string[] }
    car.transformers = [...car.transformers, mazeScoreStageId(i)]
    entities.push(...parts.entities)
    Object.assign(transformers, parts.transformers)
    const routeEnd = route.route[route.route.length - 1]!
    entities.push({
      id: mazeGoalId(i),
      name: `Maze goal ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: 4, height: 0.3, depth: 4 },
      position: [routeEnd[0] + i * spacing, MAZE_GOAL_Y, routeEnd[1]],
      rotation: [0, 0, 0],
      material: { color: [0.15, 0.9, 0.3] },
    })
  })
  routes.forEach((_, i) => {
    transformers[mazeScoreStageId(i)] = {
      type: 'custom',
      priority: 6,
      enabled: true,
      name: 'Maze score',
      code: MAZE_SCORE_STAGE_CODE,
      params: {
        chain: chainsShifted[i]!,
        chains: chainsShifted,
        chainColors,
        cars: carIds,
        idx: i,
        hud: i === 0,
        vRef: MAZE_TRAIN_SCORE.vRef,
        bonusRate: MAZE_TRAIN_SCORE.bonusRate,
      },
    }
  })
  return {
    version: '1.0',
    world: {
      gravity: [0, -100, 0],
      distanceCulling: false,
      ambientLight: [0.45, 0.45, 0.5],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
      skyColor: [0.35, 0.5, 0.75],
      camera: { control: 'follow', mode: 'thirdPerson', target: carIds[0]!, distance: 35, height: 22, cameraTargetLag: 120, cameraPositionLag: 180 },
      debugTargetLineEntityId: carIds[0]!,
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

/** meta.json of one training maze (the dialog cards read it next to world.json). */
export function mazeTrainingMeta(spec: MazeTrainingWorldSpec, routes: MazeRoute[], bestScore: number | null): MazeTrainingMeta {
  const primary = routes[0]!
  const chain = taperChain(primary.route, spec.seed * 31, buildCourse('maze', spec.seed).boxes)
  let lengthM = 0
  for (let i = 1; i < chain.length; i++) lengthM += Math.hypot(chain[i]![0] - chain[i - 1]![0], chain[i]![1] - chain[i - 1]![1])
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate: { policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shippedPolicyV3.json' },
    bestScore,
    chain: { points: chain.length, lengthM: Math.round(lengthM * 10) / 10 },
    routes: { forward: routes.filter((r) => !r.reversed).length, reversed: routes.filter((r) => r.reversed).length },
  }
}
