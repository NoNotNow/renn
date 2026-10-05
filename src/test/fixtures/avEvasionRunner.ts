/* Scripted-scenario runner shared by av-evasion-scenarios.test.ts and av-evasion-sweep.*.test.ts */
import { runLab, forwardSpeed, yawOf, watchValues } from '@/test/avLab/lab'
import { DEFAULT_DT, type WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'
import {
  ARENA_CAR_ID,
  carSizeOf,
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
/** Distance (m) to the goal point that counts as reaching it (maze scenarios). */
export const GOAL_REACH = 10

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
  /** Fraction of driving frames (> 2 m/s) the motion planner was fixated on its aim point (economy budget, watch av.fixWhy). */
  fixShare: number
  /** First time (s) the forward speed reached 8 m/s (launch time-to-8); Infinity = never. */
  t8: number
  /** Distance driven in reverse (m, forward speed < -0.3 m/s). */
  reverseDist: number
  /** Mean |speed| over the frames driven in reverse (m/s); 0 without reversing. */
  reverseMeanSpeed: number
  /** First time (s) the car centre was >= 15 m from its start (leaving a pocket); Infinity = never. */
  leaveT: number
  /** First contact: `<what>@<t>s v=<forward speed>` (empty = none). */
  firstContact: string
  /** First one-frame forward-speed jump > 2 m/s. */
  firstSpike: string
  /** Frames per active speed-limit source of the speed planner ('cruise' | 'free' | 'near' | 'route' | 'curve' | 'goal' | 'maneuver'). */
  limitHist: Record<string, number>
  /** Smallest distance of the car centre to the goal over the run (m). */
  minGoalDist: number
  /** First time (s) the car centre was within `GOAL_REACH` m of the goal; Infinity = never. */
  goalReachT: number
  /** Direction reversals: forward-speed sign flips (hysteresis +-1 m/s). A K-turn costs 2-3. */
  reversals: number
  /** Peak lateral acceleration |v * yaw rate| (m/s^2) at > 5 m/s, yaw rate over 0.1 s. */
  peakLatAcc: number
  /** Lab motion-monitor episodes classified 'shuttle' / 'jitter' (slow back-and-forth without progress / chatter). */
  shuttleEvents: number
  /** Longest such episode (s). */
  shuttleMaxSec: number
  /** First 3 motion episodes: `kind@t (x,z)`. */
  shuttleInfo: string
  /** Straight-line tracking quality vs the start -> goal line, measured for t >= `PATH_SETTLE_T` (see `pathMetrics`). */
  path: PathMetrics
  /** Car track: [t, x, z, forward speed] every frame. */
  trace: [number, number, number, number][]
}

/** Seconds ignored at the start for the tracking metrics (launch + initial heading convergence). */
export const PATH_SETTLE_T = 6
/** The tracking metrics stop at the first sample closer than this to the goal (m): final approach / hold are not straight-line tracking. */
export const PATH_GOAL_CLEAR = 40

export interface PathMetrics {
  /** RMS / peak |cross-track| (m) from the start -> goal line after settling. */
  rmsCross: number
  peakCross: number
  /** Peak |cross-track| over the whole run (initial offset converge included). */
  peakCrossAll: number
  /** Amplitude (half peak-to-peak, deg) and frequency (Hz, zero crossings of the mean-removed heading error / 2) of the velocity-heading error after settling. */
  headAmpDeg: number
  headFreqHz: number
  /** Travelled path length / straight distance between the first and last settled sample (>= 1). */
  pathRatio: number
  /** Max |heading error| (deg) over the whole run (overshoot of an initial offset). */
  peakHeadAllDeg: number
}

/** Tracking metrics from the per-frame car track (positions, velocity heading) against the straight start -> goal line. */
function pathMetrics(allTrack: { t: number; x: number; z: number; hx: number; hz: number; v: number }[], start: V2, goal: V2): PathMetrics {
  // only the approach: up to the first time within PATH_GOAL_CLEAR of the goal (what follows is the final approach / hold, not straight-line tracking)
  const end = allTrack.findIndex((r) => Math.hypot(goal[0] - r.x, goal[1] - r.z) <= PATH_GOAL_CLEAR)
  const track = end < 0 ? allTrack : allTrack.slice(0, end)
  const lx = goal[0] - start[0]
  const lz = goal[1] - start[1]
  const ll = Math.hypot(lx, lz) || 1
  const ux = lx / ll
  const uz = lz / ll
  const lineYaw = Math.atan2(uz, ux)
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
  const cross = (r: { x: number; z: number }) => (r.x - start[0]) * -uz + (r.z - start[1]) * ux
  let peakAll = 0
  let peakHeadAll = 0
  for (const r of track) {
    peakAll = Math.max(peakAll, Math.abs(cross(r)))
    if (r.v > 2) peakHeadAll = Math.max(peakHeadAll, Math.abs(wrap(Math.atan2(r.hz, r.hx) - lineYaw)))
  }
  const set = track.filter((r) => r.t >= PATH_SETTLE_T && r.v > 2)
  const out: PathMetrics = { rmsCross: 0, peakCross: 0, peakCrossAll: peakAll, headAmpDeg: 0, headFreqHz: 0, pathRatio: 1, peakHeadAllDeg: (peakHeadAll * 180) / Math.PI }
  if (set.length < 10) return out
  out.rmsCross = Math.sqrt(set.reduce((a, r) => a + cross(r) ** 2, 0) / set.length)
  out.peakCross = Math.max(...set.map((r) => Math.abs(cross(r))))
  const he = set.map((r) => wrap(Math.atan2(r.hz, r.hx) - lineYaw))
  const mean = he.reduce((a, b) => a + b, 0) / he.length
  const d = he.map((h) => h - mean)
  out.headAmpDeg = (((Math.max(...d) - Math.min(...d)) / 2) * 180) / Math.PI
  let zc = 0
  for (let i = 1; i < d.length; i++) if (Math.sign(d[i]!) !== Math.sign(d[i - 1]!) && d[i] !== 0) zc++
  out.headFreqHz = zc / 2 / Math.max(1e-6, set[set.length - 1]!.t - set[0]!.t)
  let len = 0
  for (let i = 1; i < set.length; i++) len += Math.hypot(set[i]!.x - set[i - 1]!.x, set[i]!.z - set[i - 1]!.z)
  const chord = Math.hypot(set[set.length - 1]!.x - set[0]!.x, set[set.length - 1]!.z - set[0]!.z)
  out.pathRatio = len / Math.max(1e-6, chord)
  return out
}

export const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-')

function boxPoly(b: ArenaBox): V2[] {
  return rectPoly(b.at[0], b.at[1], ((b.yawDeg ?? 0) * Math.PI) / 180, b.size[0], b.size[1])
}

/** Runs one scenario headless from its defined start (a fresh world every call, seeded RNG, simulated clock). */
export interface ScenarioHooks {
  /** Per frame after the physics step (t = simulated seconds). */
  onFrame?: (ctx: { t: number; frame: number; sim: WorldSimulator; world: RennWorld }) => void
}

export async function runScenario(spec: ArenaSpec, seconds: number, hooks: ScenarioHooks = {}): Promise<ScenarioMetrics> {
  const world = buildArenaWorld(spec)
  let fixFrames = 0
  let driveFrames = 0
  const carSize = carSizeOf(spec)
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
    fixShare: 0,
    t8: Infinity,
    reverseDist: 0,
    reverseMeanSpeed: 0,
    leaveT: Infinity,
    firstContact: '',
    firstSpike: '',
    limitHist: {},
    minGoalDist: Infinity,
    goalReachT: Infinity,
    reversals: 0,
    peakLatAcc: 0,
    shuttleEvents: 0,
    shuttleMaxSec: 0,
    shuttleInfo: '',
    path: { rmsCross: 0, peakCross: 0, peakCrossAll: 0, headAmpDeg: 0, headFreqHz: 0, pathRatio: 1, peakHeadAllDeg: 0 },
    trace: [],
  }
  const track: { t: number; x: number; z: number; hx: number; hz: number; v: number }[] = []
  let revSign = 0
  let revFrames = 0
  let stalled = 0
  let speedSum = 0
  let prevSpeed: number | null = null
  const yawHist: number[] = []
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
      if (Math.abs(fwd) > 2) {
        driveFrames++
        if (watchValues(ARENA_CAR_ID)['av.fixWhy'] === 'fix') fixFrames++
      }
      hooks.onFrame?.({ t, frame, sim, world })
      const hull = rectPoly(cp[0], cp[2], yawOf(q), carSize[0], carSize[1])
      m.trace.push([t, cp[0], cp[2], fwd])
      track.push({ t, x: cp[0], z: cp[2], hx: v[0], hz: v[2], v: Math.hypot(v[0], v[2]) * Math.sign(fwd || 1) })
      if (process.env.AV_SCENARIO_TRACE === '2' && (process.env.AV_TRACE_T0 ? t >= +process.env.AV_TRACE_T0 && t <= +(process.env.AV_TRACE_T1 ?? 1e9) : frame % 15 === 14)) {
        // 4 Hz detail: car pose / yaw / speed and every chaser (x, z, yaw deg, gap)
        const ch = [...puppets.values()].map((p) => {
          const g = polyGap(hull, rectPoly(p.s.x, p.s.z, p.s.yaw, p.spec.size[0], p.spec.size[1]))
          return `${p.spec.id}(${p.s.x.toFixed(0)},${p.s.z.toFixed(0)} y${((p.s.yaw * 180) / Math.PI).toFixed(0)} g${g.toFixed(1)})`
        })
        const w = watchValues(ARENA_CAR_ID)
        const wv = ['av.plan.kappa', 'av.plan.free', 'av.vLimit', 'av.aeb', 'av.flee', 'av.mode', 'av.route', 'av.maneuver', 'av.revc', 'av.carrotw', 'av.latk', 'av.throttle'].map((k) => (w[k] != null ? `${k.slice(3)}=${w[k]}` : '')).filter(Boolean).join(' ')
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
      if (fwd < -0.3) {
        m.reverseDist += -fwd * DEFAULT_DT
        revFrames++
      }
      if (m.leaveT === Infinity && Math.hypot(cp[0] - spec.car.at[0], cp[2] - spec.car.at[1]) >= 15) m.leaveT = t
      if (Math.abs(fwd) >= 8 && m.t8 === Infinity) m.t8 = t
      m.peakSpeed = Math.max(m.peakSpeed, fwd)
      m.peakReverse = Math.max(m.peakReverse, -fwd)
      // the first 0.5 s are the standing-start launch kick (0 -> 8 m/s in one frame, reported separately in the findings), not a reaction
      if (t > 0.5 && prevSpeed !== null && Math.abs(fwd - prevSpeed) > 2) {
        m.speedSpikes++
        m.firstSpike ||= `${t.toFixed(2)}s ${f1(prevSpeed)} -> ${f1(fwd)} m/s at (${cp[0].toFixed(0)},${cp[2].toFixed(0)})`
      }
      if (t <= 0.5) m.launchMaxDv = Math.max(m.launchMaxDv, Math.abs(fwd - (prevSpeed ?? spec.car.speed ?? 0)))
      prevSpeed = fwd
      {
        const yw = yawOf(q)
        yawHist.push(yw)
        const lag = Math.round(0.1 / DEFAULT_DT)
        if (yawHist.length > lag && Math.abs(fwd) > 5) {
          let dy = yw - yawHist[yawHist.length - 1 - lag]!
          dy = Math.atan2(Math.sin(dy), Math.cos(dy))
          m.peakLatAcc = Math.max(m.peakLatAcc, Math.abs((fwd * dy) / (lag * DEFAULT_DT)))
        }
      }
      endDist = Math.hypot(cp[0] - goal[0], cp[2] - goal[1])
      m.minGoalDist = Math.min(m.minGoalDist, endDist)
      if (endDist < GOAL_REACH && m.goalReachT === Infinity) m.goalReachT = t
      if (Math.abs(fwd) > 1) {
        const sg = Math.sign(fwd)
        if (revSign !== 0 && sg !== revSign) m.reversals++
        revSign = sg
      }
    },
  })
  if (process.env.AV_SCENARIO_TRACE) {
    // one row per second: t, car x / z, forward speed (debug a scenario: AV_SCENARIO_TRACE=1)
    const rows = m.trace.filter((_, i) => i % 60 === 59).map((r) => `${r[0].toFixed(0)}s (${r[1].toFixed(0)},${r[2].toFixed(0)}) v${r[3].toFixed(1)}`)
    console.log(`TRACE ${rows.join(' | ')}`)
  }
  m.shuttleInfo = res.events.filter((ev) => ev.kind === 'shuttle' || ev.kind === 'jitter').slice(0, 3).map((ev) => `${ev.kind}@${((ev.windowStartFrame * DEFAULT_DT)).toFixed(0)}-${((ev.endFrame ?? ev.startFrame) * DEFAULT_DT).toFixed(0)}s (${ev.at.x.toFixed(0)},${ev.at.z.toFixed(0)})`).join(' ')
  m.shuttleMaxSec = Math.max(0, ...res.events.filter((ev) => ev.kind === 'shuttle' || ev.kind === 'jitter').map((ev) => ((ev.endFrame ?? ev.startFrame) - ev.windowStartFrame) * DEFAULT_DT))
  m.shuttleEvents = res.events.filter((ev) => ev.kind === 'shuttle' || ev.kind === 'jitter').length
  m.path = pathMetrics(track, spec.car.at, goal)
  m.stalledSec = stalled * DEFAULT_DT
  m.fixShare = fixFrames / Math.max(1, driveFrames)
  m.reverseMeanSpeed = revFrames > 0 ? m.reverseDist / (revFrames * DEFAULT_DT) : 0
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
    // standing-start launch: no one-frame velocity kick (a command that is 8x too large because of wrong actuator priors: 0 -> 8 m/s in a frame)
    if (m.launchMaxDv > 1.5) out.push(`launch kick ${f1(m.launchMaxDv)} m/s in one frame (> 1.5)`)
    if (m.endSpeed < (opts.minEndSpeed ?? 2)) out.push(`not moving at the end (${f1(m.endSpeed)} m/s)`)
    if (m.stalledSec > (opts.maxStalledSec ?? 5)) out.push(`stalled ${f1(m.stalledSec)} s > ${opts.maxStalledSec ?? 5}`)
    return out
  }
}

