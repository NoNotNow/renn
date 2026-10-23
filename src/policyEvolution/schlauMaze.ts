/**
 * MAZE-BRIDGE of the "schlau" policy (L2A task chunk, user decision 2026-10-23): the schlau car drives the MAZE
 * worlds of renn. The maze worlds guide the v3 policy with a waypoint CHAIN (the policy-input stage walks it and
 * feeds two lookahead points); the schlau head has no chain input — it gets ONE goal vector (x[23..25]). The
 * bridge: an IN-SIGHT goal feed (the carrot fix, user report 2026-10-23) — the schlau drive stage walks the maze
 * chain itself (reach / arc-pass cursor) and hands the head the BEST (FURTHEST) chain point that is IN SIGHT:
 * the straight nose -> point segment clears every static obstacle box inflated by the car half width, so the
 * goal (and the drawn target line) never points through a wall. The goal index is a high-water (advances as
 * corners open up, never regresses on occlusion flicker); when nothing ahead is in sight the nearest unreached
 * waypoint stays the goal (toward the corridor mouth); the chain end is the finish. The head never sees the
 * whole chain, only the current goal.
 *
 * Worlds: `schlau_maze_1..10` — the SAME maze geometry + chains as the maze_train worlds (same seeds, both built
 * from mazeTrainingRoutes — the geometry is equal by construction), with a schlau car per route copy. The
 * per-car score stage is the SHARED schlau score stage code (SCHLAU_SCORE_STAGE_CODE, watch label 'schlau.score')
 * scored with the MAZE metric (MAZE_TRAIN_SCORE) so the numbers compare with the v3 maze worlds' meta bestScores.
 *
 * SHAPE-KOLLISION (schlauPolicy.ts): a schlau genome is length-identical to v3 (29 H + 2) but wired differently —
 * buildSchlauMazeWorld only accepts schlau-shaped genomes (schlauNetOf: 1-layer OR deep) and the worlds carry the drive stage
 * under the `schlau_drive` namespace (applySchlauCandidate swaps params.w); a v3 genome must never be baked here.
 *
 * Keep this module free of node imports (no `node:fs`): it is importable from the browser bundle.
 */
import type { RennWorld } from '@/types/world'
import { rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import {
  MAZE_TRAIN_CHAIN_COLORS,
  MAZE_TRAIN_CHAIN_COLORS_REVERSED,
  MAZE_TRAIN_ROUTES,
  MAZE_TRAIN_SCORE,
  MAZE_TRAINING_WORLDS,
  mazeTrainingRoutes,
} from './mazeTraining'
import { CAR_HALF_WIDTH } from './chains'
import { CAR2_PARAMS, CAR_BODY, CAR_SIZE, CAR_START_Y, POLICY_GROUND } from './episode'
import { NOSE_M } from './policy'
import { SCHLAU_STAGE_BODY, SCHLAU_STAGE_HEAD, SCHLAU_STAGE_ID, SCHLAU_STAGE_PRIORITY, N_IN_SCHLAU, STAGE_NET_SCHLAU } from './schlauPolicy'
import { schlauNetOf } from './schlauDeep'
import { SCHLAU_GOAL_Y, SCHLAU_SCORE_STAGE_CODE, type SchlauTrainingCandidate } from './schlauTraining'

/** One schlau maze world: mirrors the maze training world of the same index (seed = the maze's seed). */
export interface SchlauMazeWorldSpec {
  id: string
  name: string
  seed: number
}

/**
 * The ten schlau maze worlds — one per maze training world (maze_train_1..10), same seeds: the maze geometry,
 * the routes and the tapered guidance chains are IDENTICAL to the v3 worlds (mazeTrainingRoutes is deterministic
 * in the seed and shared), so a schlau score on schlau_maze_n measures the same task the v3 policy runs on
 * maze_train_n.
 */
export const SCHLAU_MAZE_WORLDS: SchlauMazeWorldSpec[] = MAZE_TRAINING_WORLDS.map((maze, i) => ({
  id: `schlau_maze_${i + 1}`,
  name: `Schlau Maze ${i + 1}`,
  seed: maze.seed,
}))

/** true when the schlau maze specs mirror the maze training specs 1:1 (same order, same seeds) — the parity contract. */
export function schlauMazeWorldSpecsEqualMazeTrain(): boolean {
  return (
    SCHLAU_MAZE_WORLDS.length === MAZE_TRAINING_WORLDS.length &&
    SCHLAU_MAZE_WORLDS.every((s, i) => s.seed === MAZE_TRAINING_WORLDS[i]!.seed)
  )
}

// --- in-sight goal feed (the maze bridge of the schlau drive stage — the carrot fix) --------------------------------------

/**
 * Waypoint advance reach (m): when the car NOSE comes this close to the CURRENT goal waypoint, the goal advances
 * to the next one. Below the maze finish reach (8 m — the score stage's freeze) so a waypoint is genuinely
 * approached before it counts as reached, above the chain's start spacing jitter.
 */
export const SCHLAU_MAZE_WAYPOINT_REACH_M = 6
/**
 * Waypoint arc-pass margin (m): the goal also advances when the nose's chain projection passes the current
 * waypoint by this margin — a wide overshoot (missing the reach circle at speed) never parks the goal behind
 * the car. The projection is local (±3 segments of the last one) and monotone (a high-water, like the score).
 */
export const SCHLAU_MAZE_WAYPOINT_PASS_M = 2

/** The single goal assignment of the original schlau stage body — the one line the maze bridge replaces. */
const SCHLAU_MAZE_GOAL_MARKER = 'var g = params.goal || [pos[0], pos[2]]'

/** The waypoint-sequential goal block: walks params.chain, feeds the head the best IN-SIGHT chain point. */
const SCHLAU_MAZE_WAYPOINT_GOAL_JS = `var g
  // MAZE BRIDGE — IN-SIGHT goal feed (the carrot fix, user report 2026-10-23): the head gets ONE goal, the
  // BEST (FURTHEST) chain point that is IN SIGHT — the straight segment from the car NOSE to the point clears
  // every static obstacle box of params.walls inflated by the car half width (${CAR_HALF_WIDTH} m), so the goal
  // vector (and the drawn lila target line) never points through a wall. The reach (${SCHLAU_MAZE_WAYPOINT_REACH_M} m)
  // and arc-pass (${SCHLAU_MAZE_WAYPOINT_PASS_M} m) rules advance the reached cursor state.wpc.wp exactly as
  // before; the goal index state.wpc.gi is a HIGH-WATER: it advances to the furthest in-sight point ahead of
  // the cursor as corners open up and NEVER REGRESSES when the old goal gets occluded (flicker hysteresis).
  // When NOTHING ahead is in sight (corner pocket / nose against a wall) the nearest unreached waypoint
  // stays the goal (the pre-fix feed — the car keeps moving toward the corridor mouth); the goal is never
  // fed behind the reached cursor. The LAST waypoint (the chain end = the finish) never advances. Without
  // params.walls sight cannot be judged: the goal stays the next unreached waypoint (the pre-fix sequential
  // feed). Without params.chain the stage keeps the static params.goal feed.
  if (params.chain && params.chain.length > 1) {
    if (!state.wpc) {
      var wcum = [0]
      for (var wq = 1; wq < params.chain.length; wq++) wcum.push(wcum[wq - 1] + Math.hypot(params.chain[wq][0] - params.chain[wq - 1][0], params.chain[wq][1] - params.chain[wq - 1][1]))
      // obstacle cache (once, init-style): the static wall polys with their AABBs for the sight test's
      // quick reject — the boxes are the world's static box entities (convex polys, axis-aligned or yawed)
      var wWalls = params.walls || [], wBoxes = []
      for (var wBI = 0; wBI < wWalls.length; wBI++) {
        var wPoly = wWalls[wBI], wMNx = Infinity, wMXx = -Infinity, wMNz = Infinity, wMXz = -Infinity
        for (var wVI = 0; wVI < wPoly.length; wVI++) {
          if (wPoly[wVI][0] < wMNx) wMNx = wPoly[wVI][0]
          if (wPoly[wVI][0] > wMXx) wMXx = wPoly[wVI][0]
          if (wPoly[wVI][1] < wMNz) wMNz = wPoly[wVI][1]
          if (wPoly[wVI][1] > wMXz) wMXz = wPoly[wVI][1]
        }
        wBoxes.push({ p: wPoly, x0: wMNx, x1: wMXx, z0: wMNz, z1: wMXz })
      }
      state.wpc = { ch: params.chain, cum: wcum, wp: 1, seg: 0, s: 0, gi: 1, boxes: wBoxes }
    }
    var wS = state.wpc
    var wpx = pos[0] + fwd[0] * ${NOSE_M}, wpz = pos[2] + fwd[2] * ${NOSE_M}
    while (wS.wp < wS.ch.length - 1 && Math.hypot(wpx - wS.ch[wS.wp][0], wpz - wS.ch[wS.wp][1]) < ${SCHLAU_MAZE_WAYPOINT_REACH_M}) wS.wp++
    var wbD = Infinity, wbS = wS.s, wbSeg = wS.seg
    for (var wi = Math.max(0, wS.seg - 2); wi <= Math.min(wS.ch.length - 2, wS.seg + 3); wi++) {
      var wax = wS.ch[wi][0], waz = wS.ch[wi][1]
      var wdx = wS.ch[wi + 1][0] - wax, wdz = wS.ch[wi + 1][1] - waz
      var wlen2 = wdx * wdx + wdz * wdz || 1
      var wu = Math.max(0, Math.min(1, ((wpx - wax) * wdx + (wpz - waz) * wdz) / wlen2))
      var wd = Math.hypot(wpx - (wax + wu * wdx), wpz - (waz + wu * wdz))
      if (wd < wbD) { wbD = wd; wbS = wS.cum[wi] + wu * Math.sqrt(wlen2); wbSeg = wi }
    }
    wS.seg = wbSeg
    if (wbS > wS.s) wS.s = wbS
    while (wS.wp < wS.ch.length - 1 && wS.s > wS.cum[wS.wp] + ${SCHLAU_MAZE_WAYPOINT_PASS_M}) wS.wp++
    // the in-sight search: EXACT segment <-> box gap (the same convention as the schlau field's line of
    // sight — no grid-sample slack), boxes inflated by the car half width; a per-box AABB pre-reject keeps
    // the per-frame cost sane (dozens of chain points, ~90 static boxes, cached once above)
    if (wS.boxes.length) {
      var wCl = ${CAR_HALF_WIDTH}
      var wPtSeg = function (px, pz, ax, az, bx, bz) {
        var dx = bx - ax, dz = bz - az
        var u = ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)
        u = u < 0 ? 0 : u > 1 ? 1 : u
        return Math.hypot(px - (ax + u * dx), pz - (az + u * dz))
      }
      var wLos = function (bx, bz) {
        var lx0 = (wpx < bx ? wpx : bx) - wCl, lx1 = (wpx > bx ? wpx : bx) + wCl
        var lz0 = (wpz < bz ? wpz : bz) - wCl, lz1 = (wpz > bz ? wpz : bz) + wCl
        for (var wI = 0; wI < wS.boxes.length; wI++) {
          var wB = wS.boxes[wI], wPly = wB.p
          if (wB.x1 < lx0 || wB.x0 > lx1 || wB.z1 < lz0 || wB.z0 > lz1) continue
          for (var wE = 0; wE < wPly.length; wE++) {
            var wP = wPly[wE], wQ = wPly[wE + 1] || wPly[0]
            var wUx = bx - wpx, wUz = bz - wpz, wVx = wQ[0] - wP[0], wVz = wQ[1] - wP[1]
            var wD = wUx * wVz - wUz * wVx, wDmin
            if (wD !== 0) {
              var wRx = wP[0] - wpx, wRz = wP[1] - wpz
              var wWs = (wRx * wVz - wRz * wVx) / wD, wWt = (wRx * wUz - wRz * wUx) / wD
              wDmin = wWs >= 0 && wWs <= 1 && wWt >= 0 && wWt <= 1 ? 0 : Math.min(
                wPtSeg(wpx, wpz, wP[0], wP[1], wQ[0], wQ[1]),
                wPtSeg(bx, bz, wP[0], wP[1], wQ[0], wQ[1]),
                wPtSeg(wP[0], wP[1], wpx, wpz, bx, bz),
                wPtSeg(wQ[0], wQ[1], wpx, wpz, bx, bz))
            } else {
              wDmin = Math.min(
                wPtSeg(wpx, wpz, wP[0], wP[1], wQ[0], wQ[1]),
                wPtSeg(bx, bz, wP[0], wP[1], wQ[0], wQ[1]),
                wPtSeg(wP[0], wP[1], wpx, wpz, bx, bz),
                wPtSeg(wQ[0], wQ[1], wpx, wpz, bx, bz))
            }
            if (wDmin < wCl) return false
          }
          // both endpoints deep inside the box: the edge gaps above measured to the boundary, not 0 —
          // explicit inside test (convex poly, any winding: a sign flip of the edge cross products)
          for (var wE2 = 0; wE2 < 2; wE2++) {
            var wIx = wE2 ? bx : wpx, wIz = wE2 ? bz : wpz, wSgn = 0, wInside = true
            for (var wE3 = 0; wE3 < wPly.length; wE3++) {
              var wP2 = wPly[wE3], wQ2 = wPly[wE3 + 1] || wPly[0]
              var wC2 = (wQ2[0] - wP2[0]) * (wIz - wP2[1]) - (wQ2[1] - wP2[1]) * (wIx - wP2[0])
              if (wC2 !== 0) { var wSc = wC2 > 0 ? 1 : -1; if (wSgn === 0) wSgn = wSc; else if (wSgn !== wSc) { wInside = false; break } }
            }
            if (wInside) return false
          }
        }
        return true
      }
      var wvis = -1
      for (var wk = wS.wp; wk < wS.ch.length; wk++) {
        if (wLos(wS.ch[wk][0], wS.ch[wk][1])) wvis = wk
      }
      if (wvis >= wS.gi) wS.gi = wvis
      else if (wvis < 0) wS.gi = wS.wp
    } else {
      wS.gi = wS.wp
    }
    if (wS.gi < wS.wp) wS.gi = wS.wp
    g = wS.ch[wS.gi]
  } else {
    g = params.goal || [pos[0], pos[2]]
  }`

/**
 * The maze schlau stage BODY: the shared schlau body with ONLY the goal assignment replaced by the
 * in-sight goal block — rays, movement memory, drawn trail and net stay byte-identical by construction
 * (the splice is positional; a changed schlau body without the marker fails loudly instead of drifting silently).
 */
export const SCHLAU_MAZE_STAGE_BODY: string = (() => {
  const at = SCHLAU_STAGE_BODY.indexOf(SCHLAU_MAZE_GOAL_MARKER)
  if (at < 0 || SCHLAU_STAGE_BODY.indexOf(SCHLAU_MAZE_GOAL_MARKER, at + 1) >= 0) {
    throw new Error('schlauMaze: the schlau stage body no longer carries exactly one static-goal assignment — update the maze bridge splice')
  }
  return SCHLAU_STAGE_BODY.slice(0, at) + SCHLAU_MAZE_WAYPOINT_GOAL_JS + SCHLAU_STAGE_BODY.slice(at + SCHLAU_MAZE_GOAL_MARKER.length)
})()

/** Stage code of the maze schlau drive stage (same head + net as the schlau stage; only the goal feed differs). */
export const SCHLAU_MAZE_STAGE_CODE = SCHLAU_STAGE_HEAD + SCHLAU_MAZE_STAGE_BODY + STAGE_NET_SCHLAU

/** Drive stage id of maze copy i (the `schlau_drive` namespace: applySchlauCandidate swaps params.w of these). */
export const schlauMazeDriveStageId = (i: number) => `${SCHLAU_STAGE_ID}_${i}`
/** Car2 actuator id of maze copy i. */
export const schlauMazeActuatorId = (i: number) => `schlau_car_${i}`
/** Score stage id of maze copy i. */
export const schlauMazeScoreStageId = (i: number) => `schlau_maze_score_${i}`
/** Car entity id of maze copy i. */
export const schlauMazeCarId = (i: number) => `schlau_maze_car_${i}`
/** Goal slab entity id of maze copy i. */
export const schlauMazeGoalId = (i: number) => `schlau_maze_goal_${i}`
/** Prefix of the goal slabs (the headless scorer locates them by this prefix). */
export const SCHLAU_MAZE_GOAL_PREFIX = 'schlau_maze_goal_'

/** Transformer config of the maze schlau drive stage (params: w, chain, walls, gain). */
export function schlauMazeDriveStage(params: Record<string, unknown>): Record<string, unknown> {
  return { type: 'custom', priority: SCHLAU_STAGE_PRIORITY, enabled: true, name: 'Schlau maze drive', code: SCHLAU_MAZE_STAGE_CODE, params }
}

// --- world builder -------------------------------------------------------------------------------------------------------

/**
 * One playable schlau maze world: the maze geometry + routes + tapered chains of the maze training world of the
 * same seed (one copy per route at x = i * MAZE_TRAIN_ROUTES.spacingM), every copy driven by a schlau car on its
 * own chain through the in-sight goal feed, plus the shared schlau score stage per car (car 0 writes
 * the HUD score and draws). The genome is handed in (the browser bundle must not read genomes from disk).
 * Throws on an empty / non-schlau-shaped genome (schlauNetOf; a v3 genome has the SAME length as the 1-layer net —
 * never bake one). BOTH schlau nets are accepted: the dual-mode stage code (STAGE_NET_SCHLAU) runs the 1-layer
 * fallback and the deep 'schlau2' genome (schlauDeep.ts) alike.
 */
export function buildSchlauMazeWorld(spec: SchlauMazeWorldSpec, genome: number[]): RennWorld {
  if (!genome || !schlauNetOf(genome.length)) {
    throw new Error(`buildSchlauMazeWorld: pass a schlau genome (1-layer 29 H + 2 or deep H^2 + 30 H + 2, ${N_IN_SCHLAU} inputs) — got ${genome ? `${genome.length} numbers` : 'none'}`)
  }
  const { course, routes, chains } = mazeTrainingRoutes(spec as Parameters<typeof mazeTrainingRoutes>[0])
  const spacing = MAZE_TRAIN_ROUTES.spacingM
  const carIds = routes.map((_, i) => schlauMazeCarId(i))
  const chainsShifted: V2[][] = chains.map((ch, i) => ch.map((p) => [p[0] + i * spacing, p[1]] as V2))
  const wallsShifted: V2[][][] = routes.map((_, i) =>
    course.boxes.map((b) => {
      const poly = rectPoly(b.at[0] + i * spacing, b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])
      return poly.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000] as V2)
    }),
  )
  const chainColors = routes.map((r) =>
    r.reversed ? [MAZE_TRAIN_CHAIN_COLORS_REVERSED.start, MAZE_TRAIN_CHAIN_COLORS_REVERSED.end] : [MAZE_TRAIN_CHAIN_COLORS.start, MAZE_TRAIN_CHAIN_COLORS.end],
  )
  const rad = (deg: number) => (deg * Math.PI) / 180
  const boxH = 6
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  routes.forEach((route, i) => {
    entities.push({
      id: schlauMazeCarId(i),
      name: `Schlau maze car ${i}`,
      bodyType: 'dynamic',
      shape: { type: 'box', width: CAR_SIZE[0], height: 1, depth: CAR_SIZE[1] },
      position: [route.startAt[0] + i * spacing, CAR_START_Y, route.startAt[1]],
      rotation: [0, rad(route.startYawDeg), 0],
      ...CAR_BODY,
      transformers: [schlauMazeDriveStageId(i), schlauMazeActuatorId(i), schlauMazeScoreStageId(i)],
    })
    course.boxes.forEach((b, j) => {
      entities.push({
        id: `box_${j}_${i}`,
        name: `Box ${j}_${i}`,
        bodyType: 'static',
        shape: { type: 'box', width: b.size[0], height: boxH, depth: b.size[1] },
        position: [b.at[0] + i * spacing, boxH / 2, b.at[1]],
        rotation: [0, rad(b.yawDeg), 0],
        friction: 0.5,
      })
    })
    const end = route.route[route.route.length - 1]!
    entities.push({
      id: schlauMazeGoalId(i),
      name: `Schlau maze goal ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: 4, height: 0.3, depth: 4 },
      position: [end[0] + i * spacing, SCHLAU_GOAL_Y, end[1]],
      rotation: [0, 0, 0],
      material: { color: [0.15, 0.9, 0.3] },
    })
    transformers[schlauMazeDriveStageId(i)] = schlauMazeDriveStage({
      w: genome,
      chain: chainsShifted[i]!,
      walls: wallsShifted[i]!,
      gain: CAR2_PARAMS.power / CAR_BODY.mass,
    })
    transformers[schlauMazeActuatorId(i)] = { type: 'car2', priority: 11, enabled: true, params: CAR2_PARAMS }
    transformers[schlauMazeScoreStageId(i)] = {
      type: 'custom',
      priority: 6,
      enabled: true,
      name: 'Schlau maze score',
      code: SCHLAU_SCORE_STAGE_CODE,
      params: {
        chain: chainsShifted[i]!,
        chains: chainsShifted,
        walls: wallsShifted[i]!,
        chainColors,
        cars: carIds,
        idx: i,
        hud: i === 0,
        vRef: MAZE_TRAIN_SCORE.vRef,
        bonusRate: MAZE_TRAIN_SCORE.bonusRate,
        wallPenaltyPerS: MAZE_TRAIN_SCORE.wallPenaltyPerS,
        objectPenaltyPerS: MAZE_TRAIN_SCORE.objectPenaltyPerS,
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

// --- meta ----------------------------------------------------------------------------------------------------------------

/**
 * meta.json of one schlau maze world as the training dialog reads it (maze-shaped: seed + routes + tileSvg — the
 * exporter's scoring driver adds the per-route tile data, same shape as `MazeTrainingMeta` so the shared
 * `MazeTrainingDialog` handles it; the `candidate` is the SCHLAU candidate identity, policy 'schlau').
 */
export interface SchlauMazeTrainingMeta {
  id: string
  seed: number
  name: string
  candidate: SchlauTrainingCandidate
  bestScore: number | null
  chain: { points: number; lengthM: number }
  routes: { forward: number; reversed: number }
  /**
   * Dialog tile data, aligned with the tile order (forward routes first, then reversed): `w`/`h` = the shared
   * pixel size of every route_<i>.svg, `pts` = that route's chain polyline in svg pixel space (the dialog's live
   * active-vector overlay rides on it), `score` = the route's own best headless score. Optional: older exports
   * predate it (same contract as the maze meta's tileSvg).
   */
  tileSvg?: { w: number; h: number; routes: Array<{ pts: Array<[number, number]>; score: number | null }> }
}

/** meta.json of one schlau maze world (documentation next to world.json; the training dialog cards read it). */
export function schlauMazeMeta(
  spec: SchlauMazeWorldSpec,
  bestScore: number | null,
  candidate: SchlauTrainingCandidate,
): SchlauMazeTrainingMeta {
  const { routes, chains } = mazeTrainingRoutes(spec as Parameters<typeof mazeTrainingRoutes>[0])
  const primary = chains[0]!
  let lengthM = 0
  for (let i = 1; i < primary.length; i++) lengthM += Math.hypot(primary[i]![0] - primary[i - 1]![0], primary[i]![1] - primary[i - 1]![1])
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate,
    bestScore,
    chain: { points: primary.length, lengthM: Math.round(lengthM * 10) / 10 },
    routes: { forward: routes.filter((r) => !r.reversed).length, reversed: routes.filter((r) => r.reversed).length },
  }
}

/**
 * Focus a loaded schlau maze world on ONE route copy (the tile clicked in the training dialog = the run's target
 * vector): the copy's car becomes the camera target and the visualizeLine display entity, and only its score stage
 * writes the HUD score — the mirror of `focusMazeRoute` (mazeTraining.ts) over the schlau maze ids. Pure JSON
 * transform, applied by the Builder before opening the world; an out-of-range index is a no-op. The world on disk
 * stays neutral (focused on route 0).
 */
export function focusSchlauMazeRoute(world: RennWorld, routeIndex: number): RennWorld {
  const scoreIds = Object.keys((world as { transformers?: Record<string, unknown> }).transformers ?? {})
    .filter((id) => /^schlau_maze_score_(\d+)$/.test(id))
    .sort((a, b) => Number(a.slice('schlau_maze_score_'.length)) - Number(b.slice('schlau_maze_score_'.length)))
  if (scoreIds.length === 0 || routeIndex < 0 || routeIndex >= scoreIds.length) return world
  const w = JSON.parse(JSON.stringify(world)) as {
    world: { camera: { target?: string }; debugTargetLineEntityId?: string }
    transformers: Record<string, { params?: Record<string, unknown> }>
  }
  w.world.camera.target = schlauMazeCarId(routeIndex)
  w.world.debugTargetLineEntityId = schlauMazeCarId(routeIndex)
  for (const id of scoreIds) w.transformers[id]!.params!.hud = id === schlauMazeScoreStageId(routeIndex)
  return w as unknown as RennWorld
}
