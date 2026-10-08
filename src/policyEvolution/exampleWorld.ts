import type { RennWorld } from '@/types/world'
import { buildCourse, type CourseKind } from './courses'
import { POLICY_GROUND, policyCourseParts } from './episode'
import shipped from './shippedPolicy.json'

export const POLICY_EXAMPLE_WORLD_ID = 'policy_drive'

/** (course key, x offset) of the cars in the example world: two held-out courses side by side, each with its own car. */
export const POLICY_EXAMPLE_COURSES: Array<{ key: string; originX: number }> = [
  { key: 'field:1001', originX: 0 },
  { key: 'slalom:1001', originX: 120 },
]

export function shippedGenome(): number[] {
  return shipped.genome
}

/** World with the shipped evolved policy driving one held-out course per car (File -> Example Worlds). */
export function buildPolicyExampleWorld(genome: number[] = shippedGenome()): RennWorld {
  const entities: unknown[] = [POLICY_GROUND]
  const transformers: Record<string, unknown> = {}
  let firstCar = ''
  POLICY_EXAMPLE_COURSES.forEach((c, i) => {
    const [kind, seed] = c.key.split(':') as [CourseKind, string]
    const parts = policyCourseParts(buildCourse(kind, Number(seed)), genome, { origin: [c.originX, 0], suffix: `_${i}` })
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
      camera: { control: 'follow', mode: 'follow', target: firstCar, distance: 14, height: 5, targetVerticalAngle: 9 },
    },
    transformers,
    entities,
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}
