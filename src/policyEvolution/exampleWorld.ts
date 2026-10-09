import type { RennWorld } from '@/types/world'
import { buildCourse, parseCourseKey } from './courses'
import { POLICY_GROUND, policyCourseParts } from './episode'
import shipped from './shippedPolicy.json'

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
