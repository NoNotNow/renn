/**
 * One schlau training episode (2026-10-21): a headless run of a schlau genome (schlauPolicy.ts) on a START -> GOAL task
 * (schlauCourses.ts) — no waypoint chains, no carrots. The score is the reduction of the SHORTEST DRIVABLE distance from
 * the car's NOSE to the goal (schlauScore.ts: obstacle-aware, car width respected, reversing allowed; on OPEN ground
 * — goal_open has no boxes — the plain euclidean nose->goal distance, the field grids only the goal there and its
 * clamped edge read would cap d0 at ~the margin): progress is the
 * monotone high-water of `d0 - field.at(nose)`, so driving away or circling earns nothing. The episode ends when the nose
 * reaches the goal ('finish'), when the remaining geodesic distance EXCEEDS the start distance by SCHLAU_OFFCOURSE_M
 * ('offcourse' — drove away), when no 1 m of progress arrives for SCHLAU_STALL_WINDOW_S ('stall'), after CRASH_TOUCH_S of
 * continuous wall grinding ('crash' — touches are otherwise survived and priced per frame, like episode.ts), when the car
 * flips, or at the time limit (schlauEpisodeSeconds). Pure and browser-safe: a FRESH world per call (defined start),
 * seeded clock, one metrics record out; calls must not interleave in one thread (the determinism patch is global).
 */
import { headingDir, polyGap, rectPoly, upY, type V2 } from '@/avEvolution/eval/geometry'
import { installDeterminism } from '@/test/avLab/determinism'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'
import { V3_OBJECT_TOUCH_PENALTY, V3_WALL_TOUCH_PENALTY } from './es'
import { NOSE_M } from './policy'
import { buildSchlauTask, parseSchlauKey, type SchlauTask } from './schlauCourses'
import { schlauDistanceField, type SchlauField } from './schlauScore'
import { hiddenOfSchlau, N_IN_SCHLAU, SCHLAU_ACTUATOR_ID, SCHLAU_CAR_BODY_ID, SCHLAU_STAGE_ID, schlauDriveStage } from './schlauPolicy'
import {
  CAR2_PARAMS,
  CAR_BODY,
  CAR_SIZE,
  CAR_START_Y,
  CRASH_TOUCH_S,
  hashKey,
  NORM_SPEED,
  POLICY_GROUND,
  SENSOR_NOISE,
  type EpisodeOutcome,
  type PolicyEpisodeMetrics,
} from './episode'

/** gap (m) under which a hull-vs-wall distance counts as a touch (episode.ts CONTACT_GAP, not exported there) */
const CONTACT_GAP = 0.1
/** 'stall': no this much progress (m) for SCHLAU_STALL_WINDOW_S */
const STALL_MIN_PROGRESS = 1
/** finish: the nose is within this euclidean distance of the goal (or the field value drops below it) */
export const SCHLAU_GOAL_REACH_M = 6
/** 'offcourse' when the remaining geodesic distance EXCEEDS d0 + this (drove away) */
export const SCHLAU_OFFCOURSE_M = 25
/** no 1 m of progress for this long -> 'stall' */
export const SCHLAU_STALL_WINDOW_S = 10
/** episode time limit from the geodesic start distance (s): 25 s + d0 / 3 per metre, clamped to 45..150 */
export function schlauEpisodeSeconds(d0: number): number {
  return Math.round(Math.min(150, Math.max(45, 25 + d0 / 3)))
}

// --- distance field cache --------------------------------------------------------------------------------------------------------

/** max cached fields (FIFO-evicted beyond this) */
const SCHLAU_FIELD_CACHE_MAX = 256

/**
 * The geodesic distance fields, keyed by task.key and FIFO-evicted beyond 256 entries: the runner rotates the start
 * variant per generation, which re-seeds the whole world, so a field is per FULL key (the goal never moves, but the
 * boxes and the start do). The field is pure geometry — caching it keeps a generation's episodes off the Dijkstra.
 */
const schlauFieldCache = new Map<string, SchlauField>()

/** The cached geodesic distance field of a task (built once per key). */
function schlauFieldOf(task: SchlauTask): SchlauField {
  const hit = schlauFieldCache.get(task.key)
  if (hit) return hit
  const field = schlauDistanceField(task.boxes, task.goal)
  if (schlauFieldCache.size >= SCHLAU_FIELD_CACHE_MAX) schlauFieldCache.delete(schlauFieldCache.keys().next().value!)
  schlauFieldCache.set(task.key, field)
  return field
}

// --- world -----------------------------------------------------------------------------------------------------------------------

/**
 * The world of one schlau episode: the shared ground plane, the schlau car (the shipped AV car body + the car2
 * actuator, driven by the schlau drive stage) at the task's start pose, and one static box per task box. Same document
 * shape as buildPolicyWorld (episode.ts).
 */
export function buildSchlauWorld(task: SchlauTask, genome: ArrayLike<number>, opts: { noise?: number; noiseSeed?: number } = {}): RennWorld {
  const rad = (d: number) => (d * Math.PI) / 180
  const entities: unknown[] = [
    {
      id: SCHLAU_CAR_BODY_ID,
      name: 'Schlau car',
      bodyType: 'dynamic',
      shape: { type: 'box', width: CAR_SIZE[0], height: 1, depth: CAR_SIZE[1] },
      position: [task.start[0], CAR_START_Y, task.start[1]],
      rotation: [0, rad(task.startYawDeg), 0],
      ...CAR_BODY,
      transformers: [SCHLAU_STAGE_ID, SCHLAU_ACTUATOR_ID],
    },
  ]
  task.boxes.forEach((b, i) => {
    const h = 6
    entities.push({
      id: `box_${i}`,
      name: `Box ${i}`,
      bodyType: 'static',
      shape: { type: 'box', width: b.size[0], height: h, depth: b.size[1] },
      position: [b.at[0], h / 2, b.at[1]],
      rotation: [0, rad(b.yawDeg), 0],
      friction: 0.5,
    })
  })
  const { noise, noiseSeed } = opts
  const transformers: Record<string, unknown> = {
    [SCHLAU_STAGE_ID]: schlauDriveStage({
      w: Array.from(genome),
      goal: [task.goal[0], task.goal[1]],
      gain: CAR2_PARAMS.power / CAR_BODY.mass,
      ...(noise ? { noise, noiseSeed } : {}),
    }),
    [SCHLAU_ACTUATOR_ID]: { type: 'car2', priority: 11, enabled: true, params: CAR2_PARAMS },
  }
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    transformers,
    entities: [POLICY_GROUND, ...entities],
    scripts: {},
    groups: [],
  } as unknown as RennWorld
}

// --- episode ---------------------------------------------------------------------------------------------------------------------

/**
 * One schlau episode: `genome` drives the schlau car on the task of `key` (kind:seed[~variant], schlauCourses.ts), one
 * PolicyEpisodeMetrics record out. `d0` is the geodesic distance of the start NOSE to the goal; `progress` is its
 * monotone reduction. `opts.seconds` overrides the time limit (schlauEpisodeSeconds), `opts.noise` the ray noise
 * (default SENSOR_NOISE, seeded by hashKey(key)), `opts.onFrame` traces the nose per frame.
 */
export async function runSchlauEpisode(
  genome: ArrayLike<number>,
  key: string,
  opts: { seconds?: number; noise?: number; onFrame?: (x: number, z: number, t: number) => void } = {},
): Promise<PolicyEpisodeMetrics> {
  // shape-only check: a schlau genome has an integer hidden size for N_IN_SCHLAU (len = 29 H + 2). The length formula
  // collides with v3 (N_IN_V3 = 26 as well), so a v3 genome passes this check — the caller must pass a schlau genome.
  if (hiddenOfSchlau(genome.length) < 1)
    throw new Error(`schlau episode ${key} needs a schlau genome (${N_IN_SCHLAU} inputs, len = 29 H + 2), got ${genome.length}`)
  const { kind, seed, variant } = parseSchlauKey(key)
  const task = buildSchlauTask(kind, seed, variant)
  // open ground (goal_open: no boxes): the shortest drivable distance IS the euclidean nose->goal distance — the
  // distance field grids only the goal +/- margin, so its clamped edge read would cap d0 at ~the margin. Box tasks
  // grid the arena walls, so the start is inside the grid and the field reads the true geodesic there.
  const open = task.boxes.length === 0
  const field = open ? null : schlauFieldOf(task)
  // start nose: the start pose is known exactly — headingDir (0 deg = -Z), the same fwd the loop reads from the quaternion
  const hd = headingDir((task.startYawDeg * Math.PI) / 180)
  const nose0: V2 = [task.start[0] + hd[0] * NOSE_M, task.start[1] + hd[1] * NOSE_M]
  const d0 = open ? Math.hypot(nose0[0] - task.goal[0], nose0[1] - task.goal[1]) : field!.at(nose0[0], nose0[1])
  const seconds = opts.seconds ?? schlauEpisodeSeconds(d0)
  const world = buildSchlauWorld(task, genome, { noise: opts.noise ?? SENSOR_NOISE, noiseSeed: hashKey(key) })
  const walls = task.boxes.map((b) => {
    const yaw = (b.yawDeg * Math.PI) / 180
    return { cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2, poly: rectPoly(b.at[0], b.at[1], yaw, b.size[0], b.size[1]) }
  })
  const wallIds = new Set(task.boxes.map((_, i) => `box_${i}`))
  const det = installDeterminism(1, 0)
  const prevWarn = console.warn
  console.warn = () => {}
  let sim: WorldSimulator | null = null
  try {
    sim = await WorldSimulator.create(world, 0)
    const t0 = performance.now()
    const frames = Math.round(seconds / DEFAULT_DT)
    const hullR = Math.hypot(CAR_SIZE[0], CAR_SIZE[1]) / 2
    let outcome: EpisodeOutcome = 'timeout'
    let t = 0
    let progress = 0
    let refProgress = 0
    let refT = 0
    let touchWallFrames = 0
    let touchObjectFrames = 0
    let wallTouchT = 0
    let touchPenalty = 0
    let peakNorm = 0
    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      t = (frame + 1) * DEFAULT_DT
      const cp = sim.getPosition(SCHLAU_CAR_BODY_ID)
      const q = sim.getRotation(SCHLAU_CAR_BODY_ID)
      const fx = -(2 * (q.x * q.z + q.w * q.y))
      const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
      const fwdN = Math.hypot(fx, fz) || 1
      const nose: V2 = [cp[0] + (fx / fwdN) * NOSE_M, cp[2] + (fz / fwdN) * NOSE_M]
      const dNow = open ? Math.hypot(nose[0] - task.goal[0], nose[1] - task.goal[1]) : field!.at(nose[0], nose[1])
      // progress: the monotone high-water of the geodesic reduction (driving away or circling earns nothing)
      if (d0 - dNow > progress) progress = d0 - dNow
      if (upY(q) < 0.2) {
        outcome = 'flip'
        break
      }
      const hull = rectPoly(cp[0], cp[2], Math.atan2(fx, fz), CAR_SIZE[0], CAR_SIZE[1])
      let wallTouch = false
      for (const w of walls) {
        if (Math.hypot(w.cx - cp[0], w.cz - cp[2]) - w.r - hullR >= CONTACT_GAP) continue
        if (polyGap(hull, w.poly) < CONTACT_GAP) {
          wallTouch = true
          break
        }
      }
      if (wallTouch) {
        // touches are SURVIVED: only a sustained continuous contact still ends the episode (the 'crash' fallback)
        touchWallFrames++
        touchPenalty += V3_WALL_TOUCH_PENALTY
        wallTouchT += DEFAULT_DT
      } else {
        wallTouchT = 0
        // object contact: a touching entity that is neither the ground nor a task box (none exist in the schlau worlds)
        if (sim.getTouchingEntityIds(SCHLAU_CAR_BODY_ID).some((id) => id !== 'ground' && !wallIds.has(id))) {
          touchObjectFrames++
          touchPenalty += V3_OBJECT_TOUCH_PENALTY
        }
      }
      // the HIGH-WATER of the score curve — the progress-based norm minus the touch penalties SO FAR, updated BEFORE
      // the outcome checks so the frame that ends the episode counts too
      const normNow = (progress * progress) / (Math.max(t, 1) * d0 * NORM_SPEED)
      const cand = normNow - touchPenalty
      if (cand > peakNorm) peakNorm = cand
      if (wallTouchT >= CRASH_TOUCH_S) {
        outcome = 'crash'
        break
      }
      if (dNow > d0 + SCHLAU_OFFCOURSE_M) {
        outcome = 'offcourse'
        break
      }
      if (Math.hypot(nose[0] - task.goal[0], nose[1] - task.goal[1]) < SCHLAU_GOAL_REACH_M || dNow < SCHLAU_GOAL_REACH_M) {
        outcome = 'finish'
        break
      }
      if (progress - refProgress >= STALL_MIN_PROGRESS) {
        refProgress = progress
        refT = t
      } else if (t - refT > SCHLAU_STALL_WINDOW_S) {
        outcome = 'stall'
        break
      }
      opts.onFrame?.(nose[0], nose[1], t)
    }
    const score = (progress * progress) / Math.max(t, 1)
    return {
      key,
      outcome,
      progress,
      timeS: t,
      meanSpeed: progress / Math.max(t, 1e-3),
      score,
      norm: score / (d0 * NORM_SPEED),
      wallMs: performance.now() - t0,
      length: d0,
      touchWallFrames,
      touchObjectFrames,
      peakNorm,
    }
  } finally {
    sim?.dispose()
    det.restore()
    console.warn = prevWarn
  }
}
