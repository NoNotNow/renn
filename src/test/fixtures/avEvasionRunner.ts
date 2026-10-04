/* Scripted-scenario runner shared by av-evasion-scenarios.test.ts and av-evasion-sweep.*.test.ts */
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

export const SEED = 1
export const SCENARIO_TIMEOUT = 120_000
/** Hull-to-hull gap (m) below which two bodies count as touching. */
export const CONTACT_GAP = 0.1

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
  /** Max |forward speed change| in one frame during the first 0.5 s (standing-start launch kick; includes frame 0). */
  launchMaxDv: number
  /** First contact: `<what>@<t>s v=<forward speed>` (empty = none). */
  firstContact: string
  /** First one-frame forward-speed jump > 2 m/s. */
  firstSpike: string
  /** Frames per active speed-limit source of the speed planner ('cruise' | 'free' | 'near' | 'route' | 'curve' | 'goal' | 'maneuver'). */
  limitHist: Record<string, number>
  /** Car track: [t, x, z, forward speed] every frame. */
  trace: [number, number, number, number][]
}

export const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-')

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
    launchMaxDv: 0,
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
      if (t <= 0.5) m.launchMaxDv = Math.max(m.launchMaxDv, Math.abs(fwd - (prevSpeed ?? spec.car.speed ?? 0)))
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
export function surviveCriteria(opts: { minChaserGap?: number; maxStalledSec?: number; minEndSpeed?: number } = {}) {
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

