import { afterAll, describe, expect, it } from 'vitest'
import { runLab, forwardSpeed, yawOf, watchValues } from '@/test/avLab/lab'
import { DEFAULT_DT } from '@/test/helpers/worldSimulator'
import {
  ARENA_CAR_ID,
  CAR_SIZE,
  buildArenaWorld,
  headingDir,
  initialPuppetState,
  pointPolyGap,
  polyGap,
  rectPoly,
  stepPuppet,
  type ArenaBox,
  type ArenaSpec,
  type PuppetSpec,
  type PuppetState,
  type V2,
} from '@/test/fixtures/avEvasionArena'

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

const SEED = 1
const SCENARIO_TIMEOUT = 120_000
/** Hull-to-hull gap (m) below which two bodies count as touching. */
const CONTACT_GAP = 0.1

// ---------------------------------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------------------------------

export interface ScenarioMetrics {
  /** Smallest hull-to-hull gap to any chaser (m); Infinity without chasers. */
  minChaserGap: number
  chaserContactFrames: number
  /** Same against static boxes. */
  minStaticGap: number
  staticContactFrames: number
  clutterHitFrames: number
  /** Seconds below 0.5 m/s after the first second. */
  stalledSec: number
  steerReversalsPerSec: number
  /** Signed forward speed (negative = reversing). */
  meanSpeed: number
  peakSpeed: number
  peakReverse: number
  /** Mean |forward speed| over the last 1.5 s. */
  endSpeed: number
  /** Distance to the goal at start minus at the end (m). */
  progress: number
  /** Frames with a forward-speed change > 2 m/s in one frame. */
  speedSpikes: number
  /** First contact: `<what>@<t>s v=<forward speed>` (empty = none). */
  firstContact: string
  /** First one-frame forward-speed jump > 2 m/s. */
  firstSpike: string
  /** Frames per active speed-limit source of the speed planner ('cruise' | 'free' | 'near' | 'route' | 'curve' | 'goal' | 'maneuver'). */
  limitHist: Record<string, number>
  /** Car track: [t, x, z, forward speed] every frame. */
  trace: [number, number, number, number][]
}

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

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-')

function boxPoly(b: ArenaBox): V2[] {
  return rectPoly(b.at[0], b.at[1], ((b.yawDeg ?? 0) * Math.PI) / 180, b.size[0], b.size[1])
}

/** Runs one scenario headless from its defined start (a fresh world every call, seeded RNG, simulated clock). */
export async function runScenario(spec: ArenaSpec, seconds: number): Promise<ScenarioMetrics> {
  const world = buildArenaWorld(spec)
  const frames = Math.round(seconds / DEFAULT_DT)
  const puppets = new Map<string, { spec: PuppetSpec; s: PuppetState }>(spec.puppets.map((p) => [p.id, { spec: p, s: initialPuppetState(p) }]))
  const staticPolys = spec.boxes.map(boxPoly)
  const clutterIds = (spec.clutter ?? []).map((_, i) => `clutter_${i}`)
  const goal = spec.goal
  const m: ScenarioMetrics = {
    minChaserGap: Infinity,
    chaserContactFrames: 0,
    minStaticGap: Infinity,
    staticContactFrames: 0,
    clutterHitFrames: 0,
    stalledSec: 0,
    steerReversalsPerSec: 0,
    meanSpeed: 0,
    peakSpeed: 0,
    peakReverse: 0,
    endSpeed: 0,
    progress: 0,
    speedSpikes: 0,
    firstContact: '',
    firstSpike: '',
    limitHist: {},
    trace: [],
  }
  let stalled = 0
  let speedSum = 0
  let prevSpeed: number | null = null
  const startDist = Math.hypot(spec.car.at[0] - goal[0], spec.car.at[1] - goal[1])
  let endDist = startDist
  const res = await runLab({
    world: { inline: world },
    preparedWorld: world,
    applyLibrary: false,
    focus: ARENA_CAR_ID,
    seed: SEED,
    frames,
    profile: false,
    maxScenes: 0,
    beforeFrame: ({ frame, sim }) => {
      const pw = sim.getPhysicsWorld()
      if (frame === 0 && spec.car.speed) {
        const d = headingDir((spec.car.yawDeg * Math.PI) / 180)
        pw.getBody(ARENA_CAR_ID)?.setLinvel({ x: d[0] * spec.car.speed, y: 0, z: d[1] * spec.car.speed }, true)
      }
      const cp = sim.getPosition(ARENA_CAR_ID)
      const cv = sim.getVelocity(ARENA_CAR_ID)
      for (const [id, p] of puppets) {
        stepPuppet(p.spec, p.s, frame * DEFAULT_DT, DEFAULT_DT, { pos: [cp[0], cp[2]], vel: [cv[0], cv[2]] })
        pw.setNextKinematicPose(id, p.s.x, 0.75, p.s.z, [0, p.s.yaw, 0])
      }
    },
    onFrame: ({ frame, sim }) => {
      const t = (frame + 1) * DEFAULT_DT
      const cp = sim.getPosition(ARENA_CAR_ID)
      const q = sim.getRotation(ARENA_CAR_ID)
      const v = sim.getVelocity(ARENA_CAR_ID)
      const fwd = forwardSpeed(q, v)
      const hull = rectPoly(cp[0], cp[2], yawOf(q), CAR_SIZE[0], CAR_SIZE[1])
      m.trace.push([t, cp[0], cp[2], fwd])
      if (process.env.AV_SCENARIO_TRACE === '2' && (process.env.AV_TRACE_T0 ? t >= +process.env.AV_TRACE_T0 && t <= +(process.env.AV_TRACE_T1 ?? 1e9) : frame % 15 === 14)) {
        // 4 Hz detail: car pose / yaw / speed and every chaser (x, z, yaw deg, gap)
        const ch = [...puppets.values()].map((p) => {
          const g = polyGap(hull, rectPoly(p.s.x, p.s.z, p.s.yaw, p.spec.size[0], p.spec.size[1]))
          return `${p.spec.id}(${p.s.x.toFixed(0)},${p.s.z.toFixed(0)} y${((p.s.yaw * 180) / Math.PI).toFixed(0)} g${g.toFixed(1)})`
        })
        const w = watchValues(ARENA_CAR_ID)
        const wv = ['av.plan.kappa', 'av.plan.free', 'av.vLimit', 'av.aeb', 'av.flee', 'av.mode', 'av.throttle'].map((k) => (w[k] != null ? `${k.slice(3)}=${w[k]}` : '')).filter(Boolean).join(' ')
        console.log(`T ${t.toFixed(2)} [${wv}] car(${cp[0].toFixed(1)},${cp[2].toFixed(1)} y${(((yawOf(q) - Math.PI) * 180) / Math.PI).toFixed(0)} v${fwd.toFixed(1)}) ${ch.join(' ')}`)
      }
      for (const p of puppets.values()) {
        const g = polyGap(hull, rectPoly(p.s.x, p.s.z, p.s.yaw, p.spec.size[0], p.spec.size[1]))
        m.minChaserGap = Math.min(m.minChaserGap, g)
        if (g < CONTACT_GAP) {
          m.chaserContactFrames++
          m.firstContact ||= `${p.spec.id}@${t.toFixed(1)}s v=${f1(fwd)}`
        }
      }
      let staticTouch = false
      for (let bi = 0; bi < staticPolys.length; bi++) {
        const g = polyGap(hull, staticPolys[bi]!)
        m.minStaticGap = Math.min(m.minStaticGap, g)
        if (g < CONTACT_GAP) {
          staticTouch = true
          m.firstContact ||= `box${bi}@${t.toFixed(1)}s v=${f1(fwd)}`
        }
      }
      if (staticTouch) m.staticContactFrames++
      let hit = false
      for (const id of clutterIds) {
        const p = sim.getPosition(id)
        if (pointPolyGap(p[0], p[2], hull) < 0.85 + CONTACT_GAP) hit = true
      }
      if (hit) m.clutterHitFrames++
      if (t > 1 && Math.hypot(v[0], v[2]) < 0.5) stalled++
      speedSum += fwd
      m.peakSpeed = Math.max(m.peakSpeed, fwd)
      m.peakReverse = Math.max(m.peakReverse, -fwd)
      // the first 0.5 s are the standing-start launch kick (0 -> 8 m/s in one frame, reported separately in the findings), not a reaction
      if (t > 0.5 && prevSpeed !== null && Math.abs(fwd - prevSpeed) > 2) {
        m.speedSpikes++
        m.firstSpike ||= `${t.toFixed(2)}s ${f1(prevSpeed)} -> ${f1(fwd)} m/s at (${cp[0].toFixed(0)},${cp[2].toFixed(0)})`
      }
      prevSpeed = fwd
      endDist = Math.hypot(cp[0] - goal[0], cp[2] - goal[1])
    },
  })
  if (process.env.AV_SCENARIO_TRACE) {
    // one row per second: t, car x / z, forward speed (debug a scenario: AV_SCENARIO_TRACE=1)
    const rows = m.trace.filter((_, i) => i % 60 === 59).map((r) => `${r[0].toFixed(0)}s (${r[1].toFixed(0)},${r[2].toFixed(0)}) v${r[3].toFixed(1)}`)
    console.log(`TRACE ${rows.join(' | ')}`)
  }
  m.stalledSec = stalled * DEFAULT_DT
  m.steerReversalsPerSec = res.steerReversalsPerSec
  m.limitHist = res.limitHist
  m.meanSpeed = speedSum / Math.max(1, frames)
  const tail = m.trace.slice(-Math.round(1.5 / DEFAULT_DT))
  m.endSpeed = tail.reduce((a, r) => a + Math.abs(r[3]), 0) / Math.max(1, tail.length)
  m.progress = startDist - endDist
  return m
}

// ---------------------------------------------------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------------------------------------------------

/** Shared "survive and keep driving" criteria; extend per scenario. */
function surviveCriteria(opts: { minChaserGap?: number; maxStalledSec?: number; minEndSpeed?: number } = {}) {
  return (m: ScenarioMetrics): string[] => {
    const out: string[] = []
    if (m.chaserContactFrames > 0) out.push(`touched a chaser (${m.chaserContactFrames} frames)`)
    if (m.minChaserGap < (opts.minChaserGap ?? 1)) out.push(`min chaser gap ${f1(m.minChaserGap)} m < ${opts.minChaserGap ?? 1}`)
    if (m.staticContactFrames > 0) out.push(`touched a static obstacle (${m.staticContactFrames} frames)`)
    if (m.endSpeed < (opts.minEndSpeed ?? 2)) out.push(`not moving at the end (${f1(m.endSpeed)} m/s)`)
    if (m.stalledSec > (opts.maxStalledSec ?? 5)) out.push(`stalled ${f1(m.stalledSec)} s > ${opts.maxStalledSec ?? 5}`)
    return out
  }
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
    criteria: surviveCriteria(),
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
