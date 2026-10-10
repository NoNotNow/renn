import type { RennWorld } from '@/types/world'
import { buildCourse, buildSetupCourse, parseCourseKey } from './courses'
import { POLICY_GROUND, policyCourseParts } from './episode'
import { chainsForSetup } from './chains'
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
  return {
    version: '1.0',
    world: {
      gravity: [0, -100, 0],
      distanceCulling: false,
      ambientLight: [0.45, 0.45, 0.5],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
      skyColor: [0.35, 0.5, 0.75],
      camera: { control: 'follow', mode: 'thirdPerson', target: firstCar, ...spec.camera, cameraTargetLag: 120, cameraPositionLag: 180 },
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

// --- v2: one setup, every target-vector chain side by side ----------------------------------------------------------------------------

export interface PolicyChainsExampleWorld {
  id: string
  /** held-out setup key (first accepted seed from 1001 on, canonical start); every chain of it gets its own copy of the setup + car */
  setupKey: string
  /** x distance between the copies (m) */
  spacing: number
  camera: { distance: number; height: number }
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

export function buildPolicyChainsExampleWorld(spec: PolicyChainsExampleWorld, genome: number[] = shippedGenomeV2()): RennWorld {
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  const course = buildSetupCourse(spec.setupKey)
  const chains = chainsForSetup(spec.setupKey)
  let firstCar = ''
  chains.forEach((chain, i) => {
    const ox = i * spec.spacing
    const parts = policyCourseParts(course, genome, { origin: [ox, 0], suffix: `_${i}`, chain: chain.points, cmd: cmdConfigFor(`${spec.setupKey}#${i}`) })
    entities.push(...parts.entities)
    Object.assign(transformers, parts.transformers)
    if (!firstCar) firstCar = parts.carId
    chain.points.forEach((p, j) => {
      entities.push({
        id: `${CHAIN_MARKER_PREFIX}${i}_${j}`,
        name: `Chain ${i} marker ${j}`,
        bodyType: 'static',
        shape: { type: 'box', width: 3, height: 0.3, depth: 3 },
        position: [p[0] + ox, MARKER_Y, p[1]],
        rotation: [0, 0, 0],
        material: { color: MARKER_COLORS[i % MARKER_COLORS.length], opacity: 0.9 },
      })
    })
  })
  return {
    version: '1.0',
    world: {
      gravity: [0, -100, 0],
      distanceCulling: false,
      ambientLight: [0.45, 0.45, 0.5],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
      skyColor: [0.35, 0.5, 0.75],
      camera: { control: 'follow', mode: 'thirdPerson', target: firstCar, ...spec.camera, cameraTargetLag: 120, cameraPositionLag: 180 },
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

