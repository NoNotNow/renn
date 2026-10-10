import type { RennWorld } from '@/types/world'
import { buildCourse, buildSetupCourse, parseCourseKey } from './courses'
import { POLICY_GROUND, policyCourseParts } from './episode'
import { acceptedSetupKeys, chainsForSetup } from './chains'
import { readFileSync } from 'node:fs'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import { genomeLengthV2 } from './policy'
import { cmdConfigFor } from './episode'
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
  { id: 'policy_chains_crowd', setupKey: 'crowd:1002', spacing: 110, camera: LOW_CAMERA },
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

/** Shipped v3 genome, or undefined before training produced `shippedPolicyV3.json` (read at call time so the exporter works before and after a ship). */
export function shippedGenomeV3(): number[] | undefined {
  // vitest rewrites import.meta.url, so also try the repo path from the working directory (tests and tools run from the repo root)
  for (const file of [SHIPPED_V3_URL, 'src/policyEvolution/shippedPolicyV3.json']) {
    try {
      return (JSON.parse(readFileSync(file, 'utf8')) as { genome: number[] }).genome
    } catch {
      // try the next location
    }
  }
  return undefined
}

/** Deterministic fresh (untrained) v3-shaped genome: the hand-wired reverser cannot be a genome. */
export function placeholderGenomeV3(): number[] {
  const rng = createRng(3003)
  return Array.from({ length: genomeLengthV2(V3_PLACEHOLDER_HIDDEN) }, () => gaussian(rng) * 0.3)
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

