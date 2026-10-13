/**
 * Crux training worlds: the accepted crux band of the v3cruxnose run (15 train + 10 holdout setups, classes NC1 fast
 * corner / NC2 start swing, courses.ts), PLAYABLE in the app exactly like the maze training worlds (mazeTraining.ts is
 * the template — same principle, same functionality). One world per crux setup, ONE COPY of the tiny crux geometry PER
 * ACCEPTED CHAIN (like the maze worlds hold one maze copy per route), each copy with the v3 policy car driving that
 * chain — the SAME chains the training episodes run (`generateCruxChains` via `chainsForSetup`: the base path plus
 * jittered variants, all behind the pure-pursuit acceptance gate) and the SAME per-chain command config
 * (`cmdConfigFor(chainEpisodeKey(setupKey, i, true))` — the episode key of the training episodes).
 * Shared contract between:
 * - the world builder + exporter (`tools/renn-mcp/export-crux-training-worlds.ts`),
 * - the world tests (`src/test/scenarios/crux-training-worlds.test.ts`),
 * - the Builder dialog (`src/components/MazeTrainingDialog.tsx`, the shared parameterized training dialog).
 *
 * Keep this module free of node imports (no `node:fs`): the dialog imports it inside the browser bundle. The chain
 * enumeration needs the physics engine warm (`warmCruxGate`, the pursuit gate builds simulators) — only the exporter
 * and the tests call `cruxTrainingSetup`; the dialog loads the exported world.json from disk.
 * Scoring constants, the candidate types, the goal-reach / goal-height / carrot-color values and the score-stage code
 * are SHARED with the maze training worlds (the same contract, the same stage behaviour — only the watch-label prefix
 * 'crux.*' differs).
 */
import type { RennWorld } from '@/types/world'
import { rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { buildSetupCourse, cruxClass, cruxDir, cruxEmb, parseCourseKey, type Course } from './courses'
import { chainEpisodeKey, chainsForSetup, type Chain } from './chains'
import { cmdConfigFor, OFF_CHAIN_M, POLICY_CAR_ID, POLICY_GROUND, policyCourseParts } from './episode'
import { trainingScoreStageCode } from './trainingScoreStage'
import {
  MAZE_CARROT_COLOR,
  MAZE_GOAL_REACH_M,
  MAZE_GOAL_Y,
  MAZE_TRAIN_SCORE,
  SHIPPED_MAZE_TRAINING_CANDIDATE,
  trialMazeTrainingCandidate,
  type MazeTrainingCandidate,
} from './mazeTraining'

/**
 * The accepted crux band (source of truth `acceptedSetupKeys(15, ['crux'], 1)` / `acceptedSetupKeys(10, ['crux'], 1001, 1)`,
 * pinned in `crux.test.ts` as TRAIN15 / HOLDOUT10). Spelled out here so the registry stays import-cheap — the tests
 * assert the equality against the live enumeration.
 */
const TRAIN_SETUP_KEYS = [
  'crux:1', 'crux:2', 'crux:3', 'crux:5', 'crux:6', 'crux:7', 'crux:9', 'crux:10', 'crux:11', 'crux:12', 'crux:13',
  'crux:14', 'crux:15', 'crux:16', 'crux:17',
] as const
const HOLDOUT_SETUP_KEYS = [
  'crux:1001~1', 'crux:1002~1', 'crux:1003~1', 'crux:1005~1', 'crux:1006~1', 'crux:1007~1', 'crux:1008~1', 'crux:1009~1',
  'crux:1010~1', 'crux:1011~1',
] as const

export interface CruxTrainingWorldSpec {
  /** example world id (= folder name under public/exampleWorlds/, also the dialog key): crux_train_<n> / crux_holdout_<n> */
  id: string
  /** the crux setup key of the accepted band (its course geometry, start pose and chains are deterministic in it) */
  setupKey: string
  name: string
  /** the pinned band this world belongs to */
  band: 'train' | 'holdout'
}

/** Class / embodiment / turn direction of a crux setup as one dialog row line, e.g. "NC1 fast corner · occluded · west". */
function cruxInfoLine(setupKey: string): string {
  const { seed } = parseCourseKey(setupKey)
  const cls = cruxClass(seed)
  const emb = cruxEmb(seed)
  const clsLabel = cls === 0 ? 'NC1 fast corner' : 'NC2 start swing'
  const embLabel = cls === 0 ? (emb === 0 ? 'occluded' : 'open') : emb === 0 ? 'lateral' : 'pocket'
  return `${clsLabel} · ${embLabel} · ${cruxDir(seed) === -1 ? 'west' : 'east'}`
}

/** The 25 crux training worlds: the 15 train + 10 holdout setups of the accepted band, in enumeration order. */
export const CRUX_TRAINING_WORLDS: CruxTrainingWorldSpec[] = [
  ...TRAIN_SETUP_KEYS.map((setupKey, i) => ({ id: `crux_train_${i + 1}`, setupKey, name: `Crux Training ${i + 1}`, band: 'train' as const })),
  ...HOLDOUT_SETUP_KEYS.map((setupKey, i) => ({ id: `crux_holdout_${i + 1}`, setupKey, name: `Crux Holdout ${i + 1}`, band: 'holdout' as const })),
]

/** The dialog row line of a spec: the class + embodiment + turn direction chip (like the maze row's "seed 2001"). */
export const cruxTrainingInfo = (spec: CruxTrainingWorldSpec): string => cruxInfoLine(spec.setupKey)

/** Candidate identity shared with the maze training worlds (same candidates.json, same shipped / RENN_V3_GENOME_FILE-trial scheme). */
export type TrainingCandidate = MazeTrainingCandidate
/** The shipped v3 policy as the default candidate of the crux exports (the same identity the maze exports name). */
export const SHIPPED_CRUX_TRAINING_CANDIDATE: TrainingCandidate = SHIPPED_MAZE_TRAINING_CANDIDATE
/** Trial candidate naming for a RENN_V3_GENOME_FILE export — the same rule as the maze exports. */
export const trialCruxTrainingCandidate = trialMazeTrainingCandidate

/** Written by the exporter next to each world.json and shown on the dialog cards. */
export interface CruxTrainingMeta {
  id: string
  setupKey: string
  name: string
  candidate: TrainingCandidate
  /** best headless score of the candidate on this crux (max over all chain cars; points = chain progress + speed bonus); null until measured */
  bestScore: number | null
  /** crux class of the setup seed: 0 = NC1 fast corner, 1 = NC2 start swing */
  cls: 0 | 1
  /** embodiment within the class: NC1 0 occluded / 1 open; NC2 0 lateral start / 1 corner-exit pocket */
  emb: 0 | 1
  /** turn direction of the mirrored world: -1 west / 1 east */
  dir: -1 | 1
  /** stats of the base chain (chain 0 = the course's own route) */
  chain: { points: number; lengthM: number }
  /** how many ways the world trains on: the base chain plus the jittered variants */
  chains: { base: number; jittered: number }
  /**
   * Dialog tile data, aligned with the tile order (base chain first, then the jittered variants): `w`/`h` = the shared
   * pixel size of every route_<i>.svg, `pts` = that chain's polyline in svg pixel space, `score` = the chain's own
   * best headless score. Same shape as the maze meta's tileSvg so the shared dialog handles both.
   */
  tileSvg?: { w: number; h: number; routes: Array<{ pts: Array<[number, number]>; score: number | null }> }
}

/** x distance between the per-chain crux copies (m). The tiny crux courses span ~25-45 m in x, so 70 m leaves clear gaps. */
export const CRUX_TRAIN_SPACING_M = 70

/** Scoring contract shared with the maze worlds (speed bonus + wall / object touch penalties). */
export const CRUX_TRAIN_SCORE = MAZE_TRAIN_SCORE

/** Colors of the drawn guidance chains (api.visualizeLine): the BASE chain green -> orange, the jittered variants blue -> orange (maze-reverse palette). */
export const CRUX_TRAIN_CHAIN_COLORS = { base: { start: '#44ff77', end: '#ffaa44' }, jitter: { start: '#44bbff', end: '#ffaa44' } } as const

// --- chain enumeration (the same chains the training episodes run) -------------------------------------------------------------------

/**
 * Course + accepted chains of one crux training world. Deterministic in the setup key; the chains ARE the training
 * episodes' chains (`chainsForSetup` -> `generateCruxChains`: base path + jittered variants behind the pure-pursuit
 * gate). Needs the physics engine warm (`warmCruxGate`) — only the exporter and the tests call this, never the dialog.
 * Throws when the setup's chain set is empty (every band setup is accepted; a shrinking band is a contract break, not a skip).
 */
export function cruxTrainingSetup(spec: CruxTrainingWorldSpec): { course: Course; chains: Chain[] } {
  const chains = chainsForSetup(spec.setupKey)
  if (chains.length === 0) throw new Error(`cruxTrainingSetup: ${spec.setupKey} has no accepted chains (band shrunk?)`)
  return { course: buildSetupCourse(spec.setupKey), chains }
}

// --- in-world scoring stage ---------------------------------------------------------------------------------------------------------

/** Transformer id base of the per-car score stages (attached to each car, priority 6): `<base><copy index>`. */
export const CRUX_SCORE_STAGE_BASE = 'crux_score_'
/** Entity id prefix of the per-copy goal slabs (one per chain, floating at the chain end): `<prefix><copy index>`. */
export const CRUX_GOAL_PREFIX = 'crux_goal_'
/** Score stage id of crux copy i. */
export const cruxScoreStageId = (i: number) => `${CRUX_SCORE_STAGE_BASE}${i}`
/** Goal slab entity id of crux copy i. */
export const cruxGoalId = (i: number) => `${CRUX_GOAL_PREFIX}${i}`
/** Car entity id of crux copy i (one car per chain copy, like the maze worlds: one car per route). */
export const cruxCarId = (i: number) => `${POLICY_CAR_ID}_${i}`
/** A car within this distance of its chain end has cleared its way (same margin as the maze worlds: the v3 leg-off margin). */
export const CRUX_GOAL_REACH_M = MAZE_GOAL_REACH_M
/** Height of the floating goal slabs: above the 6 m crux walls, the car and the 0.5 m policy rays. */
export const CRUX_GOAL_Y = MAZE_GOAL_Y
/** Color of the guidance carrot line (car -> ~8 m ahead on its chain), shared with the maze worlds. */
export const CRUX_CARROT_COLOR = MAZE_CARROT_COLOR

/**
 * Custom-transformer code of the per-car score stage — the SHARED training score stage (trainingScoreStage.ts, the
 * same contract as MAZE_SCORE_STAGE_CODE) with the 'crux.*' watch labels: monotone arc-length progress along the own
 * chain polyline plus a speed bonus minus touch penalties, the wall line-of-sight gate on the progress credit (the
 * copy's own walls), the high-water-mark display score, the goal-reach finish freeze and the chain + carrot drawing
 * (car 0 draws every chain: base green -> orange, jittered variants blue -> orange).
 */
export const CRUX_SCORE_STAGE_CODE = trainingScoreStageCode('crux', CRUX_GOAL_REACH_M, CRUX_CARROT_COLOR)

// --- world builder -------------------------------------------------------------------------------------------------------------------

/**
 * One playable crux training world: one copy of the tiny crux geometry per accepted chain (copy i at
 * x = i * CRUX_TRAIN_SPACING_M), the shipped v3 policy driving every copy on its own chain — the SAME chain and the
 * SAME per-chain command config (`cmdConfigFor(chainEpisodeKey(setupKey, i, true))`, the episode key the training
 * episodes run — with the chain's own `offM`, 16 on the NC2 start swings) — plus one goal slab and one score stage per
 * copy (car 0 also draws every chain + one carrot per car and writes the HUD score). The genome is handed in (the
 * browser bundle must not read shippedPolicyV3.json from disk — the exporter and the tests pass `shippedGenomeV3()`).
 */
export function buildCruxTrainingWorld(spec: CruxTrainingWorldSpec, genome?: number[]): RennWorld {
  if (!genome || genome.length === 0) throw new Error('buildCruxTrainingWorld: pass the v3 genome (shippedGenomeV3() on the exporter/test side)')
  const { course, chains } = cruxTrainingSetup(spec)
  const spacing = CRUX_TRAIN_SPACING_M
  const carIds = chains.map((_, i) => cruxCarId(i))
  const chainsShifted: V2[][] = chains.map((ch, i) => ch.points.map((p) => [p[0] + i * spacing, p[1]] as V2))
  // per-copy wall rect corner polys (the line-of-sight gate of the score stage; rounded like the maze walls)
  const wallsShifted: V2[][][] = chains.map((_, i) =>
    course.boxes.map((b) => {
      const poly = rectPoly(b.at[0] + i * spacing, b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])
      return poly.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000] as V2)
    }),
  )
  const chainColors = chains.map((_, i) =>
    i === 0 ? [CRUX_TRAIN_CHAIN_COLORS.base.start, CRUX_TRAIN_CHAIN_COLORS.base.end] : [CRUX_TRAIN_CHAIN_COLORS.jitter.start, CRUX_TRAIN_CHAIN_COLORS.jitter.end],
  )
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  chains.forEach((chain, i) => {
    const parts = policyCourseParts(course, genome, {
      origin: [i * spacing, 0],
      suffix: `_${i}`,
      chain: chain.points,
      cmd: cmdConfigFor(chainEpisodeKey(spec.setupKey, i, true)),
      legEnds: chain.legEnds,
      offM: chain.offM ?? OFF_CHAIN_M,
      v3: true,
    })
    const car = parts.entities[0] as { transformers: string[] }
    car.transformers = [...car.transformers, cruxScoreStageId(i)]
    entities.push(...parts.entities)
    Object.assign(transformers, parts.transformers)
    const chainEnd = chain.points[chain.points.length - 1]!
    entities.push({
      id: cruxGoalId(i),
      name: `Crux goal ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: 4, height: 0.3, depth: 4 },
      position: [chainEnd[0] + i * spacing, CRUX_GOAL_Y, chainEnd[1]],
      rotation: [0, 0, 0],
      material: { color: [0.15, 0.9, 0.3] },
    })
  })
  chains.forEach((_, i) => {
    transformers[cruxScoreStageId(i)] = {
      type: 'custom',
      priority: 6,
      enabled: true,
      name: 'Crux score',
      code: CRUX_SCORE_STAGE_CODE,
      params: {
        chain: chainsShifted[i]!,
        chains: chainsShifted,
        walls: wallsShifted[i]!,
        chainColors,
        cars: carIds,
        idx: i,
        hud: i === 0,
        vRef: CRUX_TRAIN_SCORE.vRef,
        bonusRate: CRUX_TRAIN_SCORE.bonusRate,
        wallPenaltyPerS: CRUX_TRAIN_SCORE.wallPenaltyPerS,
        objectPenaltyPerS: CRUX_TRAIN_SCORE.objectPenaltyPerS,
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
      camera: { control: 'follow', mode: 'thirdPerson', target: carIds[0]!, distance: 28, height: 16, cameraTargetLag: 120, cameraPositionLag: 180 },
      debugTargetLineEntityId: carIds[0]!,
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

/** meta.json of one crux training world (the dialog cards read it next to world.json). */
export function cruxTrainingMeta(
  spec: CruxTrainingWorldSpec,
  chains: Chain[],
  bestScore: number | null,
  candidate: TrainingCandidate = SHIPPED_CRUX_TRAINING_CANDIDATE,
): CruxTrainingMeta {
  const { seed } = parseCourseKey(spec.setupKey)
  const base = chains[0]!
  return {
    id: spec.id,
    setupKey: spec.setupKey,
    name: spec.name,
    candidate,
    bestScore,
    cls: (cruxClass(seed) === 0 ? 0 : 1) as 0 | 1,
    emb: (cruxEmb(seed) === 0 ? 0 : 1) as 0 | 1,
    dir: (cruxDir(seed) === -1 ? -1 : 1) as -1 | 1,
    chain: { points: base.points.length, lengthM: Math.round(base.length * 10) / 10 },
    chains: { base: 1, jittered: chains.length - 1 },
  }
}

/**
 * Focus a loaded crux training world on ONE chain (the tile clicked in the dialog = the run's target vector):
 * the chain's car becomes the camera target and the visualizeLine display entity (its score stage draws all chains),
 * and only its score stage writes the HUD score. Pure JSON transform, applied by the Builder before opening the world.
 * The world on disk stays neutral (focused on chain 0); an out-of-range index is a no-op.
 */
export function focusCruxChain(world: RennWorld, chainIndex: number): RennWorld {
  const scoreIds = Object.keys((world as { transformers?: Record<string, unknown> }).transformers ?? {})
    .filter((id) => /^crux_score_(\d+)$/.test(id))
    .sort((a, b) => Number(a.slice(11)) - Number(b.slice(11)))
  if (scoreIds.length === 0 || chainIndex < 0 || chainIndex >= scoreIds.length) return world
  const w = JSON.parse(JSON.stringify(world)) as {
    world: { camera: { target?: string }; debugTargetLineEntityId?: string }
    transformers: Record<string, { params?: Record<string, unknown> }>
  }
  w.world.camera.target = cruxCarId(chainIndex)
  w.world.debugTargetLineEntityId = cruxCarId(chainIndex)
  for (const id of scoreIds) w.transformers[id]!.params!.hud = id === `crux_score_${chainIndex}`
  return w as unknown as RennWorld
}
