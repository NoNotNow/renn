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
 *  - `goal_wall` (Auftrag C, the dedicated wall runs): the same fenced arena, but the goal sits BEHIND a long
 *    interior SEPARATING WALL — 40-70 m long, 4 m thick, perpendicular to the direct start -> goal line, centred
 *    ON it — so the direct line crosses it and the car must drive around one of its ends ("WF Blockade" style).
 *    Every wall corner keeps >= 8 m off the inner arena walls (a drivable corridor around EACH end — never a dead
 *    blockade, the WF lesson of feature-policy-evolution.md), and the same 2.5 m reachability BFS accepts it.
 *    0-3 extra corridor walls (10-24 m, 3 m thick, random yaw) join with the same rejection loop as the goal_box
 *    obstacles. Same start / goal bands as `goal_box` (start +/-35 m per axis, goal 50-110 m out).
 * The rng is re-seeded by the VARIANT (`seed * 2654435761 + SCHLAU_KIND_SALT[kind] + variant * 2246822519`), so a
 * per-generation variant rotation re-jitters the whole world itself. Variant >= 1 additionally jitters the start pose
 * by +/-4 m / +/-15 deg (the hull is re-checked against every box; the canonical start is the fallback after 12 unclear
 * attempts). The goal never moves.
 */
import { createRng, type Rng } from '@/avEvolution/core/rng'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { CourseBox } from './courses'
import { NOSE_M } from './policy'

/** The schlau task kinds: `goal_open` (free ground), `goal_box` (fenced arena with obstacles) and `goal_wall` (fenced arena whose goal sits behind a long separating wall). */
export const SCHLAU_KINDS = ['goal_open', 'goal_box', 'goal_wall'] as const
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
  /**
   * How the spawn pose was chosen (critique + user notes 2026-10-23): `canonical` = variant 0 / the fallback,
   * `jitter` = the +/-4 m / +/-15 deg pose, `facing` = the head-on back-off pose (nose 10.5-16 m off a box,
   * aimed at it — the spawn keeps the NOSE_CLEAR_M poison floor either way). Informational for tests/audits.
   */
  poseClass: 'canonical' | 'jitter' | 'facing'
}

/** Per-kind rng salt (mixed into the seed: `seed * 2654435761 + SCHLAU_KIND_SALT[kind] + variant * 2246822519`). */
export const SCHLAU_KIND_SALT: Record<SchlauKind, number> = { goal_open: 15485867, goal_box: 32452847, goal_wall: 71522579 }

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
/**
 * The spawn-pose POISON rule (critique 2026-10-23, REPORT.md §4): the scoring grid blocks every cell within
 * INFLATE_M of a box, and runSchlauEpisode reads a blocked cell as an INSTANT offcourse — a PHYSICAL touch is
 * survivable (priced per frame), an inflated-cell contact is not. CLEAR_M measures to the start HULL, so the
 * NOSE (NOSE_M ahead) could sit ~3 m off a box and die at t=0.2 s (goal_box:2 / :5 / 1003~1 / 1004~1 did). Every
 * spawn pose — canonical AND every variant (jitter + facing) — must therefore keep the NOSE >= NOSE_CLEAR_M off
 * every inflated cell, i.e. > INFLATE_M + NOSE_CLEAR_M off every box. This floor is NOT a difficulty axis.
 */
export const NOSE_CLEAR_M = 8
/** start-pose jitter of variant >= 1: +/-4 m, +/-15 deg, up to 12 attempts before the canonical-start fallback */
const JITTER_M = 4
/** facing-pose share of variant >= 1 (user note 2026-10-23 ~02:25): a seeded fraction of the variants place the car HEAD-ON toward the nearest obstacle, nose FACING_CLEAR_MIN..FACING_CLEAR_MAX m off — the back-off lesson (reverse + steer away; the car can reverse, V_REV_MAX 8 m/s) */
const FACING_SHARE = 0.3
/** the faced box's face sits this far (m) off the spawn NOSE: the poison floor (INFLATE_M + NOSE_CLEAR_M, strictly) plus up to 5 m of slack — close enough that the rays see a wall dead ahead, far enough that backing off beats the instant-offcourse band */
const FACING_CLEAR_MIN = INFLATE_M + NOSE_CLEAR_M + 0.5
const FACING_CLEAR_MAX = INFLATE_M + NOSE_CLEAR_M + 5.5
const JITTER_DEG = 15
const JITTER_ATTEMPTS = 12
/** obstacle boxes of a `goal_box` task: the guaranteed crossing wall + 3-8 sampled, 4-14 m per axis, up to 40 rejection attempts per sampled box */
const OBSTACLE_MIN = 3
const OBSTACLE_SPAN = 6
const BOX_MIN = 4
const BOX_MAX = 14
const BOX_ATTEMPTS = 40
/**
 * the guaranteed crossing wall (user decision 2026-10-23): centred ON the direct start -> goal line,
 * perpendicular to it; up to 40 rejection attempts. LENGTH IS THE SEEDED DIFFICULTY AXIS (critique §3/§6:
 * 12-14 m walls are trivially rounded, detour 1.01-1.09 across the whole old train band): 12-14 m at d = 0,
 * 30-36 m at d = 1 — a 30+ m wall on the line forces the 15-18 m lateral swing the old band never had
 * (the goal_box:1003~1 class, detour ~1.32, cloned into the train band by the ramp instead of by accident).
 */
const CROSS_WALL_MIN = 12
const CROSS_WALL_MAX = 14
const CROSS_WALL_T = 4
const CROSS_WALL_ATTEMPTS = 40
const CROSS_WALL_RAMP_MIN = 18
const CROSS_WALL_RAMP_MAX = 22
/**
 * `goal_wall` v2 (user note 2026-10-23 ~02:20): SEALED GATE WALLS — the difficulty-ramped WF-Blockade kind.
 * 1-3 wall LAYERS, each one axis-aligned, perpendicular to the direct start -> goal line's dominant axis, and
 * SEALED from arena wall to arena wall (the segment ends poke to +/-(ARENA_HALF + 1), overlapping the 2 m arena
 * wall bodies) with exactly ONE gate per layer — the gate is the ONLY passage through the plane, by
 * construction (extras can only ADD walls and are reachability-rejected, so they can never open one).
 */
/** gate-wall thickness (m) */
const GATE_WALL_T = 3
/**
 * gate width band (m): w = GATE_MAX_M - (GATE_MAX_M - GATE_FLOOR_M) * d. The FLOOR is 7 m — the narrowest gate
 * the 2.5 m reachability grid reliably passes (2 x 2.5 m inflation + >= 1 m of integer-grid slack + margin);
 * the user-asked 3.5-5 m is BELOW it (no free grid cell exists -> every seed unsolvable under the current
 * scoring machinery; going lower needs lowering SCHLAU_INFLATE_M — human sign-off, see the L2B notes).
 */
const GATE_MAX_M = 14
const GATE_FLOOR_M = 7
/** the difficulty ramp: d = clamp((seed - 1) / RAMP_SEEDS, 0, 1) — the ramp spans the 16-seed TRAIN band exactly (seed 16 -> d ~0.94, the hard 1.3-detour tier lands IN the band, critique §3/§6), so the holdout band (1001+) sits at d = 1 */
const RAMP_SEEDS = 16
/** layer thresholds of the ramp: d >= 0.5 adds the second wall layer, d >= 0.8 the third */
const LAYER_2_D = 0.5
const LAYER_3_D = 0.8
/**
 * Layer-plane placement on the crossing axis: adjacent planes keep PLANE_SEP_M and the start / goal keep
 * PLANE_CLEAR_M. The separation is the load-bearing one — two wall planes closer than 2 x INFLATE_M + wall
 * thickness leave NO free cell between their inflated bands (the first v2 draft sealed its own strip this
 * way, caught by the loud reachability guard on seed 21). PLANE_SEP_M 11 -> a physical gap of 8 m -> a
 * >= 3-row free corridor at 2.5 m inflation, at any alignment.
 */
const PLANE_SEP_M = 11
/** the start / goal keep this far (m) off the outermost wall plane: 2 x wall half thickness + the nose pointing dead ahead (NOSE_M + NOSE_CLEAR_M + INFLATE_M = the poison floor) */
const PLANE_CLEAR_M = 17
/** extra walls: 0..floor(rng * (1 + 3d)) short walls (10-18 m, 3 m thick, random yaw), up to 40 rejection attempts each (same acceptance as the goal_box obstacles) */
const EXTRA_WALL_MIN = 10
const EXTRA_WALL_MAX = 18
const EXTRA_WALL_T = 3
const EXTRA_WALL_ATTEMPTS = 40
/**
 * The explicit difficulty of a seed (user note 2026-10-23: the ramp must be SEEDED, not accidental): d = 0
 * (seed 1) = easy; d ~ 0.94 (seed 16, the last train seed) = the hard tier (a 33 m goal_box crossing wall, a
 * 7.4 m goal_wall gate); d = 1 (seeds >= 17, the whole holdout band) = the maximum. Variant-independent —
 * every variant of a seed shares its d.
 */
export const schlauDifficulty = (seed: number): number => Math.max(0, Math.min(1, (seed - 1) / RAMP_SEEDS))

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

/** The car's NOSE position of a pose (fwd of rotation [0, yaw, 0] is [-sin, -cos]; 0 = -Z, positive turns left). */
const noseOf = (start: V2, startYawDeg: number): V2 => {
  const yawRad = (startYawDeg * Math.PI) / 180
  return [start[0] - Math.sin(yawRad) * NOSE_M, start[1] - Math.cos(yawRad) * NOSE_M]
}

/** The spawn-pose POISON rule: the nose keeps > INFLATE_M + NOSE_CLEAR_M off EVERY box (>= NOSE_CLEAR_M off every inflated scoring cell — a blocked-cell read is an instant offcourse, see NOSE_CLEAR_M). */
const noseClear = (nose: V2, boxes: readonly CourseBox[]): boolean =>
  boxes.every((b) => pointPolyGap(nose[0], nose[1], boxPoly(b)) > INFLATE_M + NOSE_CLEAR_M)

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
const goalBoxBody = (rng: Rng, seed: number): SchlauBody => {
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
  // the SEEDED difficulty of this task (the ramp over the seed; variants share it — same as goal_wall)
  const diff = schlauDifficulty(seed)
  const nose = noseOf(start, startYawDeg)
  for (let attempt = 0; attempt < CROSS_WALL_ATTEMPTS; attempt++) {
    const len = range(rng, CROSS_WALL_MIN + CROSS_WALL_RAMP_MIN * diff, CROSS_WALL_MAX + CROSS_WALL_RAMP_MAX * diff)
    const f = range(rng, 0.3, 0.7)
    const at: V2 = [start[0] + (goal[0] - start[0]) * f, start[1] + (goal[1] - start[1]) * f]
    const yawDeg = (((lineDeg + 90) % 180) + 180) % 180
    const wall: CourseBox = { at, size: [len, CROSS_WALL_T], yawDeg }
    const poly = boxPoly(wall)
    if (cornerGap(hull, poly) <= CLEAR_M) continue
    if (pointPolyGap(goal[0], goal[1], poly) <= CLEAR_M) continue
    if (pointPolyGap(nose[0], nose[1], poly) <= INFLATE_M + NOSE_CLEAR_M) continue
    const trial = blocked.slice()
    blockCells(wall, trial)
    if (!goalReachable(trial, start, goal)) continue
    boxes.push(wall)
    blockCells(wall, blocked)
    break
  }
  // obstacles: the crossing wall plus 3-8 sampled boxes (4-14 m per axis, yaw 0-180), rejection-sampled — kept
  // only with > CLEAR_M hull / goal clearance AND with the goal still reachable (car-width clearance) from the start
  // obstacle count is a difficulty axis too (critique §6): 3-8 sampled boxes at d = 0, 3-11 at d = 1
  const target = OBSTACLE_MIN + Math.floor(rng.next() * (OBSTACLE_SPAN + 3 * diff))
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
      if (pointPolyGap(nose[0], nose[1], poly) <= INFLATE_M + NOSE_CLEAR_M) continue
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
 * `goal_wall` body (v2, user note 2026-10-23 ~02:20): the fenced arena (same 4 walls and start / goal bands as
 * `goal_box`) whose goal sits BEHIND SEALED GATE WALLS. The rng draw order of `goalBoxBody` is NOT touched (it
 * defines the shipped goal_box worlds); this body duplicates the arena / goal sampling deliberately.
 *
 * The layers: 1-3 axis-aligned walls perpendicular to the direct start -> goal line's dominant axis, at
 * seeded fractions of the line (layer 1 around the middle, later layers deeper toward the goal), each SEALED
 * from arena wall to arena wall with ONE gate. The gate keeps `margin = w/2 + 2 + 2d` off the direct line's
 * crossing (the line hits WALL, not gate) and sits inside the inner arena; the detour band widens with the
 * difficulty d (early seeds: the gate near the line; late seeds: long swings, WF-Blockade style).
 */
const goalWallBody = (rng: Rng, seed: number): SchlauBody => {
  const boxes: CourseBox[] = [
    { at: [0, ARENA_HALF + WALL_T / 2], size: [2 * (ARENA_HALF + WALL_T), WALL_T], yawDeg: 0 },
    { at: [0, -(ARENA_HALF + WALL_T / 2)], size: [2 * (ARENA_HALF + WALL_T), WALL_T], yawDeg: 0 },
    { at: [ARENA_HALF + WALL_T / 2, 0], size: [WALL_T, 2 * (ARENA_HALF + WALL_T)], yawDeg: 0 },
    { at: [-(ARENA_HALF + WALL_T / 2), 0], size: [WALL_T, 2 * (ARENA_HALF + WALL_T)], yawDeg: 0 },
  ]
  const start: V2 = [range(rng, -35, 35), range(rng, -35, 35)]
  const startYawDeg = range(rng, -40, 40)
  // goal: 50-110 m from the start, >= 10 m off the inner walls — the same rejection loop + corner fallback as goal_box
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
  const dx = goal[0] - start[0]
  const dz = goal[1] - start[1]
  // the SEEDED difficulty of this task (the ramp over the seed; variants share it)
  const diff = schlauDifficulty(seed)
  const rampLayers = 1 + (diff >= LAYER_2_D ? 1 : 0) + (diff >= LAYER_3_D ? 1 : 0)
  const w = GATE_MAX_M - (GATE_MAX_M - GATE_FLOOR_M) * diff
  // |dz| >= |dx|: the line is dominant along Z, the layers are long in X (sealing Z travel); else mirrored
  const alongX = Math.abs(dz) >= Math.abs(dx)
  // plane placement on the crossing axis: EVEN slots over the usable span (no per-slot jitter — a jittered
  // late slot 0 next to a jittered early slot 1 collapses the separation below PLANE_SEP_M and the inflated
  // bands seal the strip, caught by the loud guard on seed 21); the layer count caps at what FITS (adjacent
  // planes >= PLANE_SEP_M apart, start / goal >= PLANE_CLEAR_M off the outermost planes) — a short /
  // near-diagonal task may fit fewer layers than the ramp asks for. The seed's variety lives in the geometry,
  // the gate positions and the extras, not the plane positions.
  const axisSpan = alongX ? dz : dx
  const axisLen = Math.abs(axisSpan)
  const usable = Math.max(0, axisLen - 2 * PLANE_CLEAR_M)
  const layers = Math.min(rampLayers, Math.max(1, Math.floor(usable / PLANE_SEP_M)))
  const slot = usable / layers
  for (let L = 0; L < layers; L++) {
    const t = PLANE_CLEAR_M + (L + 0.5) * slot
    // the plane coordinate (the wall's position on the crossing axis) + the direct line's crossing coordinate on the wall's long axis
    const plane = (alongX ? start[1] : start[0]) + Math.sign(axisSpan) * t
    const xstar = alongX ? start[0] + (dx * t) / axisLen : start[1] + (dz * t) / axisLen
    // the gate: a sampled detour off the crossing (the direct line must hit WALL, not gate), kept inside the
    // inner arena; if the sampled side runs out of room, the other side always fits (|xstar| <= 50, detour <= ~31)
    const margin = w / 2 + 2 + 2 * diff
    let gc = xstar + (rng.next() < 0.5 ? -1 : 1) * range(rng, margin, margin + 6 + 14 * diff)
    const lo = -(ARENA_HALF - 10) + w / 2
    const hi = ARENA_HALF - 10 - w / 2
    if (gc < lo || gc > hi) gc = 2 * xstar - gc
    if (gc < lo || gc > hi) gc = Math.max(lo, Math.min(hi, gc))
    if (Math.abs(gc - xstar) < margin) gc = xstar + (xstar <= 0 ? margin : -margin)
    // the two segments: arena wall -> gate -> arena wall. The ends poke to +/-(ARENA_HALF + 1), overlapping the
    // 2 m arena wall bodies — the plane is SEALED, the gate is the ONLY passage (the WF-Blockade guarantee)
    const g0 = gc - w / 2
    const g1 = gc + w / 2
    const end = ARENA_HALF + 1
    if (alongX) {
      boxes.push({ at: [(g0 - end) / 2, plane], size: [g0 + end, GATE_WALL_T], yawDeg: 0 })
      boxes.push({ at: [(g1 + end) / 2, plane], size: [end - g1, GATE_WALL_T], yawDeg: 0 })
    } else {
      boxes.push({ at: [plane, (g0 - end) / 2], size: [GATE_WALL_T, g0 + end], yawDeg: 0 })
      boxes.push({ at: [plane, (g1 + end) / 2], size: [GATE_WALL_T, end - g1], yawDeg: 0 })
    }
  }
  // the sealed-plane guarantee is constructive (every gate >= 7 m passes the 2.5 m grid); this check is the
  // loud guard — a generator bug must crash the run, never poison it with an unsolvable task (the WF lesson)
  const blocked = new Uint8Array(GRID_N * GRID_N)
  for (const b of boxes) blockCells(b, blocked)
  if (!goalReachable(blocked, start, goal)) throw new Error(`goal_wall:${seed}: the gate layers left no drivable route (generator bug)`)
  // extra walls: 0..floor(rng * (1 + 3d)) short walls — denser on harder seeds; the same rejection loop as the
  // goal_box obstacles (CLEAR_M off the start hull / goal, the NOSE poison floor AND the goal stays reachable,
  // so an extra can never open a passage or close the last one)
  const hull = rectPoly(start[0], start[1], (startYawDeg * Math.PI) / 180, CAR_W, CAR_L)
  const nose = noseOf(start, startYawDeg)
  const extraTarget = Math.floor(rng.next() * (1 + 3 * diff))
  for (let i = 0; i < extraTarget; i++) {
    for (let attempt = 0; attempt < EXTRA_WALL_ATTEMPTS; attempt++) {
      const len = range(rng, EXTRA_WALL_MIN, EXTRA_WALL_MAX)
      const yawDeg = range(rng, 0, 180)
      const hd = Math.hypot(len, EXTRA_WALL_T) / 2
      const at: V2 = [range(rng, hd - ARENA_HALF, ARENA_HALF - hd), range(rng, hd - ARENA_HALF, ARENA_HALF - hd)]
      const box: CourseBox = { at, size: [len, EXTRA_WALL_T], yawDeg }
      const poly = boxPoly(box)
      if (cornerGap(hull, poly) <= CLEAR_M) continue
      if (pointPolyGap(goal[0], goal[1], poly) <= CLEAR_M) continue
      if (pointPolyGap(nose[0], nose[1], poly) <= INFLATE_M + NOSE_CLEAR_M) continue
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

/** the nearest point of a convex poly to p (the closest point of every edge segment) */
const nearestOnPoly = (poly: V2[], p: V2): { point: V2; gap: number } => {
  let best: V2 = poly[0]!
  let bestGap = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const ex = b[0] - a[0]
    const ez = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / (ex * ex + ez * ez || 1)))
    const q: V2 = [a[0] + ex * t, a[1] + ez * t]
    const gap = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (gap < bestGap) {
      bestGap = gap
      best = q
    }
  }
  return { point: best, gap: bestGap }
}

/**
 * Seeded start-pose sampler of variant >= 1. TWO variant classes:
 *  - FACING poses (a seeded FACING_SHARE of the variants, user note 2026-10-23 ~02:25 — the back-off lesson):
 *    the car is placed HEAD-ON toward the NEAREST box, nose FACING_CLEAR_MIN..FACING_CLEAR_MAX m off its face,
 *    on the START's side of that box (the displacement points from the box toward the start), heading straight
 *    at it — an immediate obstacle ahead, so the policy must reverse + steer away (the car reverses at up to
 *    V_REV_MAX 8 m/s). Accepted only with a clear hull against every box, the crossing guarantee intact and the
 *    goal reachable from the facing pose at INFLATE_M (backing off + rerouting works).
 *  - JITTER poses (the rest): the canonical start +/-4 m / +/-15 deg; the hull is re-checked against every box
 *    and — for `goal_box` and `goal_wall` — the jitter must keep the direct start -> goal line crossing an
 *    obstacle (the generators' guarantee, user decision 2026-10-23).
 * The canonical start is the fallback after 12 unclear attempts. The goal never moves. `goal_open` has no
 * boxes — its variants are always jitter poses (the facing draw is skipped, its rng sequence unchanged).
 */
const jitterStart = (rng: Rng, boxes: readonly CourseBox[], start: V2, startYawDeg: number, goal: V2): { start: V2; startYawDeg: number; poseClass: 'jitter' | 'facing' | 'canonical' } => {
  if (boxes.length > 0 && rng.next() < FACING_SHARE) {
    // the 3 boxes nearest to the canonical start, 2 clearance samples each — the relocation can clash with a
    // THIRD box's clearance, so one attempt usually fails; six tries keep the facing class populated
    const ranked = boxes
      .map((b) => ({ b, n: nearestOnPoly(boxPoly(b), start) }))
      .sort((x, y) => x.n.gap - y.n.gap)
      .slice(0, 3)
    const blocked = new Uint8Array(GRID_N * GRID_N)
    for (const b of boxes) blockCells(b, blocked)
    for (const { n: near } of ranked) {
      if (near.gap <= 1e-6) continue
      for (let attempt = 0; attempt < 2; attempt++) {
        // displacement unit from the box face TOWARD the start — the car lands on the start's side, facing the box
        const u: V2 = [(start[0] - near.point[0]) / near.gap, (start[1] - near.point[1]) / near.gap]
        const clear = range(rng, FACING_CLEAR_MIN, FACING_CLEAR_MAX)
        const at: V2 = [near.point[0] + u[0] * (NOSE_M + clear), near.point[1] + u[1] * (NOSE_M + clear)]
        // heading: fwd = -u (straight at the box); fwd of rotation [0, yaw, 0] is [-sin, -cos] -> sin = u[0], cos = u[1]
        const yawDeg = (Math.atan2(u[0], u[1]) * 180) / Math.PI
        const hull = rectPoly(at[0], at[1], (yawDeg * Math.PI) / 180, CAR_W, CAR_L)
        if (boxes.every((b) => cornerGap(hull, boxPoly(b)) > 0.5) && noseClear(noseOf(at, yawDeg), boxes) && schlauLineCrosses(boxes, at, goal) && goalReachable(blocked, at, goal))
          return { start: at, startYawDeg: yawDeg, poseClass: 'facing' }
      }
    }
  }
  for (let attempt = 0; attempt < JITTER_ATTEMPTS; attempt++) {
    const at: V2 = [start[0] + range(rng, -JITTER_M, JITTER_M), start[1] + range(rng, -JITTER_M, JITTER_M)]
    const yaw = startYawDeg + range(rng, -JITTER_DEG, JITTER_DEG)
    const hull = rectPoly(at[0], at[1], (yaw * Math.PI) / 180, CAR_W, CAR_L)
    if (boxes.every((b) => cornerGap(hull, boxPoly(b)) > 0.5) && (boxes.length === 0 || (noseClear(noseOf(at, yaw), boxes) && schlauLineCrosses(boxes, at, goal)))) return { start: at, startYawDeg: yaw, poseClass: 'jitter' }
  }
  return { start, startYawDeg, poseClass: 'canonical' }
}

/** Builds the seeded task of `kind`:seed(~variant). Deterministic per key. */
export function buildSchlauTask(kind: SchlauKind, seed: number, variant = 0): SchlauTask {
  const rng = createRng((seed * 2654435761 + SCHLAU_KIND_SALT[kind] + variant * 2246822519) >>> 0)
  const body = kind === 'goal_open' ? goalOpenBody(rng) : kind === 'goal_box' ? goalBoxBody(rng, seed) : goalWallBody(rng, seed)
  const pose = variant >= 1 ? jitterStart(rng, body.boxes, body.start, body.startYawDeg, body.goal) : { start: body.start, startYawDeg: body.startYawDeg, poseClass: 'canonical' as const }
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
    poseClass: pose.poseClass,
  }
}

/**
 * Parses the `--kinds` comma list of run-schlau.ts (e.g. `goal_wall` or `goal_open,goal_box`): every entry must be
 * a known SchlauKind (throws on unknown kinds / empty segments), duplicates drop out, the result is in canonical
 * SCHLAU_KINDS order (deterministic key bands regardless of the flag's order).
 */
export function parseSchlauKinds(spec: string): SchlauKind[] {
  const wanted = spec.split(',')
  const out: SchlauKind[] = []
  for (const w of wanted) {
    if (!w || !(SCHLAU_KINDS as readonly string[]).includes(w))
      throw new Error(`--kinds: unknown schlau kind ${JSON.stringify(w)} (known: ${SCHLAU_KINDS.join(', ')})`)
    if (!out.includes(w as SchlauKind)) out.push(w as SchlauKind)
  }
  return SCHLAU_KINDS.filter((k) => out.includes(k))
}

/**
 * Can the stage curriculum run with these kinds? The schlau stage is a goal_open -> rest ramp (run-schlau.ts:
 * below the threshold share ONLY goal_open is active), so it needs >= 2 kinds INCLUDING goal_open — a single-kind
 * run (the dedicated goal_wall wall runs, Auftrag C) never stages, and neither does a band without goal_open.
 */
export const schlauKindsCanStage = (kinds: readonly SchlauKind[]): boolean => kinds.length >= 2 && kinds.includes('goal_open')

/**
 * Default TRAIN band sizes per kind (critique 2026-10-23 §3: goal_open is SATURATED — the live driver finishes
 * all of them in 2.4-5.6 s, they carry no gradient; cut to 3 bootstrap/sanity seeds, "nur die Box-Mazes machen
 * wirklich Sinn"); goal_box / goal_wall carry the 16-seed difficulty ramps.
 */
export const SCHLAU_TRAIN_PER_KIND: Record<SchlauKind, number> = { goal_open: 3, goal_box: 16, goal_wall: 16 }
/**
 * Default HOLDOUT band size per kind: 8 — the decision-grade convention (eval-candidate.ts
 * DECISION_HOLDOUT_PER_KIND). The holdout band (seeds 1001+, variant 1) sits at ramp difficulty d = 1 PLUS the
 * jittered/facing start poses, measurably different from every canonical train task (critique §5).
 */
export const SCHLAU_HOLDOUT_PER_KIND = 8

/** TRAIN band: canonical start poses (variant 0), `perKind` seeds per kind from `firstSeed`; `perKind` undefined = the per-kind defaults (SCHLAU_TRAIN_PER_KIND). */
export function schlauTrainKeys(perKind?: number, kinds: readonly SchlauKind[] = SCHLAU_KINDS, firstSeed = 1): string[] {
  const keys: string[] = []
  for (const k of kinds) for (let i = 0; i < (perKind ?? SCHLAU_TRAIN_PER_KIND[k]); i++) keys.push(schlauKey(k, firstSeed + i))
  return keys
}

/** HOLDOUT band: start variant `variant` (default 1 — jittered/facing start pose), `perKind` seeds per kind from `firstSeed` (default 1001, never in TRAIN); `perKind` undefined = 8 per kind. */
export function schlauHoldoutKeys(perKind?: number, kinds: readonly SchlauKind[] = SCHLAU_KINDS, variant = 1, firstSeed = 1001): string[] {
  const keys: string[] = []
  for (const k of kinds) for (let i = 0; i < (perKind ?? SCHLAU_HOLDOUT_PER_KIND); i++) keys.push(schlauKey(k, firstSeed + i, variant))
  return keys
}
