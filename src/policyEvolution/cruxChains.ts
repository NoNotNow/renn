import type { V2 } from '@/avEvolution/eval/geometry'
import { rectPoly } from '@/avEvolution/eval/geometry'
import { installDeterminism } from '@/test/avLab/determinism'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import { initRapier } from '@/physics/rapierPhysics'
import { createRng, type Rng } from '@/avEvolution/core/rng'
import { buildSetupCourse, COURSE_START, KIND_SALT, parseCourseKey, cruxClass } from './courses'
import {
  chainClearance,
  chainEpisodeKey,
  chainsForSetup,
  CLEARANCE,
  CORNER_RADII,
  hausdorff,
  MAX_DETOUR,
  MIN_CHAINS,
  MIN_TURN_RADIUS,
  polylineLength,
  roundCorners,
  type Chain,
} from './chains'
import { buildPolicyWorld, cmdConfigFor, drivePolicyEpisode, hashKey, OFF_CHAIN_M, SENSOR_NOISE, v3EpisodeSeconds, type EpisodeOutcome } from './episode'
import { pursuitV3 } from './handWired'
import { LegProgress } from './legs'
import { WallLos } from './wallLos'

/**
 * Crux chains (the 2026-10-12 curriculum decision): instead of many big mazes, MANY TINY worlds that each hold exactly
 * ONE crux class of the stall analysis - and instead of many mazes, MANY MORE-OR-LESS GOOD ROUTES through each crux.
 * `generateCruxChains` lays the course's own route (the base path) plus seeded JITTERED variants (~5): the waypoints are
 * perturbed by ~1-2.5 m, every candidate runs the SAME acceptance gates as the other kinds (corner fillets of
 * CORNER_RADII, exact clearance >= CLEARANCE.crux.min, detour <= MAX_DETOUR) - except the >= 10 m Hausdorff
 * alternative-route rule, which crux deliberately drops: the variants are meant to be near the base path, they only have
 * to be DISTINCT (>= CRUX_VARIANT_GAP_M from every accepted chain).
 *
 * NO DEAD ZEROS, EVER: on top of the geometric gates every candidate chain must be FINISHED by the repo's pure-pursuit
 * baseline (the same handWired pursuit + episode machinery that gated grid with "pure pursuit 100 % finish") before it is
 * accepted - a chain the baseline cannot finish is never returned. The gate drives the candidate SYNCHRONOUSLY through
 * the shared episode core (`drivePolicyEpisode`, the exact frame loop / outcome rules of runPolicyEpisode) on a
 * synchronously built simulator (`WorldSimulator.createSync`), so the verdict cannot diverge from training reality.
 * createSync needs the physics engine warm (Rapier wasm cannot load synchronously) - every entry point that
 * enumerates crux chains awaits `warmCruxGate()` first; a cold gate fails loud, never silently accepts.
 */

/** total chains per crux setup: the base path plus 5 jittered variants */
export const CRUX_CHAINS_PER_SETUP = 6
/** waypoint perturbation of the jittered variants (m, per axis; the last waypoint moves at quarter amplitude) */
export const CRUX_JITTER_M = 2.5
/** jitter draws per setup (the first half at full amplitude, the rest halved; the narrow corridors reject most draws) */
export const CRUX_JITTER_ATTEMPTS = 24
/** accepted chains must differ by at least this much (m, Hausdorff); near-duplicates are rejected */
export const CRUX_VARIANT_GAP_M = 0.5
/** the pure-pursuit baseline of the gate: the same handWired pursuit (speed target 0.35 x 30 m/s) that gated grid with
 * "pure pursuit 100 % finish". No `slow` variant: it brakes toward crawl at ~90 deg-off aims and then cannot even start
 * moving (measured: the C4 start swing stalls at 0 m at slow >= 0.3); the plain baseline finishes all five classes. */
export const CRUX_PURSUIT_SPEED = 0.35
/** C4 chains carry offM 16 (the M2 lesson: the ~90 deg start swing leaves the chain by up to ~12 m) */
export const CRUX_LATERAL_OFF_M = 16

/** Initializes the physics engine so the sync pursuit gate can build simulators (no-op when already warm). */
export async function warmCruxGate(): Promise<void> {
  await initRapier()
}

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

/** resamples the polyline so no gap exceeds `maxGap` (the crux chains are fed to the fillet / clearance gates like the planner chains) */
function densifyMax(points: V2[], maxGap: number): V2[] {
  const out: V2[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxGap))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/**
 * The outcome of the pure-pursuit baseline on one chain of a crux setup, driven through the shared sync episode core -
 * exactly the episode training will drive (the chain's own episode key, so the command config matches). Exported for
 * the sync-vs-async equivalence test of crux.test.ts; `chainOverride` drives a chain that is not in the setup's
 * accepted set (the equivalence test's negative cases).
 */
export function cruxPursuitOutcomeSync(setupKey: string, chainIndex: number, chainOverride?: Chain): EpisodeOutcome {
  const { kind } = parseCourseKey(setupKey)
  if (kind !== 'crux') throw new Error(`cruxPursuitOutcomeSync: ${setupKey} is not a crux setup`)
  const chain = chainOverride ?? chainsForSetup(setupKey)[chainIndex]
  if (!chain) throw new Error(`no chain ${chainIndex} for setup ${setupKey}`)
  return pursuitOutcome(setupKey, chainIndex, chain)
}

/** one synchronous baseline episode: build the world + simulator, run the shared drive core, dispose */
function pursuitOutcome(setupKey: string, chainIndex: number, chain: Chain): EpisodeOutcome {
  const key = chainEpisodeKey(setupKey, chainIndex, true)
  const course = buildSetupCourse(setupKey)
  const routeLength = polylineLength(chain.points)
  const world = buildPolicyWorld(course, pursuitV3(CRUX_PURSUIT_SPEED), {
    chain: chain.points,
    cmd: cmdConfigFor(key),
    v3: true,
    ...(chain.legEnds ? { legEnds: chain.legEnds } : {}),
    offM: chain.offM ?? OFF_CHAIN_M,
    noise: SENSOR_NOISE,
    noiseSeed: hashKey(key),
  })
  const walls = course.boxes.map((b) => {
    const yaw = (b.yawDeg * Math.PI) / 180
    return { cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2, poly: rectPoly(b.at[0], b.at[1], yaw, b.size[0], b.size[1]) }
  })
  const wallIds = new Set(course.boxes.map((_, i) => `box_${i}`))
  const det = installDeterminism(1, 0)
  const prevWarn = console.warn
  console.warn = () => {}
  let sim: WorldSimulator | null = null
  try {
    sim = WorldSimulator.createSync(world)
    const los = new WallLos(walls.map((w) => w.poly))
    const route = new LegProgress(chain.points, chain.legEnds, chain.offM ?? OFF_CHAIN_M, los)
    return drivePolicyEpisode({
      sim,
      key,
      seconds: v3EpisodeSeconds(routeLength),
      v3: true,
      route,
      routeLength,
      offCourseM: chain.offM ?? OFF_CHAIN_M,
      chainPoints: chain.points,
      walls,
      wallIds,
      det,
    }).outcome
  } finally {
    sim?.dispose()
    det.restore()
    console.warn = prevWarn
  }
}

// --- chain set -------------------------------------------------------------------------------------------------------------------------------

/** one jittered variant of the base path: interior waypoints move by +-CRUX_JITTER_M per axis, the end at quarter
 * amplitude (the goal sits in a pocket: its clearance margin is the tightest of the whole chain) */
function jittered(base: V2[], rng: Rng, amp: number): V2[] {
  const uni = (m: number) => (rng.next() * 2 - 1) * m
  return base.map((p, i) => (i === 0 ? p : [p[0] + uni(i === base.length - 1 ? amp / 4 : amp), p[1] + uni(i === base.length - 1 ? amp / 4 : amp)]))
}

/**
 * Chains of a crux setup: the base route plus jittered variants (CRUX_CHAINS_PER_SETUP total, when every candidate
 * passes the gates). Deterministic from the setup key; [] when fewer than MIN_CHAINS candidates survive.
 */
export function generateCruxChains(setupKey: string): Chain[] {
  const { seed } = parseCourseKey(setupKey)
  const cls = cruxClass(seed)
  const course = buildSetupCourse(setupKey)
  const base = [course.startAt ?? COURSE_START, ...course.waypoints]
  const baseLength = polylineLength(base)
  // jitter rng from the kind salt + the setup key (variant-aware: every start variant draws its own variants)
  const rng = createRng((hash(setupKey) ^ KIND_SALT.crux) >>> 0)
  const accepted: Chain[] = []
  const tryAccept = (points: V2[]): boolean => {
    if (accepted.length >= CRUX_CHAINS_PER_SETUP) return false
    let cand: V2[] | undefined
    for (const r of CORNER_RADII) {
      const rounded = roundCorners(points, r)
      if (rounded.minRadius < MIN_TURN_RADIUS) continue
      const dense = densifyMax(rounded.points, 10)
      if (chainClearance(course.boxes, dense) >= CLEARANCE.crux.min) {
        cand = dense
        break
      }
    }
    if (!cand) return false
    if (polylineLength(cand) > MAX_DETOUR * baseLength) return false
    if (accepted.some((a) => hausdorff(a.points, cand!) < CRUX_VARIANT_GAP_M)) return false
    const chain: Chain = { points: cand, length: polylineLength(cand), endIndex: accepted.length, ...(cls === 3 ? { offM: CRUX_LATERAL_OFF_M } : {}) }
    // NO DEAD ZEROS: the pure-pursuit baseline must finish the chain, or it is never accepted
    if (pursuitOutcome(setupKey, accepted.length, chain) !== 'finish') return false
    accepted.push(chain)
    return true
  }
  tryAccept(base)
  for (let attempt = 0; attempt < CRUX_JITTER_ATTEMPTS && accepted.length < CRUX_CHAINS_PER_SETUP; attempt++) {
    tryAccept(jittered(base, rng, attempt < CRUX_JITTER_ATTEMPTS / 2 ? CRUX_JITTER_M : CRUX_JITTER_M / 2))
  }
  return accepted.length >= MIN_CHAINS ? accepted : []
}
