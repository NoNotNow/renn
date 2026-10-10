import { polyGap, rectPoly, upY, type V2 } from '@/avEvolution/eval/geometry'
import { installDeterminism } from '@/test/avLab/determinism'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'
import { createRng } from '@/avEvolution/core/rng'
import { buildCourse, buildSetupCourse, parseCourseKey, RouteProgress, COURSE_START, type Course } from './courses'
import { chainOfEpisode, isChainEpisodeKey, polylineLength } from './chains'
import { hiddenOfLength, N_IN_V2, POLICY_ACTUATOR_ID, POLICY_STAGE_CODE, POLICY_STAGE_CODE_V2, POLICY_STAGE_ID } from './policy'


/**
 * One policy episode, pure and browser-safe: a FRESH world per call (defined start), seeded clock, one metrics record
 * out. Calls must not interleave in one thread (the determinism patch is global): run them one at a time per worker.
 *
 * Ends on contact with an obstacle ("crash"), when the route progress stalls, when the car flips, at the end of the
 * route ("finish") or at the time limit. Score = progress x mean speed = progress^2 / time.
 */

export const POLICY_CAR_ID = 'policy_car_body'
export const CAR_SIZE: V2 = [4, 8]
const CAR_START_Y = 0.494
const CONTACT_GAP = 0.1
export const EPISODE_SECONDS = 60
const STALL_WINDOW_S = 3
const STALL_MIN_PROGRESS = 1
const FINISH_MARGIN = 5
export const OFF_COURSE_M = 16
/** v2 chain episodes: farther than this from the COMMANDED chain ends the episode (chains differ by >= 10 m, so the wrong route is caught) */
export const OFF_CHAIN_M = 6
/** v2 chains are up to 1.8 x longer than the track, so the time limit is longer too */
export const CHAIN_EPISODE_SECONDS = 90
/** relative noise on every ray distance during evolution episodes (example worlds run noise free) */
export const SENSOR_NOISE = 0.02
/** a perfect-ish run averages ~10 m/s over the whole route: score / (length x 10) is then ~1 on every course */
const NORM_SPEED = 10

/** Vehicle model of the shipped AV car (body + car2 actuator), unchanged. */
const CAR_BODY = { mass: 2, restitution: 0.1, friction: 0.01, angularDamping: 0.3 }
const CAR2_PARAMS = { power: 2400, steeringIntensity: 0.1, steeringSpeed: 0.51, lateralGrip: 100, tireGripSlipSpeedThreshold: 2, lateralGripSlipScale: 0.3, jumpImpulse: 200 }

/** `offcourse`: farther than OFF_COURSE_M from the route polyline (a safety net on top of the walls; counts like a crash) */
export type EpisodeOutcome = 'crash' | 'offcourse' | 'stall' | 'flip' | 'finish' | 'timeout'

export interface PolicyEpisodeMetrics {
  key: string
  outcome: EpisodeOutcome
  /** route progress (m) */
  progress: number
  /** sim seconds survived */
  timeS: number
  meanSpeed: number
  score: number
  /** score / (route length x NORM_SPEED): comparable across course kinds */
  norm: number
  wallMs: number
  /** length of the route / commanded chain (m); progress / length is the fraction covered */
  length?: number
}

/** Entities + transformer stages of one course driven by one policy; `origin` shifts the whole course (several courses in one world). */
/** Seeded command configuration of a v2 episode (lookahead, refresh period, bearing noise); `seed` drives the bearing noise. */
export interface CmdConfig {
  lmin: number
  tau: number
  period: number
  noiseDeg: number
  seed: number
}

export function hashKey(key: string): number {
  let h = 17
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * Lookahead ranges of the command (m / s): L = clamp(Lmin + T v, Lmin, 40) in the stage. The spec's first guess (Lmin 10-20, T 1-2 s) made a pure-pursuit
 * follower cut every corner into the obstacles (20 % of the slalom chains finished); 6-10 m / 0.4-0.8 s finishes 90-100 % of them.
 */
export const CMD_LMIN_RANGE: [number, number] = [6, 10]
export const CMD_TAU_RANGE: [number, number] = [0.4, 0.8]

/** Per-episode command config: Lmin / T from the ranges above, refresh every 0.2-0.8 s, bearing noise +-3 deg. */
export function cmdConfigFor(key: string): CmdConfig {
  const rng = createRng(hashKey(key) ^ 0x5bd1e995)
  const range = (lo: number, hi: number) => lo + (hi - lo) * rng.next()
  return { lmin: range(...CMD_LMIN_RANGE), tau: range(...CMD_TAU_RANGE), period: range(0.2, 0.8), noiseDeg: 3, seed: (hashKey(key) * 2654435761) >>> 0 }
}

/**
 * Entities + transformer stages of one course driven by one policy; `origin` shifts the whole course (several courses in one world).
 * With `opts.chain` (v2) the stage derives its command from that chain polyline and `opts.cmd`; without it the v1 goal stage is used.
 */
export function policyCourseParts(course: Course, genome: ArrayLike<number>, opts: { origin?: V2; suffix?: string; noise?: number; noiseSeed?: number; chain?: V2[]; cmd?: CmdConfig } = {}) {
  const [ox, oz] = opts.origin ?? [0, 0]
  const sfx = opts.suffix ?? ''
  const carId = POLICY_CAR_ID + sfx
  const stageId = POLICY_STAGE_ID + sfx
  const actuatorId = POLICY_ACTUATOR_ID + sfx
  const rad = (d: number) => (d * Math.PI) / 180
  const entities: unknown[] = [
    {
      id: carId,
      name: 'Policy car' + sfx,
      bodyType: 'dynamic',
      shape: { type: 'box', width: CAR_SIZE[0], height: 1, depth: CAR_SIZE[1] },
      position: [(course.startAt ?? COURSE_START)[0] + ox, CAR_START_Y, (course.startAt ?? COURSE_START)[1] + oz],
      rotation: [0, rad(course.startYawDeg ?? 0), 0],
      ...CAR_BODY,
      transformers: [stageId, actuatorId],
    },
  ]
  course.boxes.forEach((b, i) => {
    const h = 6
    entities.push({
      id: `box_${i}${sfx}`,
      name: `Box ${i}${sfx}`,
      bodyType: 'static',
      shape: { type: 'box', width: b.size[0], height: h, depth: b.size[1] },
      position: [b.at[0] + ox, h / 2, b.at[1] + oz],
      rotation: [0, rad(b.yawDeg), 0],
      friction: 0.5,
    })
  })
  const transformers = {
    [stageId]: {
      type: 'custom',
      priority: 5,
      enabled: true,
      name: 'Policy drive',
      code: opts.chain ? POLICY_STAGE_CODE_V2 : POLICY_STAGE_CODE,
      params: {
        w: Array.from(genome),
        ...(opts.chain
          ? { chain: opts.chain.map((p) => [p[0] + ox, p[1] + oz]), cmd: opts.cmd ?? cmdConfigFor('default') }
          : { goals: course.waypoints.map((g) => [g[0] + ox, g[1] + oz]), reachR: 8 }),
        gain: CAR2_PARAMS.power / CAR_BODY.mass,
        ...(opts.noise ? { noise: opts.noise, noiseSeed: opts.noiseSeed ?? 1 } : {}),
      },
    },
    [actuatorId]: { type: 'car2', priority: 11, enabled: true, params: CAR2_PARAMS },
  }
  return { carId, entities, transformers }
}

export const POLICY_GROUND = { id: 'ground', name: 'Ground', bodyType: 'static', shape: { type: 'plane' }, position: [0, 0, 0], rotation: [0, 0, 0], friction: 1 }

export function buildPolicyWorld(course: Course, genome: ArrayLike<number>, opts: { noise?: number; noiseSeed?: number; chain?: V2[]; cmd?: CmdConfig } = {}): RennWorld {
  const parts = policyCourseParts(course, genome, opts)
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    transformers: parts.transformers,
    entities: [POLICY_GROUND, ...parts.entities],
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

/**
 * Keys: a course key `kind:seed[~v][@d]` runs the v1 episode (goal chain of the course); a chain episode key `<setupKey>#<i>` runs the v2
 * episode: the stage is commanded along chain i of the setup (needs a v2 genome), progress counts along that chain only and the episode
 * ends `offcourse` when the car is farther than OFF_CHAIN_M from it. `opts.stageChain` hands the stage a different chain than the scored
 * one (exploit tests: following chain A while chain B is commanded must not pay).
 */
export async function runPolicyEpisode(
  genome: ArrayLike<number>,
  key: string,
  opts: { seconds?: number; noise?: number; stageChain?: V2[]; onFrame?: (x: number, z: number, t: number) => void } = {},
): Promise<PolicyEpisodeMetrics> {
  const isChain = isChainEpisodeKey(key)
  const seconds = opts.seconds ?? (isChain ? CHAIN_EPISODE_SECONDS : EPISODE_SECONDS)
  let course: Course
  let chainPoints: V2[] | undefined
  if (isChain) {
    if (!hiddenOfLength(genome.length, N_IN_V2)) throw new Error(`chain episode ${key} needs a v2 genome (27 H + 2 numbers), got ${genome.length}`)
    const c = chainOfEpisode(key)
    course = buildSetupCourse(c.setupKey)
    chainPoints = c.chain.points
  } else {
    const { kind, seed, variant, difficulty } = parseCourseKey(key)
    course = buildCourse(kind, seed, variant, difficulty)
  }
  const noiseSeed = hashKey(key)
  const world = buildPolicyWorld(course, genome, { noise: opts.noise ?? SENSOR_NOISE, noiseSeed, ...(chainPoints ? { chain: opts.stageChain ?? chainPoints, cmd: cmdConfigFor(key) } : {}) })
  const routeLength = chainPoints ? polylineLength(chainPoints) : course.length
  const offCourseM = chainPoints ? OFF_CHAIN_M : OFF_COURSE_M
  const walls = course.boxes.map((b) => {
    const yaw = (b.yawDeg * Math.PI) / 180
    return { cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2, poly: rectPoly(b.at[0], b.at[1], yaw, b.size[0], b.size[1]) }
  })
  const hullR = Math.hypot(CAR_SIZE[0], CAR_SIZE[1]) / 2
  const route = new RouteProgress(chainPoints ?? course)
  const t0 = performance.now()
  const det = installDeterminism(1, 0)
  const prevWarn = console.warn
  console.warn = () => {}
  let sim: WorldSimulator | null = null
  try {
    sim = await WorldSimulator.create(world, 0)
    const frames = Math.round(seconds / DEFAULT_DT)
    let outcome: EpisodeOutcome = 'timeout'
    let t = 0
    let refProgress = 0
    let refT = 0
    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      t = (frame + 1) * DEFAULT_DT
      const cp = sim.getPosition(POLICY_CAR_ID)
      const q = sim.getRotation(POLICY_CAR_ID)
      opts.onFrame?.(cp[0], cp[2], t)
      const progress = route.update(cp[0], cp[2])
      if (upY(q) < 0.2) {
        outcome = 'flip'
        break
      }
      const fx = -(2 * (q.x * q.z + q.w * q.y))
      const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
      const hull = rectPoly(cp[0], cp[2], Math.atan2(fx, fz), CAR_SIZE[0], CAR_SIZE[1])
      let touch = false
      for (const w of walls) {
        if (Math.hypot(w.cx - cp[0], w.cz - cp[2]) - w.r - hullR >= CONTACT_GAP) continue
        if (polyGap(hull, w.poly) < CONTACT_GAP) {
          touch = true
          break
        }
      }
      if (touch) {
        outcome = 'crash'
        break
      }
      if (route.lastDist > offCourseM) {
        outcome = 'offcourse'
        break
      }
      if (progress >= routeLength - FINISH_MARGIN) {
        outcome = 'finish'
        break
      }
      if (progress - refProgress >= STALL_MIN_PROGRESS) {
        refProgress = progress
        refT = t
      } else if (t - refT > STALL_WINDOW_S) {
        outcome = 'stall'
        break
      }
    }
    const progress = route.best
    const score = (progress * progress) / Math.max(t, 1)
    return {
      key,
      outcome,
      progress,
      timeS: t,
      meanSpeed: progress / Math.max(t, 1e-3),
      score,
      norm: score / (routeLength * NORM_SPEED),
      wallMs: performance.now() - t0,
      length: routeLength,
    }
  } finally {
    sim?.dispose()
    det.restore()
    console.warn = prevWarn
  }
}
