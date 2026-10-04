import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { type ArenaBox, type ArenaSpec, type V2 } from '@/test/fixtures/avEvasionArena'
import { SEED, SCENARIO_TIMEOUT, f1, runScenario, surviveCriteria, type ScenarioMetrics } from '@/test/fixtures/avEvasionRunner'

/**
 * Deterministic, scripted AV scenarios with pass / fail criteria (instead of noisy random-seed aggregates).
 *
 * Each scenario = defined start poses (reset every run), a fixed goal, static boxes, KINEMATIC PUPPET chasers on scripted
 * paths (straight lines, or homing on the car with a fixed speed and turn-rate limit), a fixed duration and criteria on the
 * run metrics. The car is the `self_hunt_flexible` AV (same pipe + params, see `fixtures/avEvasionArena.ts`).
 *
 * KNOWN-FAILING MECHANISM: `KNOWN_FAILING[name] = 'suspected cause'` runs that scenario with `it.fails` — the suite stays
 * green in CI, the printed table still shows FAIL (+ the failed criteria) and a scenario that starts passing turns its
 * `it.fails` red, which forces removing the entry. Fixing the AV: delete the entry, the scenario becomes a normal `it`.
 *
 * Add a scenario: see `agent-context/feature-av-lab.md` ("Scripted scenarios").
 */

interface Scenario {
  name: string
  /** What is tested (one line, printed). */
  about: string
  seconds: number
  /** Built lazily (a scenario may derive its timing from another run). */
  spec: () => Promise<ArenaSpec> | ArenaSpec
  /** Returns the violated criteria (empty = pass). */
  criteria: (m: ScenarioMetrics) => string[]
}

export interface ScenarioResult {
  name: string
  pass: boolean
  failed: string[]
  m: ScenarioMetrics
}

// ---------------------------------------------------------------------------------------------------------------------
// Open-road baseline (scenario 8 and the timing reference of the crossing)
// ---------------------------------------------------------------------------------------------------------------------

const OPEN_ROAD: ArenaSpec = { car: { at: [0, 340], yawDeg: 0 }, goal: [0, -340], boxes: [], puppets: [] }
let openRoadRun: Promise<ScenarioMetrics> | null = null
function openRoadBaseline(): Promise<ScenarioMetrics> {
  openRoadRun ??= runScenario(OPEN_ROAD, 20)
  return openRoadRun
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------------------------------

const CHASER: V2 = [2.5, 5]
const wall = (at: V2, size: V2, yawDeg = 0): ArenaBox => ({ at, size, yawDeg })

/** Alley: two long walls along Z (interior `inner` m wide) from z0 to z1. */
function alley(x: number, inner: number, z0: number, z1: number): ArenaBox[] {
  const c = (z0 + z1) / 2
  const len = Math.abs(z1 - z0)
  return [wall([x - inner / 2 - 1, c], [2, len]), wall([x + inner / 2 + 1, c], [2, len])]
}

const SCENARIOS: Scenario[] = [
  {
    name: 'head-on',
    about: 'chaser at 25 m/s straight down the car lane toward the car',
    seconds: 14,
    spec: () => ({
      car: { at: [0, 150], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [{ id: 'chaser_a', size: CHASER, at: [0, -200], yawDeg: 180, motion: { kind: 'line', speed: 25 } }],
    }),
    criteria: surviveCriteria(),
  },
  {
    name: 'from-behind',
    about: 'car at 12 m/s, 30 m/s chaser homing from 45 m behind (turn rate 1.2 rad/s)',
    seconds: 14,
    spec: () => ({
      car: { at: [0, 100], yawDeg: 0, speed: 12 },
      goal: [0, -300],
      boxes: [],
      puppets: [{ id: 'chaser_a', size: CHASER, at: [0, 145], yawDeg: 0, motion: { kind: 'home', speed: 30, turnRate: 1.2 } }],
    }),
    criteria: surviveCriteria(),
  },
  {
    name: 'pincer',
    about: 'two 25 m/s chasers converging from left and right (homing, lead 0.5 s)',
    seconds: 14,
    spec: () => ({
      car: { at: [0, 100], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [
        { id: 'chaser_l', size: CHASER, at: [-75, 40], yawDeg: -90, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.5 } },
        { id: 'chaser_r', size: CHASER, at: [75, 40], yawDeg: 90, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.5 } },
      ],
    }),
    criteria: surviveCriteria(),
  },
  {
    name: 'crossing',
    about: 'chaser crosses the path at 25 m/s, timed (from the open-road baseline) to hit the car 6 s in if it keeps going',
    seconds: 14,
    spec: async () => {
      const base = await openRoadBaseline()
      const tHit = 6
      const row = base.trace[Math.round(tHit / DEFAULT_DT) - 1]!
      const speed = 25
      // car start shifted so the crossing happens in the free arena (baseline starts at z=340, same x)
      return {
        car: { ...OPEN_ROAD.car },
        goal: OPEN_ROAD.goal,
        boxes: [],
        puppets: [{ id: 'chaser_a', size: CHASER, at: [row[1] - speed * tHit, row[2]], yawDeg: -90, motion: { kind: 'line', speed } }],
      }
    },
    criteria: surviveCriteria(),
  },
  {
    name: 'corner-trap',
    about: 'car 25 m from a wall corner, 30 m/s homing chaser from the open side',
    seconds: 14,
    spec: () => ({
      car: { at: [-36, -30], yawDeg: 0 },
      goal: [120, 120],
      boxes: [wall([-60, -10], [2, 100]), wall([-10, -60], [100, 2])],
      puppets: [{ id: 'chaser_a', size: CHASER, at: [70, 70], yawDeg: 135, motion: { kind: 'home', speed: 30, turnRate: 1.5, lead: 0.3 } }],
    }),
    criteria: surviveCriteria({ minChaserGap: 5 }),
  },
  {
    name: 'corridor-block',
    about: 'a wide vehicle parks across a 20 m corridor ahead; the goal is behind the corridor (turn around / route around)',
    seconds: 20,
    spec: () => ({
      car: { at: [0, 120], yawDeg: 0 },
      goal: [0, -300],
      boxes: alley(0, 20, -30, -230),
      puppets: [{ id: 'blocker', size: [19, 4], at: [0, -60], yawDeg: 0, motion: { kind: 'park' } }],
    }),
    criteria: (m) => surviveCriteria({ minChaserGap: 0.5 })(m),
  },
  {
    name: 'reverse-escape',
    about: 'nose 7 m from a wall in a dead-end pocket, free way behind, obstacle 60 m behind: reverse looking backward, stop / steer before it',
    seconds: 20,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, 200],
      boxes: [wall([0, -12], [60, 2]), ...alley(0, 24, -12, 35), wall([0, 60], [16, 2])],
      puppets: [],
    }),
    criteria: (m) => {
      const out = surviveCriteria({ maxStalledSec: 6 })(m)
      if (m.progress < 40) out.push(`no progress toward the goal (${f1(m.progress)} m < 40)`)
      if (m.minStaticGap < 0.3) out.push(`min static gap ${f1(m.minStaticGap)} m`)
      return out
    },
  },
  {
    name: 'open-road-speed',
    about: 'no chasers, 680 m free straight: reach >= 25 m/s',
    seconds: 20,
    spec: () => OPEN_ROAD,
    criteria: (m) => {
      const out = surviveCriteria()(m)
      if (m.peakSpeed < 25) out.push(`peak speed ${f1(m.peakSpeed)} m/s < 25`)
      return out
    },
  },
  {
    name: 'open-road-reverse',
    about: 'wall 9 m ahead in an 18 m alley (no U-turn), 350 m free behind: reverse at >= 8 m/s',
    seconds: 20,
    spec: () => ({
      car: { at: [0, 0], yawDeg: 0 },
      goal: [0, 350],
      boxes: [wall([0, -14], [22, 2]), ...alley(0, 18, -14, 400)],
      puppets: [],
    }),
    criteria: (m) => {
      const out = surviveCriteria()(m)
      if (m.peakReverse < 8) out.push(`peak reverse speed ${f1(m.peakReverse)} m/s < 8`)
      if (m.progress < 150) out.push(`only ${f1(m.progress)} m toward the goal in 20 s (< 150)`)
      return out
    },
  },
  {
    name: 'clutter',
    about: '24 light bouncy cubes scattered over the path: no destabilising speed spikes, still driving',
    seconds: 14,
    spec: () => ({
      car: { at: [0, 200], yawDeg: 0 },
      goal: [0, -300],
      boxes: [],
      puppets: [],
      // deterministic scatter over a 24 m wide band, 7 m apart along the path
      clutter: Array.from({ length: 24 }, (_, i): { at: V2 } => ({ at: [(((i * 37) % 23) - 11) * 1.0, 150 - i * 7] })),
    }),
    criteria: (m) => {
      const out = surviveCriteria()(m)
      if (m.speedSpikes > 0) out.push(`${m.speedSpikes} speed spikes (> 2 m/s in one frame; ${m.clutterHitFrames} frames touching clutter)`)
      return out
    },
  },
]

/**
 * Scenarios the AV does not pass today -> `it.fails` (suite green, table shows FAIL). Value = suspected cause.
 * Remove the entry as soon as the scenario passes (`it.fails` then turns red to remind you).
 */
const KNOWN_FAILING: Record<string, string> = {}

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------

const results: ScenarioResult[] = []

function line(r: ScenarioResult): string {
  const m = r.m
  return (
    `${r.pass ? 'PASS' : 'FAIL'} ${r.name.padEnd(17)} minChaserGap ${f1(m.minChaserGap).padStart(6)} m | contact ${String(m.chaserContactFrames).padStart(3)}f chaser ` +
    `${String(m.staticContactFrames).padStart(3)}f static | stalled ${f1(m.stalledSec).padStart(4)} s | steer rev ${m.steerReversalsPerSec.toFixed(2)}/s | ` +
    `speed mean ${f1(m.meanSpeed).padStart(5)} peak ${f1(m.peakSpeed).padStart(5)} rev ${f1(m.peakReverse).padStart(5)} end ${f1(m.endSpeed).padStart(5)} | progress ${f1(m.progress)} m` +
    (r.failed.some((f) => f.includes('speed')) ? `\n      speed limit source (frames) ${JSON.stringify(r.m.limitHist)}` : '') +
    (r.m.speedSpikes ? `\n      ${r.m.speedSpikes} speed spikes, first ${r.m.firstSpike}` : '') +
    (r.m.firstContact ? `\n      first contact ${r.m.firstContact}` : '') +
    (r.failed.length ? `\n      -> ${r.failed.join('; ')}` : '')
  )
}

describe('AV evasion scenarios (scripted, deterministic)', () => {
  afterAll(() => {
    console.log(`\nAV SCENARIOS (seed ${SEED}):\n${results.map((r) => line(r) + (KNOWN_FAILING[r.name] ? `\n      known: ${KNOWN_FAILING[r.name]}` : '')).join('\n')}\n`)
  })

  for (const sc of SCENARIOS) {
    const known = KNOWN_FAILING[sc.name] != null
    const run = known ? it.fails : it
    run(
      `${sc.name}: ${sc.about}`,
      async () => {
        const spec = await sc.spec()
        const m = await runScenario(spec, sc.seconds)
        const failed = sc.criteria(m)
        results.push({ name: sc.name, pass: failed.length === 0, failed, m })
        expect(failed).toEqual([])
      },
      SCENARIO_TIMEOUT,
    )
  }
})
