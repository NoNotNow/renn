import type { RennWorld } from '@/types/world'
import { buildCourse, buildSetupCourse, parseCourseKey } from './courses'
import { POLICY_GROUND, policyCourseParts } from './episode'
import { acceptedSetupKeys, chainsForSetup } from './chains'
import { readFileSync } from 'node:fs'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import { genomeLengthV3, hiddenOfLength, N_IN_V2, N_IN_V3, padV2Genome } from './policy'
import { cmdConfigFor } from './episode'
import { schlauNetOf } from './schlauDeep'
import type { SchlauKind } from './schlauCourses'
import { buildSchlauTrainingWorld, placeholderSchlauGenome } from './schlauTraining'
import shipped from './shippedPolicy.json'
import shippedV2 from './shippedPolicyV2.json'

export interface PolicyExampleWorld {
  id: string
  /** held-out courses (key, x offset), one car each; the camera follows the first car */
  courses: Array<{ key: string; originX: number }>
  camera: { distance: number; height: number }
}

const LOW_CAMERA = { distance: 30, height: 14 }

/** One example world per course kind (File -> Example Worlds); the maze world shows four mazes side by side from a steep camera. */
export const POLICY_EXAMPLE_WORLDS: PolicyExampleWorld[] = [
  { id: 'policy_drive_field', courses: [{ key: 'field:1001', originX: 0 }], camera: LOW_CAMERA },
  { id: 'policy_drive_slalom', courses: [{ key: 'slalom:1001', originX: 0 }], camera: LOW_CAMERA },
  {
    id: 'policy_drive_maze',
    courses: [1001, 1002, 1003, 1004].map((seed, i) => ({ key: `maze:${seed}`, originX: i * 220 })),
    camera: { distance: 40, height: 60 },
  },
]

function worldOf(entities: unknown[], transformers: Record<string, unknown>, firstCar: string, camera: { distance: number; height: number }): RennWorld {
  return {
    version: '1.0',
    world: {
      gravity: [0, -100, 0],
      distanceCulling: false,
      ambientLight: [0.45, 0.45, 0.5],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
      skyColor: [0.35, 0.5, 0.75],
      camera: { control: 'follow', mode: 'thirdPerson', target: firstCar, ...camera, cameraTargetLag: 120, cameraPositionLag: 180 },
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

export function shippedGenome(): number[] {
  return shipped.genome
}

/** World with the shipped evolved policy driving each listed held-out course with its own car. */
export function buildPolicyExampleWorld(spec: PolicyExampleWorld, genome: number[] = shippedGenome()): RennWorld {
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  let firstCar = ''
  spec.courses.forEach((c, i) => {
    const { kind, seed } = parseCourseKey(c.key)
    const parts = policyCourseParts(buildCourse(kind, seed), genome, { origin: [c.originX, 0], suffix: `_${i}` })
    entities.push(...parts.entities)
    Object.assign(transformers, parts.transformers)
    if (!firstCar) firstCar = parts.carId
  })
  return worldOf(entities, transformers, firstCar, spec.camera)
}

// --- v2: one setup, every target-vector chain side by side ----------------------------------------------------------------------------

export interface PolicyChainsExampleWorld {
  id: string
  /** held-out setup key (first accepted seed from 1001 on, canonical start); every chain of it gets its own copy of the setup + car */
  setupKey: string
  /** x distance between the copies (m) */
  spacing: number
  camera: { distance: number; height: number }
  /** v3 world: leg-wise chains (`free` / `bay` / `corridor` setups), v3 stage code, episode keys `<setup>#<i>v3` */
  v3?: boolean
}

/** One world per setup kind: the SAME setup, each chain driven by the v2 net in its own copy (copy i at x = i * spacing). */
export const POLICY_CHAINS_EXAMPLE_WORLDS: PolicyChainsExampleWorld[] = [
  { id: 'policy_chains_field', setupKey: 'field:1001@0.3', spacing: 100, camera: LOW_CAMERA },
  { id: 'policy_chains_slalom', setupKey: 'slalom:1001', spacing: 110, camera: LOW_CAMERA },
  { id: 'policy_chains_maze', setupKey: 'maze:1009', spacing: 160, camera: { distance: 40, height: 60 } },
  // crowd pin (2026-10-15): crowd:1002 — the pin of the 10-14 loosening — REJECTS at the new simplify 3.5
  // (0 chains); crowd:1001 is the first accepted canonical holdout seed there (2 chains)
  { id: 'policy_chains_crowd', setupKey: 'crowd:1001', spacing: 110, camera: LOW_CAMERA },
]

export function shippedGenomeV2(): number[] {
  return shippedV2.genome
}

const MARKER_COLORS: Array<[number, number, number]> = [
  [1, 0.25, 0.2],
  [0.2, 0.55, 1],
  [1, 0.85, 0.1],
  [0.3, 0.95, 0.4],
]
/** Chain markers float above the 6 m walls and the car (0.5 m ray height): rays and the car never touch them. */
const MARKER_Y = 9

/** Entity id prefix of the chain markers (static slabs floating over every chain waypoint, colour per chain). */
export const CHAIN_MARKER_PREFIX = 'chain_marker_'

// --- v3: forward AND reverse driving ------------------------------------------------------------------------------------------------

/** v3 worlds: HOLDOUT setups (first accepted seed from 1001 per kind, no cherry-picking), every direction chain (incl. reversal legs) in its own copy. */
export const POLICY_V3_EXAMPLE_WORLDS: PolicyChainsExampleWorld[] = [
  { id: 'policy_v3_free', setupKey: 'free:1001', spacing: 240, camera: { distance: 45, height: 40 }, v3: true },
  { id: 'policy_v3_bay', setupKey: 'bay:1001', spacing: 130, camera: { distance: 40, height: 45 }, v3: true },
  { id: 'policy_v3_corridor', setupKey: 'corridor:1001', spacing: 60, camera: { distance: 40, height: 45 }, v3: true },
]

/** Marker colour of legs whose aim points BACKWARDS (reverse legs) in the v3 worlds. */
const REVERSE_MARKER_COLOR: [number, number, number] = [0.85, 0.25, 1]
/** Hidden size of the untrained placeholder net (the v3 run's `--hidden`). */
export const V3_PLACEHOLDER_HIDDEN = 24

const SHIPPED_V3_URL = new URL('./shippedPolicyV3.json', import.meta.url)

/**
 * A v3 stage genome (26 inputs): v3 shapes pass through, LEGACY 24-input (v2-shaped, len = 27 H + 2) genomes are
 * zero-padded onto the two touch inputs (bit-identical function, see padV2Genome) so the worlds keep driving while the
 * fresh 26-input run (v3mg5) has not shipped yet. Anything else fails loudly.
 */
export function ensureV3Inputs(genome: number[]): number[] {
  if (hiddenOfLength(genome.length, N_IN_V3)) return genome
  if (hiddenOfLength(genome.length, N_IN_V2)) return padV2Genome(genome)
  throw new Error(`v3 genome of ${genome.length} numbers fits neither the 26-input (29 H + 2) nor the legacy 24-input (27 H + 2) layout`)
}

/** Shipped v3 genome, or undefined before training produced `shippedPolicyV3.json` (read at call time so the exporter works before and after a ship). */
export function shippedGenomeV3(): number[] | undefined {
  // RENN_V3_GENOME_FILE: trial a candidate (training-data/policy-evolution/latest-best.json or a run file) WITHOUT
  // touching the shipped policy. Accepts { genome: number[] } (latest-best.json) or { best: { genome } } (run files).
  // A set-but-broken override fails loudly — never silently fall back to the shipped genome.
  const override = process.env.RENN_V3_GENOME_FILE
  if (override) {
    const parsed = JSON.parse(readFileSync(override, 'utf8')) as { genome?: number[]; best?: { genome?: number[] } }
    const genome = parsed.genome ?? parsed.best?.genome
    if (!genome || genome.length === 0) throw new Error(`RENN_V3_GENOME_FILE ${override} has no genome`)
    return ensureV3Inputs(genome)
  }
  // vitest rewrites import.meta.url, so also try the repo path from the working directory (tests and tools run from the repo root)
  for (const file of [SHIPPED_V3_URL, 'src/policyEvolution/shippedPolicyV3.json']) {
    try {
      return ensureV3Inputs((JSON.parse(readFileSync(file, 'utf8')) as { genome: number[] }).genome)
    } catch (e) {
      if (e instanceof Error && e.message.includes('fits neither')) throw e
      // try the next location
    }
  }
  return undefined
}

/** Deterministic fresh (untrained) v3-shaped genome: the hand-wired reverser cannot be a genome. */
export function placeholderGenomeV3(): number[] {
  const rng = createRng(3003)
  return Array.from({ length: genomeLengthV3(V3_PLACEHOLDER_HIDDEN) }, () => gaussian(rng) * 0.3)
}

/** True while the v3 worlds still use the untrained placeholder. */
export const v3IsPlaceholder = () => shippedGenomeV3() === undefined

/** The held-out setup key of a v3 kind (first accepted seed from 1001). */
export const v3HoldoutSetup = (kind: 'free' | 'bay' | 'corridor') => acceptedSetupKeys(1, [kind], 1001)[0]!

export function buildPolicyChainsExampleWorld(spec: PolicyChainsExampleWorld, genome: number[] = (spec.v3 ? (shippedGenomeV3() ?? placeholderGenomeV3()) : shippedGenomeV2())): RennWorld {
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  const course = buildSetupCourse(spec.setupKey)
  const chains = chainsForSetup(spec.setupKey)
  let firstCar = ''
  chains.forEach((chain, i) => {
    const ox = i * spec.spacing
    // the v3 worlds use the split input + drive stages (policyStages.ts): 26-input drive stage with the touch inputs
    const parts = policyCourseParts(course, genome, { origin: [ox, 0], suffix: `_${i}`, chain: chain.points, cmd: cmdConfigFor(`${spec.setupKey}#${i}${spec.v3 ? 'v3' : ''}`), ...(spec.v3 ? { v3: true, legEnds: chain.legEnds, offM: chain.offM } : {}) })
    entities.push(...parts.entities)
    Object.assign(transformers, parts.transformers)
    if (!firstCar) firstCar = parts.carId
    const yaw = ((course.startYawDeg ?? 0) * Math.PI) / 180
    const reverseLeg = (j: number): boolean => {
      if (!spec.v3 || j === 0) return false
      const prev = j === 1 ? ([-Math.sin(yaw), -Math.cos(yaw)] as const) : ([chain.points[j - 1]![0] - chain.points[j - 2]![0], chain.points[j - 1]![1] - chain.points[j - 2]![1]] as const)
      const cur = [p_(j)[0] - p_(j - 1)[0], p_(j)[1] - p_(j - 1)[1]]
      return prev[0] * cur[0] + prev[1] * cur[1] < 0
    }
    const p_ = (j: number) => (j === 0 ? (course.startAt ?? [0, 0]) : chain.points[j]!)
    chain.points.forEach((p, j) => {
      entities.push({
        id: `${CHAIN_MARKER_PREFIX}${i}_${j}`,
        name: `Chain ${i} marker ${j}${reverseLeg(j) ? ' (reverse leg)' : ''}`,
        bodyType: 'static',
        shape: { type: 'box', width: 3, height: 0.3, depth: 3 },
        position: [p[0] + ox, MARKER_Y, p[1]],
        rotation: [0, 0, 0],
        material: { color: reverseLeg(j) ? REVERSE_MARKER_COLOR : MARKER_COLORS[i % MARKER_COLORS.length], opacity: 0.9 },
      })
    })
  })
  if (spec.v3 && genome.length === placeholderGenomeV3().length && spec.id.startsWith('policy_v3_') && v3IsPlaceholder()) {
    // no shippedPolicyV3.json yet: say so inside the world (worlds carry no description field)
    entities.push({ id: 'placeholder_note', name: 'UNTRAINED PLACEHOLDER: random net, not the trained v3 policy', bodyType: 'static', shape: { type: 'box', width: 1, height: 0.2, depth: 1 }, position: [0, MARKER_Y + 5, 0], rotation: [0, 0, 0], material: { color: [0.5, 0.5, 0.5], opacity: 0.3 } })
  }
  return worldOf(entities, transformers, firstCar, spec.camera)
}

// --- schlau: the second, goal-directed policy (start -> goal only, no chains) ------------------------------------------------

/**
 * A schlau stage genome — EITHER net (schlauNetOf): the 1-layer fallback (26 inputs, len = 29 H + 2) or the deep
 * 'schlau2' net (two hidden layers, len = H^2 + 30 H + 2, schlauDeep.ts); the two length sets are DISJOINT by
 * construction, so the net is unambiguous. The 1-layer length formula still COLLIDES with v3 (also 26 inputs) but
 * the layout differs (360 deg rays + movement memory + goal vector vs the v2 inputs + the two touch flags) — a v3
 * genome is NOT a schlau genome, so there is no padding here: anything else fails loudly.
 */
export function ensureSchlauGenome(genome: number[]): number[] {
  if (schlauNetOf(genome.length)) return genome
  throw new Error(`schlau genome of ${genome.length} numbers fits neither net (1-layer: 29 H + 2; deep schlau2: H^2 + 30 H + 2) — schlau and v3 genomes share the 1-layer length formula but NOT the layout`)
}

const SHIPPED_SCHLAU_URL = new URL('./shippedPolicySchlau.json', import.meta.url)

/** Shipped schlau genome, or undefined before training produced `shippedPolicySchlau.json` (read at call time so the exporter works before and after a ship). */
export function shippedGenomeSchlau(): number[] | undefined {
  // RENN_SCHLAU_GENOME_FILE: trial a candidate (a schlau run's latest-best.json or a run file) WITHOUT touching the
  // shipped policy. Accepts { genome: number[] } (latest-best.json) or { best: { genome } } (run files).
  // A set-but-broken override fails loudly — never silently fall back to the shipped genome.
  const override = process.env.RENN_SCHLAU_GENOME_FILE
  if (override) {
    const parsed = JSON.parse(readFileSync(override, 'utf8')) as { genome?: number[]; best?: { genome?: number[] } }
    const genome = parsed.genome ?? parsed.best?.genome
    if (!genome || genome.length === 0) throw new Error(`RENN_SCHLAU_GENOME_FILE ${override} has no genome`)
    return ensureSchlauGenome(genome)
  }
  // vitest rewrites import.meta.url, so also try the repo path from the working directory (tests and tools run from the repo root)
  for (const file of [SHIPPED_SCHLAU_URL, 'src/policyEvolution/shippedPolicySchlau.json']) {
    try {
      return ensureSchlauGenome((JSON.parse(readFileSync(file, 'utf8')) as { genome: number[] }).genome)
    } catch (e) {
      if (e instanceof Error && e.message.includes('fits no hidden size')) throw e
      // try the next location
    }
  }
  return undefined
}

/** One schlau example world spec (File -> Example Worlds): a start -> goal task the schlau car drives itself. */
export interface SchlauExampleWorldSpec {
  id: string
  name: string
  kind: SchlauKind
  seed: number
}

/**
 * The schlau example worlds: drivable OUTSIDE the training dialog (the global File -> Example Worlds menu; the six
 * schlau TRAINING worlds schlau_1..6 stay excluded there, like the maze/crux training worlds). Holdout-ish seeds,
 * not the training band 3001-3006.
 */
export const SCHLAU_EXAMPLE_WORLDS: SchlauExampleWorldSpec[] = [
  { id: 'schlau_open', name: 'Schlau open', kind: 'goal_open', seed: 2001 },
  { id: 'schlau_box', name: 'Schlau box', kind: 'goal_box', seed: 2002 },
]

/**
 * The schlau example world of one spec: the training world of the same task (one start -> goal task, score stage,
 * camera follow) with the shipped schlau genome — or the untrained placeholder until one is shipped (re-run the
 * exporter after every ship).
 */
export function buildSchlauExampleWorld(spec: SchlauExampleWorldSpec, genome: number[] = shippedGenomeSchlau() ?? placeholderSchlauGenome()): RennWorld {
  return buildSchlauTrainingWorld(spec, genome)
}

