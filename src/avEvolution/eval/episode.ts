import { buildArenaWorldFrom } from '@/avEvolution/maze/arenaWorld'
import { listMazeEpisodes, mazeArenaSpec, MAZE_EPISODE_SECONDS, type MazeEpisodeSpec } from '@/avEvolution/maze/episodes'
import type { EpisodeMetrics } from '@/avEvolution/core/fitness'
import type { Params } from '@/avEvolution/core/genes'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator, DEFAULT_DT } from '@/test/helpers/worldSimulator'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import type { RennWorld } from '@/types/world'
import { forwardSpeed, polyGap, rectPoly, upY, yawOf, type V2 } from './geometry'
import { ReversalCounter } from './reversals'

/**
 * One maze-escape episode, pure and browser-safe (no fs / process / path): a FRESH world per call (defined start),
 * seeded RNG + simulated clock (installed globally for the duration of the call, so calls must NOT interleave in one
 * thread: run them one at a time per thread / worker), one metrics record out.
 */

/** Same constants as the scripted-scenario runner (src/test/fixtures/avEvasionRunner.ts). */
export const EPISODE_SEED = 1
export const CONTACT_GAP = 0.1
export const GOAL_REACH = 10
const ARENA_CAR_ID = 'entity_1779823253285_brtkx1p'
const CAR_SIZE: V2 = [4, 8]

export interface EpisodeOptions {
  /** Stop as soon as the goal is reached (default true). false = run the full timeout (baseline-diagnostic parity). */
  stopOnReach?: boolean
  /** Sim-seconds timeout (default MAZE_EPISODE_SECONDS). */
  seconds?: number
  /** Optional per-frame probe (diagnostics only; must not touch the sim). */
  onFrame?: (frame: number) => void
}

export function mazeEpisodeByKey(key: string): MazeEpisodeSpec {
  const { train, holdout, holdoutExtra, legacyTrain } = listMazeEpisodes()
  const ep = [...train, ...holdout, ...holdoutExtra, ...legacyTrain].find((e) => e.key === key)
  if (!ep) throw new Error(`unknown maze episode key: ${key}`)
  return ep
}

export async function runMazeEpisode(sourceWorld: RennWorld, params: Params, ep: MazeEpisodeSpec, opts: EpisodeOptions = {}): Promise<EpisodeMetrics> {
  const seconds = opts.seconds ?? MAZE_EPISODE_SECONDS
  const stopOnReach = opts.stopOnReach !== false
  const spec = mazeArenaSpec(ep)
  const world = buildArenaWorldFrom(sourceWorld, spec, params)
  const frames = Math.round(seconds / DEFAULT_DT)
  const walls = spec.boxes.map((b) => {
    const yaw = ((b.yawDeg ?? 0) * Math.PI) / 180
    return { cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2, poly: rectPoly(b.at[0], b.at[1], yaw, b.size[0], b.size[1]) }
  })
  const hullR = Math.hypot(CAR_SIZE[0], CAR_SIZE[1]) / 2
  const goal = spec.goal
  const t0 = performance.now()
  const det = installDeterminism(EPISODE_SEED, 0)
  const prevWarn = console.warn
  console.warn = () => {}
  setAgentObservationWatchActive(true)
  let sim: WorldSimulator | null = null
  try {
    sim = await WorldSimulator.create(world, 0)
    let exitT = Infinity
    let events = 0
    let contactFrames = 0
    let inContact = false
    let minGap = Infinity
    let stalled = 0
    let flipped = false
    const rev = new ReversalCounter()
    let endDist = Math.hypot(spec.car.at[0] - goal[0], spec.car.at[1] - goal[1])
    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      det.advance(DEFAULT_DT)
      const t = (frame + 1) * DEFAULT_DT
      opts.onFrame?.(frame)
      const cp = sim.getPosition(ARENA_CAR_ID)
      const q = sim.getRotation(ARENA_CAR_ID)
      const v = sim.getVelocity(ARENA_CAR_ID)
      const hull = rectPoly(cp[0], cp[2], yawOf(q), CAR_SIZE[0], CAR_SIZE[1])
      let touch = false
      for (const w of walls) {
        // exact skip: a wall whose gap lower bound cannot touch and cannot improve the minimum
        const lb = Math.hypot(w.cx - cp[0], w.cz - cp[2]) - w.r - hullR
        if (lb >= CONTACT_GAP && lb >= minGap) continue
        const g = polyGap(hull, w.poly)
        if (g < minGap) minGap = g
        if (g < CONTACT_GAP) touch = true
      }
      if (touch) {
        contactFrames++
        if (!inContact) events++
      }
      inContact = touch
      if (t > 1 && Math.hypot(v[0], v[2]) < 0.5) stalled++
      // reversals are counted until the goal is reached (what happens after the exit is irrelevant and stop-on-reach would cut it anyway)
      if (exitT === Infinity) rev.push(forwardSpeed(q, v))
      endDist = Math.hypot(cp[0] - goal[0], cp[2] - goal[1])
      if (endDist < GOAL_REACH && exitT === Infinity) {
        exitT = t
        if (stopOnReach) {
          break
        }
      }
      if (upY(q) < 0.2) {
        flipped = true
        break
      }
    }
    const reached = Number.isFinite(exitT)
    return {
      key: ep.key,
      reached,
      exitT: reached ? exitT : seconds,
      timeoutSec: seconds,
      remainingDist: reached ? 0 : endDist,
      contactEvents: events,
      contactFrames,
      dt: DEFAULT_DT,
      minStaticGap: minGap,
      flipped,
      stalledSec: stalled * DEFAULT_DT,
      reversals: rev.count,
      reverseS: rev.reverseFrames * DEFAULT_DT,
      wallMs: performance.now() - t0,
    }
  } finally {
    sim?.dispose()
    det.restore()
    console.warn = prevWarn
    setAgentObservationWatchActive(false)
  }
}
