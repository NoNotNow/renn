/**
 * Schlau training worlds: six playable worlds that train and showcase the "schlau" self-driving car — the second
 * policy trained on START -> GOAL tasks only (no waypoint chains, no carrots; see schlauCourses.ts for the seeded
 * tasks and schlauPolicy.ts for the net). ONE task per world: the car starts at the task's start pose, a goal slab
 * floats above the task's goal, and the in-world score stage (the SHARED trainingScoreStage code, prefix 'schlau')
 * scores the monotone arc-length progress along the task's GEODESIC path (the shortest drivable nose -> goal route,
 * schlauScore.ts) plus the along-chain speed bonus, minus the touch penalties. The world on disk stays neutral
 * (focused on the single task); the dialog swaps candidate genomes at load time (`applySchlauCandidate`).
 *
 * Shared contract between:
 * - the world builder + exporter (the schlau training-world export),
 * - the world tests (`src/policyEvolution/schlauTraining.test.ts`),
 * - the Builder dialog (`src/components/trainingSets.ts` — the "Schlau" tab of the training section).
 *
 * Keep this module free of node imports (no `node:fs`): the dialog imports it inside the browser bundle.
 */
import type { RennWorld } from '@/types/world'
import { createRng } from '@/avEvolution/core/rng'
import { rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { polylineLength } from './chains'
import { CAR_BODY, CAR2_PARAMS, CAR_START_Y, POLICY_GROUND } from './episode'
import { freshGenome } from './islands'
import { NOSE_M } from './policy'
import { buildSchlauTask, type SchlauKind, type SchlauTask } from './schlauCourses'
import { schlauGeodesicPath } from './schlauScore'
import { hiddenOfSchlau, N_IN_SCHLAU, SCHLAU_ACTUATOR_ID, SCHLAU_CAR_BODY_ID, SCHLAU_STAGE_ID, schlauDriveStage } from './schlauPolicy'
import { trainingScoreStageCode } from './trainingScoreStage'

/** One schlau training world: the task (`kind` + `seed`) and the dialog/example-world identity. */
export interface SchlauTrainingWorldSpec {
  /** example world id (= folder name under public/exampleWorlds/, also the File-menu/dialog key) */
  id: string
  name: string
  kind: SchlauKind
  seed: number
}

/**
 * The six schlau training worlds: three open-ground tasks (`goal_open`) and three fenced-arena tasks (`goal_box`).
 * Seeds 3001-3006 are distinct from every train/holdout task seed (train 1-16, holdout 1001+) so the worlds are
 * neither trained-on nor holdout tasks.
 */
export const SCHLAU_TRAINING_WORLDS: SchlauTrainingWorldSpec[] = [
  { id: 'schlau_1', name: 'Schlau open 1', kind: 'goal_open', seed: 3001 },
  { id: 'schlau_2', name: 'Schlau open 2', kind: 'goal_open', seed: 3002 },
  { id: 'schlau_3', name: 'Schlau open 3', kind: 'goal_open', seed: 3003 },
  { id: 'schlau_4', name: 'Schlau box 1', kind: 'goal_box', seed: 3004 },
  { id: 'schlau_5', name: 'Schlau box 2', kind: 'goal_box', seed: 3005 },
  { id: 'schlau_6', name: 'Schlau box 3', kind: 'goal_box', seed: 3006 },
]

/** Transformer id base of the per-task score stage: `<base><task index>` (one task per world: always index 0). */
export const SCHLAU_SCORE_STAGE_BASE = 'schlau_score_'
/** Entity id prefix of the per-task goal slabs: `<prefix><task index>`. */
export const SCHLAU_GOAL_PREFIX = 'schlau_goal_'
/** Score stage id of task i. */
export const schlauScoreStageId = (i: number) => SCHLAU_SCORE_STAGE_BASE + i
/** Goal slab entity id of task i. */
export const schlauGoalId = (i: number) => SCHLAU_GOAL_PREFIX + i
/** Car entity id of task i (one car per task, like policy_chains_maze: one car per chain). */
export const schlauCarId = (i: number) => SCHLAU_CAR_BODY_ID + '_' + i
/**
 * The schlau net brakes a few metres before the goal (the same leg-off margin as the maze worlds): a nose within
 * this distance of the path end has cleared the task (exporter early-stop + the finish freeze of the score stage).
 */
export const SCHLAU_GOAL_REACH_M = 8
/** Height of the floating goal slab: above the 6 m boxes, the car and the 0.5 m policy rays — nothing ever touches it. */
export const SCHLAU_GOAL_Y = 9
/** Color of the drawn carrot line (car -> ~8 m ahead on its geodesic path). */
export const SCHLAU_CARROT_COLOR = '#44aaff'
/** Colors of the drawn geodesic path (api.visualizeLine): start green, goal orange. */
export const SCHLAU_CHAIN_COLORS = { start: '#44ff77', end: '#ffaa44' } as const

/** Scoring: 1 point per metre of path progress (monotone arc length) plus a speed bonus, minus per-second touch penalties. */
export const SCHLAU_SCORE = {
  /** speed counted as "full" for the bonus (m/s) */
  vRef: 20,
  /** bonus points per second at full speed */
  bonusRate: 5,
  /** penalty points per SECOND of wall contact (isTouchingSide) */
  wallPenaltyPerS: 12,
  /** penalty points per SECOND of object contact (isTouchingObject without a lateral contact and without support below) */
  objectPenaltyPerS: 4,
} as const

/** The shared in-world score stage code (trainingScoreStage.ts) with the 'schlau' watch-label prefix. */
export const SCHLAU_SCORE_STAGE_CODE = trainingScoreStageCode('schlau', SCHLAU_GOAL_REACH_M, SCHLAU_CARROT_COLOR)

/** The seeded task + the geodesic nose -> goal path + the wall corner polys of one schlau training world. */
export interface SchlauTrainingSetup {
  task: SchlauTask
  /** the shortest drivable path from the car's start NOSE to the goal (the score stage's chain; never null — see below) */
  path: V2[]
  /** per-box rect corner polys, rounded like the chain points (the score stage's line-of-sight gate walls) */
  walls: V2[][]
}

const rad = (deg: number) => (deg * Math.PI) / 180
const round3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * Task + geodesic path + wall polys of one training world (deterministic in the spec). The path leads from the
 * car's start NOSE (center + fwd * NOSE_M — the score anchor of the stage) to the goal; the task generator
 * guarantees reachability, so a null path is a generator bug and throws.
 */
export function schlauTrainingSetup(spec: SchlauTrainingWorldSpec): SchlauTrainingSetup {
  const task = buildSchlauTask(spec.kind, spec.seed)
  // fwd of rotation [0, yaw, 0] is [-sin(yaw), -cos(yaw)] (0 = -Z, positive turns left)
  const yawRad = rad(task.startYawDeg)
  const nose: V2 = [task.start[0] - Math.sin(yawRad) * NOSE_M, task.start[1] - Math.cos(yawRad) * NOSE_M]
  const path = schlauGeodesicPath(task.boxes, nose, task.goal)
  if (!path) throw new Error(`schlauTrainingSetup: no drivable path from the start nose to the goal (${task.key}) — the task generator guarantees reachability`)
  const walls = task.boxes.map((b) => rectPoly(b.at[0], b.at[1], rad(b.yawDeg), b.size[0], b.size[1]).map((p) => [round3(p[0]), round3(p[1])] as V2))
  return { task, path, walls }
}

/**
 * One playable schlau training world: ONE task (no x-spacing) — the ground, the schlau car at the task's start pose
 * (drive stage + car2 actuator + score stage), the task's boxes and the floating goal slab. The genome is handed in
 * (the browser bundle must not read a shipped schlau genome from disk — the exporter and the tests pass
 * `placeholderSchlauGenome()` until a first net is trained). Throws on an empty / non-schlau genome.
 */
export function buildSchlauTrainingWorld(spec: SchlauTrainingWorldSpec, genome: number[]): RennWorld {
  if (!genome || hiddenOfSchlau(genome.length) === 0) {
    throw new Error('buildSchlauTrainingWorld: pass a schlau genome (placeholderSchlauGenome() until a first net is trained) — 29 H + 2 numbers, 26 inputs')
  }
  const { task, path, walls } = schlauTrainingSetup(spec)
  const carId = schlauCarId(0)
  const boxH = 6
  const entities: unknown[] = [
    POLICY_GROUND,
    {
      id: carId,
      name: 'Schlau car',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 4, height: 1, depth: 8 },
      position: [task.start[0], CAR_START_Y, task.start[1]],
      rotation: [0, rad(task.startYawDeg), 0],
      ...CAR_BODY,
      transformers: [SCHLAU_STAGE_ID, SCHLAU_ACTUATOR_ID, schlauScoreStageId(0)],
    },
  ]
  task.boxes.forEach((b, i) => {
    entities.push({
      id: `box_${i}`,
      name: `Box ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: b.size[0], height: boxH, depth: b.size[1] },
      position: [b.at[0], boxH / 2, b.at[1]],
      rotation: [0, rad(b.yawDeg), 0],
      friction: 0.5,
    })
  })
  entities.push({
    id: schlauGoalId(0),
    name: 'Schlau goal',
    bodyType: 'static',
    shape: { type: 'box', width: 4, height: 0.3, depth: 4 },
    position: [task.goal[0], SCHLAU_GOAL_Y, task.goal[1]],
    rotation: [0, 0, 0],
    material: { color: [0.15, 0.9, 0.3] },
  })
  const transformers: Record<string, unknown> = {
    [SCHLAU_STAGE_ID]: schlauDriveStage({ w: genome, goal: [task.goal[0], task.goal[1]], gain: CAR2_PARAMS.power / CAR_BODY.mass }),
    [SCHLAU_ACTUATOR_ID]: { type: 'car2', priority: 11, enabled: true, params: CAR2_PARAMS },
    [schlauScoreStageId(0)]: {
      type: 'custom',
      priority: 6,
      enabled: true,
      name: 'Schlau score',
      code: SCHLAU_SCORE_STAGE_CODE,
      params: {
        chain: path,
        chains: [path],
        walls,
        chainColors: [[SCHLAU_CHAIN_COLORS.start, SCHLAU_CHAIN_COLORS.end]],
        cars: [carId],
        idx: 0,
        hud: true,
        vRef: SCHLAU_SCORE.vRef,
        bonusRate: SCHLAU_SCORE.bonusRate,
        wallPenaltyPerS: SCHLAU_SCORE.wallPenaltyPerS,
        objectPenaltyPerS: SCHLAU_SCORE.objectPenaltyPerS,
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
      camera: { control: 'follow', mode: 'thirdPerson', target: carId, distance: 35, height: 22, cameraTargetLag: 120, cameraPositionLag: 180 },
      debugTargetLineEntityId: carId,
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

/** Candidate identity of the schlau policy (the dialog's model dropdown; the meta.json `candidate` field). */
export interface SchlauTrainingCandidate {
  policy: 'schlau'
  /** human-readable label shown in the dialog, e.g. "schlau (untrained placeholder)" */
  label: string
  /** generation of the candidate genome (null until a first net is trained) */
  gen: number | null
  /** where the genome came from */
  source: string
}

/** The default candidate until a first schlau net is trained (the placeholder genome drives the exported worlds). */
export const PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE: SchlauTrainingCandidate = { policy: 'schlau', label: 'schlau (untrained placeholder)', gen: null, source: 'placeholder' }

/** A deterministic fresh schlau genome (10 hidden units): the placeholder that drives the worlds until a first net is trained. */
export function placeholderSchlauGenome(): number[] {
  return freshGenome(createRng(4711), 0.3, N_IN_SCHLAU, 10)
}

/**
 * Candidate identity for a RENN_SCHLAU_GENOME_FILE trial: the parsed latest-best/run file (the caller reads it from
 * disk) plus the override path (mirror of trialMazeTrainingCandidate, policy 'schlau'). The exporter writes this
 * into meta.json so the dialog labels a trial honestly instead of showing it as the shipped policy.
 */
export function trialSchlauTrainingCandidate(
  parsed: { best?: { gen?: number }; source?: string },
  overridePath: string,
): SchlauTrainingCandidate {
  const gen = parsed.best?.gen ?? 0
  const name = String(parsed.source ?? overridePath).replace(/^.*[/\\]/, '').replace(/\.json$/, '')
  return { policy: 'schlau', label: `${name} trial (gen ${gen})`, gen, source: overridePath }
}

/** Candidate identity of the shipped schlau policy (the parsed shippedPolicySchlau.json; the exporter + the tests read it from disk). */
export function shippedSchlauTrainingCandidate(parsed: { source?: string }): SchlauTrainingCandidate {
  const genMatch = /generation (\d+)/.exec(parsed.source ?? '')
  const gen = genMatch ? Number(genMatch[1]) : null
  return { policy: 'schlau', label: gen !== null ? `schlau shipped (gen ${gen})` : 'schlau shipped', gen, source: 'shippedPolicySchlau.json' }
}

/** meta.json of one schlau training world (the dialog cards read it next to world.json). */
export function schlauTrainingMeta(
  spec: SchlauTrainingWorldSpec,
  path: V2[],
  bestScore: number | null,
  candidate: SchlauTrainingCandidate = PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE,
): {
  id: string
  seed: number
  name: string
  kind: SchlauKind
  candidate: SchlauTrainingCandidate
  bestScore: number | null
  /** stats of the single task (start → goal, the geodesic path as the one tile) */
  chain: { points: number; lengthM: number }
  /**
   * Dialog tile data (ONE tile: the geodesic path): `w`/`h` = the shared pixel size of route_0.svg, `pts` = the
   * path's polyline in svg pixel space, `score` = the task's own best headless score. Same shape as the maze
   * meta's tileSvg so the shared dialog handles it (the driver adds it to meta.json).
   */
  tileSvg?: { w: number; h: number; routes: Array<{ pts: Array<[number, number]>; score: number | null }> }
} {
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    kind: spec.kind,
    candidate,
    bestScore,
    chain: { points: path.length, lengthM: Math.round(polylineLength(path) * 10) / 10 },
  }
}

/**
 * Focus a loaded schlau training world on ONE task (the tile clicked in the dialog = the run's target vector):
 * the task's car becomes the camera target and the visualizeLine display entity, and only its score stage writes
 * the HUD score. ONE task per world: routeIndex 0 focuses, any other index is a no-op (the world stays unchanged).
 * Pure JSON transform, applied by the Builder before opening the world — the world on disk stays neutral.
 */
export function focusSchlauGoal(world: RennWorld, routeIndex: number): RennWorld {
  const scoreIds = Object.keys((world as { transformers?: Record<string, unknown> }).transformers ?? {}).filter((id) => id.startsWith(SCHLAU_SCORE_STAGE_BASE))
  if (routeIndex !== 0 || scoreIds.length === 0) return world
  const w = JSON.parse(JSON.stringify(world)) as {
    world: { camera: { target?: string }; debugTargetLineEntityId?: string }
    transformers: Record<string, { params?: Record<string, unknown> }>
  }
  w.world.camera.target = schlauCarId(routeIndex)
  w.world.debugTargetLineEntityId = schlauCarId(routeIndex)
  for (const id of scoreIds) w.transformers[id]!.params!.hud = id === schlauScoreStageId(routeIndex)
  return w as unknown as RennWorld
}

/**
 * Swaps the drive-stage weights (`params.w`) of every schlau car of the LOADED world instance to the candidate's
 * genome — the schlau variant of applyTrainingCandidate (mazeCandidates.ts), same pattern as `focusSchlauGoal`:
 * deep clone, mutate params, return; the file on disk is never touched. Throws when the genome is not schlau-shaped
 * (a v1/v2/v3 genome cannot drive the schlau stage — the layouts differ) and when no schlau drive stage exists.
 */
export function applySchlauCandidate(world: RennWorld, genome: ArrayLike<number>): RennWorld {
  if (!hiddenOfSchlau(genome.length)) {
    throw new Error(`applySchlauCandidate: genome of ${genome.length} numbers is not schlau-shaped (29 H + 2, 26 inputs)`)
  }
  const w = JSON.parse(JSON.stringify(world)) as {
    transformers?: Record<string, { params?: Record<string, unknown> }>
  }
  let swapped = 0
  for (const [id, transformer] of Object.entries(w.transformers ?? {})) {
    if (id !== SCHLAU_STAGE_ID && !id.startsWith(`${SCHLAU_STAGE_ID}_`)) continue
    if (!transformer.params || !Array.isArray(transformer.params.w)) continue
    transformer.params.w = Array.from(genome)
    swapped++
  }
  if (swapped === 0) throw new Error(`applySchlauCandidate: no schlau drive stage (${SCHLAU_STAGE_ID}*) with params.w found`)
  return w as unknown as RennWorld
}
