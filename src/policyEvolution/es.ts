import { createRng, gaussian, type Rng } from '@/avEvolution/core/rng'
import { parseChainEpisodeKey } from './chains'
import type { PolicyEpisodeMetrics } from './episode'

/**
 * Evolution strategy on a flat weight vector (OpenAI-ES style): antithetic Gaussian perturbations, centred-rank
 * fitness shaping, Adam step on the mean. Pure TS, no I/O; the evaluator is injected (worker pool or a test stub).
 */

export interface EsConfig {
  dim: number
  /** antithetic pairs per generation (population = 2 x pairs) */
  pairs: number
  sigma: number
  lr: number
  initStd: number
  seed: number
  /** L2 pull toward 0 per step (keeps weights from drifting into tanh saturation) */
  weightDecay: number
}

export const DEFAULT_ES_CONFIG: Omit<EsConfig, 'dim'> = { pairs: 24, sigma: 0.1, lr: 0.03, initStd: 0.3, seed: 1, weightDecay: 0.005 }

export interface EsState {
  gen: number
  theta: number[]
  m: number[]
  v: number[]
  adamT: number
  rngState: number
}

export type EvaluateGenome = (genome: number[], keys: string[]) => Promise<PolicyEpisodeMetrics[]>

export interface GenerationReport {
  gen: number
  keys: string[]
  /** fitness of the mean policy on this generation's batch */
  center: number
  best: number
  mean: number
  worst: number
  sigma: number
  episodes: number
  /** per-course metrics of the mean policy on this generation's batch (not persisted) */
  centerMetrics?: PolicyEpisodeMetrics[]
}

/** Robust fitness of one genome over a set of courses: half mean, half the mean of the worst quarter (normalised scores). */
export function aggregateFitness(metrics: Pick<PolicyEpisodeMetrics, 'norm'>[]): number {
  if (!metrics.length) return 0
  const s = metrics.map((m) => m.norm).sort((a, b) => a - b)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const k = Math.max(1, Math.ceil(s.length / 4))
  const worst = s.slice(0, k).reduce((a, b) => a + b, 0) / k
  return 0.5 * mean + 0.5 * worst
}

/** Fitness of one genome over a batch of episode metrics (aggregateFitness for v1, aggregateEvenness for chain episodes). */
export type FitnessFn = (metrics: PolicyEpisodeMetrics[]) => number

/** mean of the worst quarter (at least one value) */
function worstQuarterMean(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b)
  const k = Math.max(1, Math.ceil(s.length / 4))
  return s.slice(0, k).reduce((a, b) => a + b, 0) / k
}

/**
 * Evenness fitness for chain episodes (metrics carry the episode key `<setupKey>#<i>`): per setup 0.5 mean + 0.5 min of the normalised
 * score over its chains, over setups 0.5 mean + 0.5 mean of the worst quarter. A candidate that drives one chain well and fails the
 * others scores below one with the same mean spread evenly.
 */
export function aggregateEvenness(metrics: Array<Pick<PolicyEpisodeMetrics, 'key' | 'norm'>>): number {
  if (!metrics.length) return 0
  const bySetup = new Map<string, number[]>()
  for (const m of metrics) {
    const { setupKey } = parseChainEpisodeKey(m.key)
    const list = bySetup.get(setupKey)
    if (list) list.push(m.norm)
    else bySetup.set(setupKey, [m.norm])
  }
  const setupScores = [...bySetup.values()].map((v) => 0.5 * (v.reduce((a, b) => a + b, 0) / v.length) + 0.5 * Math.min(...v))
  return 0.5 * (setupScores.reduce((a, b) => a + b, 0) / setupScores.length) + 0.5 * worstQuarterMean(setupScores)
}

/**
 * v3 fitness, weakest link: a candidate's fitness is the MINIMUM over all its episode values — the worst run decides.
 * Per-episode value: `peakNorm` (episode.ts) with the opt-in speed cap, times V3_FAIL_FACTOR when the outcome failed;
 * fallback for metrics without `peakNorm`: the old end-value formula (norm - deviation - touch penalties, floored at 0).
 * A candidate that aces most courses and catastrophically fails one ranks below one that is merely solid everywhere:
 * robustness over specialists. No kind grouping, no coverage bonus — a missing kind simply contributes no value, and
 * the worst run is the worst run. `aggregateEvenness` (v2) is unchanged.
 */
/**
 * v3: an episode that ends in contact / off the chain / stalled / flipped keeps only this share of its norm. Without it driving into a dead-end
 * bay fast and crashing at the reversal scored almost like finishing it (measured 2026-10-10: a policy with bay 0/18 finished beat one with 16/18).
 */
export const V3_FAIL_FACTOR = 0.5

/**
 * v3 per-frame touch penalties (subtracted from the episode's norm; the episode SURVIVES touches and counts the
 * frames, episode.ts): wall contact costs more than object contact. Scaled so ~1 s of contact (60 frames at the
 * episode's 60 fps) is clearly felt — wall 0.3, object 0.12 norm — while a short brush (a few frames) does not zero
 * a good run. Sustained wall grinding still ends 'crash' (CRASH_TOUCH_S) and pays V3_FAIL_FACTOR on top.
 */
export const V3_WALL_TOUCH_PENALTY = 0.005
export const V3_OBJECT_TOUCH_PENALTY = 0.002

/** per-episode touch penalty in norm currency (frames x the per-frame rates above) */
export function touchPenaltyNorm(touchWallFrames: number | undefined, touchObjectFrames: number | undefined): number {
  return (touchWallFrames ?? 0) * V3_WALL_TOUCH_PENALTY + (touchObjectFrames ?? 0) * V3_OBJECT_TOUCH_PENALTY
}

/**
 * v3 deviation penalty: the episode's points (norm) minus the largest distance from the ORIGINAL chain, converted to the
 * norm currency as a route fraction (maxDevOrigM / chain length) — one metre off the path vector costs one metre of
 * route points. Following the vector is the only free route: cutting corners or wandering (up to the offcourse
 * termination) pays directly, so nets cannot score through detours.
 */
export function devPenaltyNorm(maxDevOrigM: number | undefined, lengthM: number | undefined): number {
  if (maxDevOrigM === undefined || !lengthM || !(lengthM > 0)) return 0
  return maxDevOrigM / lengthM
}

/**
 * Opt-in speed cap (m/s) on the v3 training fitness: an episode's norm is scaled by min(1, cap / meanSpeed), i.e. the speed part of the reward saturates at `cap`
 * (norm = progress x meanSpeed / (length x NORM_SPEED)). undefined / <= 0 / missing meanSpeed = off (bit-identical to the uncapped fitness).
 */
export function capNorm(norm: number, meanSpeed: number | undefined, speedCap?: number): number {
  if (!speedCap || !(speedCap > 0) || meanSpeed === undefined || !(meanSpeed > speedCap)) return norm
  return norm * (speedCap / meanSpeed)
}

/**
 * Weakest-link fitness for v3: fitness = MIN over all episode values of the batch ("the chain is only as strong as its
 * weakest link"). The per-episode value is final (peakNorm-based, incl. failFactor / penalties); see the block comment
 * above. Empty batch -> 0; a non-finite episode value counts as 0.
 */
export function aggregateKindMin(
  metrics: Array<Pick<PolicyEpisodeMetrics, 'key' | 'norm'> & { outcome?: PolicyEpisodeMetrics['outcome']; meanSpeed?: number; maxDevOrigM?: number; length?: number; touchWallFrames?: number; touchObjectFrames?: number; peakNorm?: number }>,
  speedCap?: number,
): number {
  if (!metrics.length) return 0
  let worst = Infinity
  for (const raw of metrics) {
    const failed = raw.outcome !== undefined && raw.outcome !== 'finish' && raw.outcome !== 'timeout'
    // peak semantics: `peakNorm` (episode.ts) is the HIGH-WATER of the per-frame score curve, already minus the
    // penalties accumulated up to that frame (deviation + touches) — the fitness ranks it, not the drained end value,
    // so a run that reaches 60 % and then stalls at a wall keeps its edge over an immediate stall (both end values
    // saturate to 0 under the old formula). Fallback for metrics without `peakNorm` (hand-built fixtures, pre-peak
    // run files): the old end-value formula with its floor at 0, unchanged.
    const norm =
      raw.peakNorm !== undefined
        ? capNorm(raw.peakNorm, raw.meanSpeed, speedCap)
        : Math.max(0, capNorm(raw.norm, raw.meanSpeed, speedCap) - devPenaltyNorm(raw.maxDevOrigM, raw.length) - touchPenaltyNorm(raw.touchWallFrames, raw.touchObjectFrames))
    const value = Number.isFinite(norm) ? (failed ? norm * V3_FAIL_FACTOR : norm) : 0
    if (value < worst) worst = value
  }
  return worst
}

/** Centred ranks in [-0.5, 0.5]; ties share their average rank. */
export function centredRanks(values: number[]): number[] {
  const n = values.length
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(n).fill(0)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++
    const r = (i + j) / 2
    for (let k = i; k <= j; k++) out[order[k]![1]] = n > 1 ? r / (n - 1) - 0.5 : 0
    i = j + 1
  }
  return out
}

export function initialEsState(cfg: EsConfig): EsState {
  const rng = createRng(cfg.seed)
  const theta = Array.from({ length: cfg.dim }, () => gaussian(rng) * cfg.initStd)
  return { gen: 0, theta, m: new Array(cfg.dim).fill(0), v: new Array(cfg.dim).fill(0), adamT: 0, rngState: rng.getState() }
}

export class PolicyEs {
  state: EsState
  private readonly rng: Rng

  constructor(readonly cfg: EsConfig, state?: EsState, private readonly fitness: FitnessFn = aggregateFitness) {
    this.state = state ?? initialEsState(cfg)
    this.rng = createRng(0)
    this.rng.setState(this.state.rngState)
  }

  /** One generation on the given course keys (the same keys for every candidate: common random numbers). */
  async step(evaluate: EvaluateGenome, keys: string[]): Promise<GenerationReport> {
    const { dim, pairs, sigma, lr, weightDecay } = this.cfg
    const s = this.state
    const eps: number[][] = []
    for (let i = 0; i < pairs; i++) eps.push(Array.from({ length: dim }, () => gaussian(this.rng)))
    const cands: number[][] = []
    for (const e of eps) {
      cands.push(s.theta.map((t, d) => t + sigma * e[d]!))
      cands.push(s.theta.map((t, d) => t - sigma * e[d]!))
    }
    const [centerMetrics, ...results] = await Promise.all([evaluate(s.theta, keys), ...cands.map((c) => evaluate(c, keys))])
    const fit = results.map((r) => this.fitness(r))
    const u = centredRanks(fit)
    const grad = new Array<number>(dim).fill(0)
    for (let i = 0; i < pairs; i++) {
      const w = u[2 * i]! - u[2 * i + 1]!
      const e = eps[i]!
      for (let d = 0; d < dim; d++) grad[d]! += w * e[d]!
    }
    for (let d = 0; d < dim; d++) grad[d] = grad[d]! / (2 * pairs * sigma) - weightDecay * s.theta[d]!
    s.adamT++
    const b1 = 0.9
    const b2 = 0.999
    for (let d = 0; d < dim; d++) {
      s.m[d] = b1 * s.m[d]! + (1 - b1) * grad[d]!
      s.v[d] = b2 * s.v[d]! + (1 - b2) * grad[d]! * grad[d]!
      const mh = s.m[d]! / (1 - Math.pow(b1, s.adamT))
      const vh = s.v[d]! / (1 - Math.pow(b2, s.adamT))
      s.theta[d]! += (lr * mh) / (Math.sqrt(vh) + 1e-8)
    }
    s.gen++
    s.rngState = this.rng.getState()
    return {
      gen: s.gen,
      keys,
      center: this.fitness(centerMetrics!),
      best: Math.max(...fit),
      mean: fit.reduce((a, b) => a + b, 0) / fit.length,
      worst: Math.min(...fit),
      sigma,
      episodes: (cands.length + 1) * keys.length,
      centerMetrics: centerMetrics!,
    }
  }
}
