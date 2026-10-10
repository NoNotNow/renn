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
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { buildCourse, type Course, type CourseBox } from './courses'
import { POLICY_GROUND, policyCourseParts, type CmdConfig } from './episode'

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
  /** best headless score of the candidate on this maze (points = vector path + speed bonus); null until measured */
  bestScore: number | null
  /** stats of the tapered guidance chain */
  chain: { points: number; lengthM: number }
}

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

export type MazeTrainingBuildFn = (spec: MazeTrainingWorldSpec) => RennWorld

// --- route + tapered guidance chain (pure, browser-safe) ---------------------------------------------------------------------------

/** Hard cap of chain points (visualizeLine renders at most 200 entries per frame: n-1 segments + 1 carrot line). */
export const MAZE_CHAIN_MAX_POINTS = 80
/** Noisy chain points must keep at least this distance to every course wall box (m). */
export const MAZE_CHAIN_WALL_CLEAR_M = 1.5

/** The true route polyline of a course: start + waypoints, in world coords. */
export function mazeRoute(course: Course): V2[] {
  return [[...(course.startAt ?? [0, 0])] as V2, ...course.waypoints]
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

/** Course + route + tapered chain of one training maze (deterministic in the seed). */
export function mazeTrainingChain(spec: MazeTrainingWorldSpec): { course: Course; route: V2[]; chain: V2[] } {
  const course = buildCourse('maze', spec.seed)
  const route = mazeRoute(course)
  return { course, route, chain: taperChain(route, spec.seed, course.boxes) }
}

// --- in-world scoring stage ---------------------------------------------------------------------------------------------------------

/** Transformer id of the score stage (attached to the car, priority 6: after the drive stage, before the car2 actuator). */
export const MAZE_SCORE_STAGE_ID = 'maze_score_0'
/** Entity id of the goal slab above the route end. */
export const MAZE_GOAL_ID = 'maze_goal'
/**
 * The v3 net brakes to a stop ~5-8 m before the chain end (the leg-off margin): a car within this distance of the
 * goal has cleared the maze (exporter early-stop + the MAZE_TRAIN_SIM-gated test assertion).
 */
export const MAZE_GOAL_REACH_M = 8
/** Height of the floating goal slab: above the 6 m walls, the car and the 0.5 m policy rays — nothing ever touches it. */
export const MAZE_GOAL_Y = 9
/** Color of the guidance carrot line (car -> ~8 m ahead on the chain). */
export const MAZE_CARROT_COLOR = '#aa44ff'

/**
 * Custom-transformer code of the score stage on the car. Monotone arc-length progress along the tapered chain
 * (1 pt / m, never backwards) plus a speed bonus (up to `bonusRate` pt/s at `vRef`), drawn every frame:
 * the chain (green -> orange along its length) and the carrot line at y = 0.35 via `api.visualizeLine`.
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
  api.setScore(score)
  api.watch('maze.score', score + ' pts')
  api.watch('maze.prog', state.s.toFixed(1) + ' / ' + total.toFixed(0) + ' m')
  api.watch('maze.speed', v.toFixed(1) + ' m/s')
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
  var colA = params.colStart || '#44ff77'
  var colB = params.colEnd || '#ffaa44'
  for (var s2 = 0; s2 < n - 1; s2++) {
    api.visualizeLine([ch[s2][0], 0.35, ch[s2][1]], [ch[s2 + 1][0], 0.35, ch[s2 + 1][1]], hexLerp(colA, colB, n > 2 ? s2 / (n - 2) : 0))
  }
  var ca = Math.min(state.s + 8, total)
  var ci = 0
  while (ci < n - 2 && state.cum[ci + 1] < ca) ci++
  var tt = (ca - state.cum[ci]) / (state.cum[ci + 1] - state.cum[ci] || 1)
  api.visualizeLine([px, 0.35, pz], [ch[ci][0] + (ch[ci + 1][0] - ch[ci][0]) * tt, 0.35, ch[ci][1] + (ch[ci + 1][1] - ch[ci][1]) * tt], '${MAZE_CARROT_COLOR}')
  return {}
}`

// --- world builder -------------------------------------------------------------------------------------------------------------------

/**
 * One playable maze training world: the shipped v3 policy drives the maze on the tapered guidance chain, the score
 * stage scores progress + speed and draws the chain. The genome is handed in (the browser bundle must not read
 * shippedPolicyV3.json from disk — the exporter and the tests pass `shippedGenomeV3()`).
 */
export function buildMazeTrainingWorld(spec: MazeTrainingWorldSpec, genome?: number[]): RennWorld {
  if (!genome || genome.length === 0) throw new Error('buildMazeTrainingWorld: pass the v3 genome (shippedGenomeV3() on the exporter/test side)')
  const { course, route, chain } = mazeTrainingChain(spec)
  const parts = policyCourseParts(course, genome, { chain, cmd: MAZE_TRAIN_CMD as CmdConfig, legEnds: [chain.length - 1], offM: 8, v3: true })
  const car = parts.entities[0] as { transformers: string[] }
  car.transformers = [...car.transformers, MAZE_SCORE_STAGE_ID]
  const routeEnd = route[route.length - 1]!
  const goal = {
    id: MAZE_GOAL_ID,
    name: 'Maze goal',
    bodyType: 'static',
    shape: { type: 'box', width: 4, height: 0.3, depth: 4 },
    position: [routeEnd[0], MAZE_GOAL_Y, routeEnd[1]],
    rotation: [0, 0, 0],
    material: { color: [0.15, 0.9, 0.3] },
  }
  const transformers = {
    ...parts.transformers,
    [MAZE_SCORE_STAGE_ID]: {
      type: 'custom',
      priority: 6,
      enabled: true,
      name: 'Maze score',
      code: MAZE_SCORE_STAGE_CODE,
      params: {
        chain,
        vRef: MAZE_TRAIN_SCORE.vRef,
        bonusRate: MAZE_TRAIN_SCORE.bonusRate,
        colStart: MAZE_TRAIN_CHAIN_COLORS.start,
        colEnd: MAZE_TRAIN_CHAIN_COLORS.end,
      },
    },
  }
  return {
    version: '1.0',
    world: {
      gravity: [0, -100, 0],
      distanceCulling: false,
      ambientLight: [0.45, 0.45, 0.5],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
      skyColor: [0.35, 0.5, 0.75],
      camera: { control: 'follow', mode: 'thirdPerson', target: parts.carId, distance: 35, height: 22, cameraTargetLag: 120, cameraPositionLag: 180 },
      debugTargetLineEntityId: parts.carId,
    },
    transformers,
    entities: [POLICY_GROUND, ...parts.entities, goal],
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

/** meta.json of one training maze (the dialog cards read it next to world.json). */
export function mazeTrainingMeta(spec: MazeTrainingWorldSpec, chain: V2[], bestScore: number | null): MazeTrainingMeta {
  let lengthM = 0
  for (let i = 1; i < chain.length; i++) lengthM += Math.hypot(chain[i]![0] - chain[i - 1]![0], chain[i]![1] - chain[i - 1]![1])
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate: { policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shippedPolicyV3.json' },
    bestScore,
    chain: { points: chain.length, lengthM: Math.round(lengthM * 10) / 10 },
  }
}
