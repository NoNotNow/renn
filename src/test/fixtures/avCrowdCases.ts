import type { ArenaBox, ArenaSpec, V2 } from '@/test/fixtures/avEvasionArena'
import { AV_CAR_SOURCE_ID, buildArenaWorldFrom } from '@/avEvolution/maze/arenaWorld'
import type { RennWorld } from '@/types/world'

/**
 * Static crowd cases for the neural drive mode (`av-neural.integration.test.ts`, agent-context/plan-policy-in-av-car.md): the 4 x 8 AV car of the
 * example world drives a long stretch north (-Z) from a standing start through parked cars / clutter / a narrow gate to a goal beyond them.
 * The obstacles are static, known boxes (the classic stack plans around them); movers are Phase 2. Deterministic: layouts are pure functions of the case.
 */
export interface CrowdCase {
  name: string
  about: string
  /** Simulated seconds for a reasonable run. */
  seconds: number
  spec: () => ArenaSpec
}

const PARKED: V2 = [4, 8]

/** Long thin side walls (closed corridor: the car cannot drive around the obstacles). */
function sideWalls(x: number, z0: number, z1: number): ArenaBox[] {
  const len = Math.abs(z1 - z0)
  return [-x, x].map((wx) => ({ at: [wx, (z0 + z1) / 2] as V2, size: [1, len] as V2, height: 3 }))
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Two rows of parked 4 x 8 cars between side walls, the rows staggered by half a pitch so the lane is a chicane (4 m gaps along each row, inner edges 7.5 m apart: 1.75 m clearance per side). */
function parkedGauntlet(): ArenaSpec {
  const boxes: ArenaBox[] = sideWalls(8.3, -20, -240)
  const inner = 3.75
  for (let i = 0; i < 14; i++) {
    const z = -40 - i * 13
    boxes.push({ at: [-(inner + PARKED[0] / 2), z], size: PARKED, height: 1.6 })
    boxes.push({ at: [inner + PARKED[0] / 2, z - 6.5], size: PARKED, height: 1.6 })
  }
  return { car: { at: [0, 0], yawDeg: 0 }, goal: [0, -250], boxes, puppets: [] }
}

/** Scattered boxes (1.5-3 m) over a 70 x 140 m field with >= 11 m between centres: always passable, never straight. */
function clutterField(): ArenaSpec {
  const rnd = mulberry(7)
  const pts: V2[] = []
  for (let k = 0; k < 400 && pts.length < 34; k++) {
    const p: V2 = [(rnd() - 0.5) * 70, -30 - rnd() * 140]
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 11)) pts.push(p)
  }
  const boxes: ArenaBox[] = sideWalls(45, -10, -215).concat(pts.map((p) => ({ at: p, size: [1.5 + rnd() * 1.5, 1.5 + rnd() * 1.5] as V2, yawDeg: rnd() * 90, height: 1.6 })))
  return { car: { at: [0, 0], yawDeg: 0 }, goal: [0, -200], boxes, puppets: [] }
}

/** A long wall across the road with one 9 m gate (2.5 m clearance per side for the 4 m car), off the start line. */
function narrowGap(): ArenaSpec {
  const gz = -70
  const gx0 = 5
  const gx1 = 14
  const half = 100
  const boxes: ArenaBox[] = [
    { at: [(-half + gx0) / 2, gz], size: [gx0 + half, 2], height: 3 },
    { at: [(gx1 + half) / 2, gz], size: [half - gx1, 2], height: 3 },
    // a parked car just behind the gate, the exit bends around it
    { at: [9.5, gz - 22], size: PARKED, height: 1.6 },
  ]
  return { car: { at: [0, 0], yawDeg: 0 }, goal: [0, -140], boxes, puppets: [] }
}

/** A grid of 2 x 2 m pillars (13 m pitch, every other row shifted by half): a forest the car threads between (11 m free between pillars). */
function pillarForest(): ArenaSpec {
  const boxes: ArenaBox[] = sideWalls(45, -10, -175)
  for (let r = 0; r < 9; r++) {
    for (let c = -3; c <= 3; c++) {
      boxes.push({ at: [c * 13 + (r % 2 ? 6.5 : 0), -35 - r * 13], size: [2, 2], height: 3 })
    }
  }
  return { car: { at: [0, 0], yawDeg: 0 }, goal: [0, -170], boxes, puppets: [] }
}

export const AV_CROWD_CASES: CrowdCase[] = [
  { name: 'parked-gauntlet', about: 'two staggered rows of parked 4 x 8 cars, 7.5 m lane', seconds: 36, spec: parkedGauntlet },
  { name: 'clutter-field', about: '34 scattered boxes over 70 x 140 m', seconds: 30, spec: clutterField },
  { name: 'narrow-gap', about: 'wall across the road, one 9 m gate off the start line, parked car behind it', seconds: 25, spec: narrowGap },
  { name: 'pillar-forest', about: '2 x 2 m pillars on a 13 m grid, 9 rows', seconds: 30, spec: pillarForest },
]

/** The case spec with the neural drive mode set on the AV binding (extra params win over the example car's). */
export function withNeuralMode(spec: ArenaSpec, mode: 'off' | 'always' | 'auto', extra: Record<string, unknown> = {}): ArenaSpec {
  return { ...spec, extraParams: { ...spec.extraParams, neuralMode: mode, ...extra } }
}

/**
 * Trigger thresholds for these cases / the `av_neural_crowd` world. The plan's defaults (occupied share >= 0.5, confined share >= 0.6) never fire here:
 * the classic stack crosses them at 13-18 m/s and its rays see at most 3-5 of 11 forward rays inside 12 m. Phase 3 tunes the defaults on TRAIN cases.
 */
export const NEURAL_CROWD_TRIGGER = { neuralOnOcc: 0.27, neuralOnConf: 0.35, neuralOffOcc: 0.15, neuralOffConf: 0.2 } as const

// ---------------------------------------------------------------------------------------------------------------------
// Example world
// ---------------------------------------------------------------------------------------------------------------------

/** Case shown in the example world (File -> Example Worlds). */
export const NEURAL_CROWD_WORLD_CASE = 'parked-gauntlet'
export const NEURAL_CROWD_GOAL_MARKER_ID = 'crowd_goal_marker'

/**
 * The shipped example world: the AV car of the `self_hunt_flexible` world (copied exactly as the scripted-scenario arena does) in the parked-car
 * gauntlet with `neuralMode: 'auto'` (+ the crowd trigger thresholds above), a flat goal marker and a third-person follow camera.
 * `source` = the lab-loaded `self_hunt_flexible` world (current global library code). Exporter: tools/renn-mcp/export-av-neural-example-world.ts.
 */
export function buildNeuralCrowdExampleWorld(source: RennWorld, extraParams: Record<string, unknown> = {}): RennWorld {
  const c = AV_CROWD_CASES.find((x) => x.name === NEURAL_CROWD_WORLD_CASE)!
  const spec = withNeuralMode(c.spec(), 'auto', { ...NEURAL_CROWD_TRIGGER, ...extraParams })
  const world = buildArenaWorldFrom(source, spec)
  world.entities = [
    ...world.entities,
    { id: NEURAL_CROWD_GOAL_MARKER_ID, name: 'Goal', bodyType: 'static', shape: { type: 'cylinder', radius: 5, height: 0.2 }, position: [spec.goal[0], -0.09, spec.goal[1]], rotation: [0, 0, 0], material: { color: [1, 0.85, 0.1] } },
  ] as RennWorld['entities']
  world.world = {
    ...world.world,
    camera: { mode: 'thirdPerson', target: AV_CAR_SOURCE_ID, control: 'follow', distance: 36, height: 30, cameraTargetLag: 120, cameraPositionLag: 180 },
  }
  return world
}

/** Binding params of the v3 variant of the example world: the v3 net (forward AND reverse) drives the AV car, capped at 15 m/s. */
export const NEURAL_V3_WORLD_PARAMS = { neuralPolicy: 'v3', neuralReverse: true, neuralVMax: 15 } as const

/** Same scene as {@link buildNeuralCrowdExampleWorld} with the v3 policy + reversing (`av_neural_v3`). Exporter: tools/renn-mcp/export-av-neural-example-world.ts. */
export function buildNeuralV3ExampleWorld(source: RennWorld): RennWorld {
  return buildNeuralCrowdExampleWorld(source, NEURAL_V3_WORLD_PARAMS)
}
