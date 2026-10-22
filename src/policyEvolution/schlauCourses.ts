/**
 * Seeded goal tasks for the "schlau" training (2026-10-21): a second self-driving car trained on tasks that have only
 * a START point and a GOAL point — no waypoint chains, no carrots (see schlauPolicy.ts for the net). The score is the
 * reduction of the SHORTEST DRIVABLE distance from the car's nose to the goal (schlauScore.ts), so every task must
 * guarantee that a drivable route exists; `goal_box` therefore rejection-samples its obstacles against a local
 * reachability check. Computations stay SIMPLE (a 1 m grid).
 *  - `goal_open`: free/open ground — NO obstacles, NO fence. Start at the origin, startYawDeg seeded in [-40, 40] deg,
 *    the goal 60-140 m out in a seeded random direction.
 *  - `goal_box`: a big FENCED box (a "Kasten" — a closed arena, so cheating / driving around is impossible) with seeded
 *    STATIC obstacle boxes inside. Arena half-size 60 m: 4 walls, 2 m thick, centred at +/-61 (inner faces at +/-60).
 *    Start seeded within +/-35 m on both axes, goal at 50-110 m euclidean distance from the start, both at least 10 m
 *    away from the inner walls. Obstacles: the GUARANTEED CROSSING WALL (user decision 2026-10-23: the direct
 *    start -> goal line MUST cross at least one obstacle — before it only MAY) — a simple wall (12-14 m long, 4 m
 *    thick) centred ON the direct line, perpendicular to it, rejection-checked like every obstacle — plus 3-8
 *    sampled boxes (4-14 m per axis, random yaw 0-180, up to 40 attempts per box): a box
 *    is kept only with > 7 m clearance to the start hull (the car hull 4 x 8 m) and to the
 *    goal AND while the goal stays REACHABLE from the start with car-width clearance (a local BFS on a 1 m grid over
 *    the arena, obstacles inflated by 2.5 m = car half width 2 m + 0.5 m margin; 4-connected flood fill, reachable =
 *    the goal cell reached). The direct start -> goal line crossing an obstacle is the point of the task.
 * The rng is re-seeded by the VARIANT (`seed * 2654435761 + SCHLAU_KIND_SALT[kind] + variant * 2246822519`), so a
 * per-generation variant rotation re-jitters the whole world itself. Variant >= 1 additionally jitters the start pose
 * by +/-4 m / +/-15 deg (the hull is re-checked against every box; the canonical start is the fallback after 12 unclear
 * attempts). The goal never moves.
 */
import { createRng, type Rng } from '@/avEvolution/core/rng'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { CourseBox } from './courses'

/** The schlau task kinds: `goal_open` (free ground) and `goal_box` (fenced arena with obstacles). */
export const SCHLAU_KINDS = ['goal_open', 'goal_box'] as const
export type SchlauKind = (typeof SCHLAU_KINDS)[number]

/** One schlau task: a start pose, a goal point and the static boxes (the 4 arena walls of `goal_box` are part of `boxes`). */
export interface SchlauTask {
  key: string
  kind: SchlauKind
  seed: number
  variant: number
  boxes: CourseBox[]
  start: V2
  goal: V2
  /** car heading at the start in degrees (0 = -Z, positive turns left) */
  startYawDeg: number
  /** euclidean start -> goal distance (m) */
  distM: number
}

/** Per-kind rng salt (mixed into the seed: `seed * 2654435761 + SCHLAU_KIND_SALT[kind] + variant * 2246822519`). */
export const SCHLAU_KIND_SALT: Record<SchlauKind, number> = { goal_open: 15485867, goal_box: 32452847 }

const SCHLAU_KEY_RE = new RegExp(`^(${SCHLAU_KINDS.join('|')}):(\\d+)(?:~(\\d+))?$`)

/** `kind:seed` = canonical start pose; `kind:seed~n` (n >= 1) = the re-seeded world with a jittered start pose. */
export function schlauKey(kind: SchlauKind, seed: number, variant = 0): string {
  return `${kind}:${seed}${variant > 0 ? `~${variant}` : ''}`
}

/** Parses `kind:seed` / `kind:seed~variant`; throws on bad keys. */
export function parseSchlauKey(key: string): { kind: SchlauKind; seed: number; variant: number } {
  const m = SCHLAU_KEY_RE.exec(key)
  if (!m) throw new Error(`bad schlau key: ${key}`)
  return { kind: m[1] as SchlauKind, seed: Number(m[2]), variant: m[3] === undefined ? 0 : Number(m[3]) }
}

const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next()

/** car hull: 4 m across, 8 m along (half width 2 m) */
const CAR_W = 4
const CAR_L = 8
/** arena half-size of `goal_box` (m): the 4 walls stand centred at +/-61, inner faces at +/-60 */
const ARENA_HALF = 60
/** wall thickness (m) */
const WALL_T = 2
/** reachability grid: 1 m cells over the arena, integer centres -ARENA_HALF..ARENA_HALF */
const GRID_N = 2 * ARENA_HALF + 1
/** reachability inflation (m): car half width 2 m + 0.5 m margin */
const INFLATE_M = 2.5
/** obstacle acceptance clearance (m): start hull and goal to every box */
const CLEAR_M = 7
/** start-pose jitter of variant >= 1: +/-4 m, +/-15 deg, up to 12 attempts before the canonical-start fallback */
const JITTER_M = 4
const JITTER_DEG = 15
const JITTER_ATTEMPTS = 12
/** obstacle boxes of a `goal_box` task: the guaranteed crossing wall + 3-8 sampled, 4-14 m per axis, up to 40 rejection attempts per sampled box */
const OBSTACLE_MIN = 3
const OBSTACLE_SPAN = 6
const BOX_MIN = 4
const BOX_MAX = 14
const BOX_ATTEMPTS = 40
/** the guaranteed crossing wall (user decision 2026-10-23): 12-14 m long, 4 m thick, centred ON the direct start -> goal line, perpendicular to it; up to 40 rejection attempts */
const CROSS_WALL_MIN = 12
const CROSS_WALL_MAX = 14
const CROSS_WALL_T = 4
const CROSS_WALL_ATTEMPTS = 40

const boxPoly = (b: CourseBox): V2[] => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])

/**
 * Does the direct start -> goal segment CROSS the box (enter its rect)? polyGap of the segment and the box poly is
 * exact for convex polys — 0 (with overlap) means the line passes through (an exact touch reads 0 too and counts).
 */
const crossesBox = (b: CourseBox, start: V2, goal: V2): boolean => polyGap([start, goal], boxPoly(b)) === 0

/**
 * Does the direct start -> goal segment cross at least one of the boxes? The `goal_box` generator GUARANTEES this
 * (the crossing wall, user decision 2026-10-23); the start-pose jitter of variants >= 1 rejects jitters that lose
 * the crossing (the canonical start is the fallback).
 */
export const schlauLineCrosses = (boxes: readonly CourseBox[], start: V2, goal: V2): boolean =>
  boxes.some((b) => crossesBox(b, start, goal))

/**
 * Gap (m) between two convex polys: pointPolyGap of every corner, both ways. Equals polyGap while the polys are
 * disjoint; for the 4x8 car hull any overlap puts a hull corner within ~4.5 m of the box, so an overlap never
 * reads above CLEAR_M and the > CLEAR_M acceptance below implies a true clearance > CLEAR_M.
 */
const cornerGap = (a: V2[], b: V2[]): number => {
  let best = Infinity
  for (const [p, q] of [[a, b], [b, a]] as const) for (const v of p) best = Math.min(best, pointPolyGap(v[0], v[1], q))
  return best
}

/** Marks the grid cells whose centre lies within INFLATE_M of the box (the inflated obstacle). */
const blockCells = (b: CourseBox, out: Uint8Array): void => {
  const poly = boxPoly(b)
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [px, pz] of poly) {
    if (px < x0) x0 = px
    if (px > x1) x1 = px
    if (pz < z0) z0 = pz
    if (pz > z1) z1 = pz
  }
  for (let z = Math.max(-ARENA_HALF, Math.ceil(z0 - INFLATE_M)); z <= Math.min(ARENA_HALF, Math.floor(z1 + INFLATE_M)); z++)
    for (let x = Math.max(-ARENA_HALF, Math.ceil(x0 - INFLATE_M)); x <= Math.min(ARENA_HALF, Math.floor(x1 + INFLATE_M)); x++)
      if (pointPolyGap(x, z, poly) <= INFLATE_M) out[(z + ARENA_HALF) * GRID_N + (x + ARENA_HALF)] = 1
}

/** Local reachability check: 4-connected flood fill on the 1 m grid over the arena (obstacles inflated by INFLATE_M) — is the goal cell reached from the start cell? */
const goalReachable = (blocked: Uint8Array, start: V2, goal: V2): boolean => {
  const cell = (p: V2) => {
    const x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, Math.round(p[0])))
    const z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, Math.round(p[1])))
    return (z + ARENA_HALF) * GRID_N + (x + ARENA_HALF)
  }
  const from = cell(start)
  const to = cell(goal)
  if (blocked[from] || blocked[to]) return false
  const seen = new Uint8Array(blocked.length)
  const queue: number[] = [from]
  seen[from] = 1
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]
    if (c === to) return true
    const cx = (c % GRID_N) - ARENA_HALF
    const cz = Math.floor(c / GRID_N) - ARENA_HALF
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < -ARENA_HALF || nx > ARENA_HALF || nz < -ARENA_HALF || nz > ARENA_HALF) continue
      const n = (nz + ARENA_HALF) * GRID_N + (nx + ARENA_HALF)
      if (blocked[n] || seen[n]) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  return false
}

type SchlauBody = { boxes: CourseBox[]; start: V2; goal: V2; startYawDeg: number }

/** `goal_open` body: free ground — start at the origin, seeded yaw in [-40, 40] deg, the goal 60-140 m out in a seeded random direction. No boxes. */
const goalOpenBody = (rng: Rng): SchlauBody => {
  const startYawDeg = range(rng, -40, 40)
  const dist = range(rng, 60, 140)
  const a = range(rng, 0, 2 * Math.PI)
  return { boxes: [], start: [0, 0], goal: [dist * Math.cos(a), dist * Math.sin(a)], startYawDeg }
}

/** `goal_box` body: the fenced arena (4 walls, inner faces at +/-60) with the guaranteed crossing wall on the direct start -> goal line plus 3-8 rejection-sampled obstacle boxes; start within +/-35 m per axis, goal 50-110 m out, both >= 10 m off the inner walls. */
const goalBoxBody = (rng: Rng): SchlauBody => {
  const boxes: CourseBox[] = [
    { at: [0, ARENA_HALF + WALL_T / 2], size: [2 * (ARENA_HALF + WALL_T), WALL_T], yawDeg: 0 },
    { at: [0, -(ARENA_HALF + WALL_T / 2)], size: [2 * (ARENA_HALF + WALL_T), WALL_T], yawDeg: 0 },
    { at: [ARENA_HALF + WALL_T / 2, 0], size: [WALL_T, 2 * (ARENA_HALF + WALL_T)], yawDeg: 0 },
    { at: [-(ARENA_HALF + WALL_T / 2), 0], size: [WALL_T, 2 * (ARENA_HALF + WALL_T)], yawDeg: 0 },
  ]
  const start: V2 = [range(rng, -35, 35), range(rng, -35, 35)]
  const startYawDeg = range(rng, -40, 40)
  // goal: 50-110 m from the start, >= 10 m off the inner walls (|x|, |z| <= 50); rejection-sampled, with a
  // constructive fallback (toward the farthest arena corner — the square is convex, so the whole segment stays inside)
  let goal: V2 = [0, 0]
  let placed = false
  for (let attempt = 0; attempt < 200 && !placed; attempt++) {
    const d = range(rng, 50, 110)
    const a = range(rng, 0, 2 * Math.PI)
    const g: V2 = [start[0] + d * Math.cos(a), start[1] + d * Math.sin(a)]
    if (Math.abs(g[0]) <= ARENA_HALF - 10 && Math.abs(g[1]) <= ARENA_HALF - 10) {
      goal = g
      placed = true
    }
  }
  if (!placed) {
    const corner: V2 = [start[0] < 0 ? 50 : -50, start[1] < 0 ? 50 : -50]
    const dc = Math.hypot(corner[0] - start[0], corner[1] - start[1])
    const dg = Math.min(80, 0.9 * dc)
    goal = [start[0] + (dg / dc) * (corner[0] - start[0]), start[1] + (dg / dc) * (corner[1] - start[1])]
  }
  // the GUARANTEED CROSSING WALL (user decision 2026-10-23): the direct start -> goal line MUST cross at least one
  // obstacle. A simple wall centred ON the line, perpendicular to it — the car has to drive around one of its ends.
  // Same acceptance as every obstacle: > CLEAR_M off the start hull and the goal, the goal still reachable.
  const hull = rectPoly(start[0], start[1], (startYawDeg * Math.PI) / 180, CAR_W, CAR_L)
  const blocked = new Uint8Array(GRID_N * GRID_N)
  for (const w of boxes) blockCells(w, blocked)
  const lineDeg = (Math.atan2(goal[1] - start[1], goal[0] - start[0]) * 180) / Math.PI
  for (let attempt = 0; attempt < CROSS_WALL_ATTEMPTS; attempt++) {
    const len = range(rng, CROSS_WALL_MIN, CROSS_WALL_MAX)
    const f = range(rng, 0.3, 0.7)
    const at: V2 = [start[0] + (goal[0] - start[0]) * f, start[1] + (goal[1] - start[1]) * f]
    const yawDeg = (((lineDeg + 90) % 180) + 180) % 180
    const wall: CourseBox = { at, size: [len, CROSS_WALL_T], yawDeg }
    const poly = boxPoly(wall)
    if (cornerGap(hull, poly) <= CLEAR_M) continue
    if (pointPolyGap(goal[0], goal[1], poly) <= CLEAR_M) continue
    const trial = blocked.slice()
    blockCells(wall, trial)
    if (!goalReachable(trial, start, goal)) continue
    boxes.push(wall)
    blockCells(wall, blocked)
    break
  }
  // obstacles: the crossing wall plus 3-8 sampled boxes (4-14 m per axis, yaw 0-180), rejection-sampled — kept
  // only with > CLEAR_M hull / goal clearance AND with the goal still reachable (car-width clearance) from the start
  const target = OBSTACLE_MIN + Math.floor(rng.next() * OBSTACLE_SPAN)
  for (let i = 0; i < target; i++) {
    for (let attempt = 0; attempt < BOX_ATTEMPTS; attempt++) {
      const sx = range(rng, BOX_MIN, BOX_MAX)
      const sz = range(rng, BOX_MIN, BOX_MAX)
      const yawDeg = range(rng, 0, 180)
      // corners stay within the half diagonal of the centre: the centre range keeps the whole box inside the inner arena
      const hd = Math.hypot(sx, sz) / 2
      const at: V2 = [range(rng, hd - ARENA_HALF, ARENA_HALF - hd), range(rng, hd - ARENA_HALF, ARENA_HALF - hd)]
      const box: CourseBox = { at, size: [sx, sz], yawDeg }
      const poly = boxPoly(box)
      if (cornerGap(hull, poly) <= CLEAR_M) continue
      if (pointPolyGap(goal[0], goal[1], poly) <= CLEAR_M) continue
      const trial = blocked.slice()
      blockCells(box, trial)
      if (!goalReachable(trial, start, goal)) continue
      boxes.push(box)
      blockCells(box, blocked)
      break
    }
  }
  return { boxes, start, goal, startYawDeg }
}

/**
 * Seeded start-pose jitter for variant >= 1 (+/-4 m, +/-15 deg); the hull is re-checked against every box and — for
 * `goal_box` — the jitter must keep the direct start -> goal line crossing an obstacle (the generator's guarantee,
 * user decision 2026-10-23); the canonical start is the fallback after 12 unclear attempts. The goal never moves.
 */
const jitterStart = (rng: Rng, boxes: readonly CourseBox[], start: V2, startYawDeg: number, goal: V2): { start: V2; startYawDeg: number } => {
  for (let attempt = 0; attempt < JITTER_ATTEMPTS; attempt++) {
    const at: V2 = [start[0] + range(rng, -JITTER_M, JITTER_M), start[1] + range(rng, -JITTER_M, JITTER_M)]
    const yaw = startYawDeg + range(rng, -JITTER_DEG, JITTER_DEG)
    const hull = rectPoly(at[0], at[1], (yaw * Math.PI) / 180, CAR_W, CAR_L)
    if (boxes.every((b) => cornerGap(hull, boxPoly(b)) > 0.5) && (boxes.length === 0 || schlauLineCrosses(boxes, at, goal))) return { start: at, startYawDeg: yaw }
  }
  return { start, startYawDeg }
}

/** Builds the seeded task of `kind`:seed(~variant). Deterministic per key. */
export function buildSchlauTask(kind: SchlauKind, seed: number, variant = 0): SchlauTask {
  const rng = createRng((seed * 2654435761 + SCHLAU_KIND_SALT[kind] + variant * 2246822519) >>> 0)
  const body = kind === 'goal_open' ? goalOpenBody(rng) : goalBoxBody(rng)
  const pose = variant >= 1 ? jitterStart(rng, body.boxes, body.start, body.startYawDeg, body.goal) : { start: body.start, startYawDeg: body.startYawDeg }
  return {
    key: schlauKey(kind, seed, variant),
    kind,
    seed,
    variant,
    boxes: body.boxes,
    start: pose.start,
    goal: body.goal,
    startYawDeg: pose.startYawDeg,
    distM: Math.hypot(body.goal[0] - pose.start[0], body.goal[1] - pose.start[1]),
  }
}

/** TRAIN band: canonical start poses (variant 0), `perKind` seeds per kind from `firstSeed`. */
export function schlauTrainKeys(perKind = 8, kinds: readonly SchlauKind[] = SCHLAU_KINDS, firstSeed = 1): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(schlauKey(k, firstSeed + i))
  return keys
}

/** HOLDOUT band: start variant `variant` (default 1 — jittered start pose), `perKind` seeds per kind from `firstSeed` (default 1001, never in TRAIN). */
export function schlauHoldoutKeys(perKind = 5, kinds: readonly SchlauKind[] = SCHLAU_KINDS, variant = 1, firstSeed = 1001): string[] {
  const keys: string[] = []
  for (let i = 0; i < perKind; i++) for (const k of kinds) keys.push(schlauKey(k, firstSeed + i, variant))
  return keys
}
