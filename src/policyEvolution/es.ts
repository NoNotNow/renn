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
  /**
   * Rank-tie tolerance for the lex vector ranks (v3): vector positions that differ by at most this much count as
   * equal, so near-identical candidates share their average rank instead of getting opposite ranks off evaluation
   * noise. 0 (default / absent) = strict, bit-identical to the old behavior (only exactly-identical vectors tie).
   * Only used in the fitnessVec branch; the scalar centredRanks path never sees it.
   */
  lexEps?: number
  /**
   * Freeze mask (widen-freeze phase 1): length `dim`, `true` = the dimension is FROZEN. A frozen dim gets zero
   * perturbation (candidates stay at the center value there, the antithetic gradient contributes 0 automatically)
   * and its `weightDecay` pull is suspended, so it stays bit-identical over any number of steps. Absent / undefined /
   * all-false = bit-identical to the old behavior. Persists with the run file's config, so a resume keeps the mask
   * until it is cleared (`--unfreeze`).
   */
  freeze?: boolean[]
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
  /**
   * Share of candidate PAIRS that share a lex rank under `lexEps` (v3 calibration: how much of the batch the eps
   * effectively ties). Only set in the fitnessVec branch; absent for scalar runs. Optional so existing consumers
   * that construct or pass reports through stay untouched.
   */
  lexTieFrac?: number
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

/** Vector fitness (v3 weakest link): the candidate's episode values, ASCENDING — compared lexicographically. */
export type FitnessVecFn = (metrics: PolicyEpisodeMetrics[]) => number[]

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
 * frames, episode.ts): wall contact costs more than object contact. Raised 2026-10-13 (widen-freeze run: 0.005 / 0.002
 * let the candidates grind along walls — the new kinds demand touching NOTHING): ~1 s of contact (60 frames at the
 * episode's 60 fps) now costs 0.75 / 0.30 norm — clearly devastating — while a short brush (6 frames = 0.1 s) costs
 * 0.075 / 0.03 and does not zero a good run. Sustained wall grinding still ends 'crash' (CRASH_TOUCH_S, episode.ts —
 * kept at 2 s: the pinned crux band's pursuit acceptance gate runs through that rule) and pays V3_FAIL_FACTOR on top.
 */
export const V3_WALL_TOUCH_PENALTY = 0.0125
export const V3_OBJECT_TOUCH_PENALTY = 0.005

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
export type EpisodeValueMetrics = Array<Pick<PolicyEpisodeMetrics, 'key' | 'norm'> & { outcome?: PolicyEpisodeMetrics['outcome']; meanSpeed?: number; maxDevOrigM?: number; length?: number; touchWallFrames?: number; touchObjectFrames?: number; peakNorm?: number }>

/** The per-episode values behind `aggregateKindMin` (same formula), ASCENDING: vec[0] is the worst run. */
export function episodeValues(metrics: EpisodeValueMetrics, speedCap?: number): number[] {
  if (!metrics.length) return []
  const values = metrics.map((raw) => {
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
    return Number.isFinite(norm) ? (failed ? norm * V3_FAIL_FACTOR : norm) : 0
  })
  return values.sort((a, b) => a - b)
}

export function aggregateKindMin(metrics: EpisodeValueMetrics, speedCap?: number): number {
  return episodeValues(metrics, speedCap)[0] ?? 0
}

/**
 * Lexicographic comparison of two ASCENDING episode-value vectors (the weakest-link order): the first differing
 * position decides — the worst run first, then the second worst, and so on. Vectors of different length (batch sizes
 * vary, e.g. holdout) are padded with 0: a missing episode counts as the worst case. Returns < 0 when `a` sorts
 * below `b`, 0 for identical vectors (a tie).
 */
export function lexCompare(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

/**
 * Lexicographic improvement of `a` over `b` by more than `eps` (the vector analogue of the old scalar
 * `score > best + eps`): positions that differ by at most `eps` count as equal, and the FIRST position that differs
 * by more than `eps` decides — `a` must be higher there. `eps = 0` = strict comparison (any difference decides).
 */
export function lexGreater(a: number[], b: number[], eps = 0): boolean {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (Math.abs(x - y) > eps) return x > y
  }
  return false
}

/**
 * Eps-equality of two ascending episode-value vectors — the exact analogue of `lexGreater`'s eps semantics: positions
 * that differ by at most `eps` count as equal, and the first position that differs by MORE than `eps` breaks the tie.
 * With `eps = 0` only identical vectors (padding included) are equal, which is exactly `lexCompare === 0`, so the
 * strict default stays bit-identical to the old grouping.
 */
function lexEpsEqual(a: number[], b: number[], eps: number): boolean {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > eps) return false
  }
  return true
}

/**
 * Rank keys of the eps-grouped LEXICOGRAPHIC order: the candidates are still sorted by the STRICT `lexCompare`
 * (unchanged), then ADJACENT sorted candidates share a key while they are eps-equal — a noise-level difference no
 * longer splits two otherwise identical runs into opposite-centred ranks. `eps = 0` keeps only exactly-identical
 * vectors tied, bit-identical to the old key assignment. Shared by `lexCentredRanks` (rank values) and
 * `lexTieFraction` (tie share) so both always agree on what a tie is.
 */
function lexRankKeys(vectors: number[][], eps: number): number[] {
  const order = vectors.map((v, i) => [v, i] as const).sort((x, y) => lexCompare(x[0], y[0]))
  const keys = new Array<number>(vectors.length)
  let k = 0
  for (let j = 0; j < order.length; j++) {
    if (j > 0 && !lexEpsEqual(order[j]![0], order[j - 1]![0], eps)) k++
    keys[order[j]![1]] = k
  }
  return keys
}

/**
 * Centred ranks in [-0.5, 0.5] from the LEXICOGRAPHIC order of ascending episode-value vectors: the candidates are
 * sorted by `lexCompare` and the rank positions are centred; eps-equal vectors (identical vectors at `eps = 0`) share
 * their average rank (a tie). Replaces the scalar `centredRanks(fit)` in the ES step — only the u_i assignment
 * changes, the Adam/gradient path is untouched.
 */
export function lexCentredRanks(vectors: number[][], eps = 0): number[] {
  return centredRanks(lexRankKeys(vectors, eps))
}

/**
 * Calibration instrumentation for `lexEps`: the share of candidate PAIRS that share a rank key under the eps grouping
 * (`0` = all distinct, `1` = the whole batch is one tie). An eps that ties almost nothing is wasted (still paying
 * the noise it was meant to absorb); an eps that ties almost everything erases the ranking signal. N < 2 -> 0
 * (no pairs).
 */
export function lexTieFraction(vectors: number[][], eps = 0): number {
  const n = vectors.length
  if (n < 2) return 0
  const counts = new Map<number, number>()
  for (const k of lexRankKeys(vectors, eps)) counts.set(k, (counts.get(k) ?? 0) + 1)
  let ties = 0
  for (const c of counts.values()) ties += (c * (c - 1)) / 2
  return ties / ((n * (n - 1)) / 2)
}

/**
 * v3 best-update: a candidate beats the stored best when its episode-value vector is lexicographically greater
 * (strict, eps = 0 — like the old `trainFit > file.best.train`). A best from a pre-vector state file carries no
 * vector: its scalar train score (the old min) becomes a ONE-ELEMENT vector `[train]`, so the old best is beaten by
 * any candidate that improves the min, or matches it with any positive second value (padding 0: the missing
 * episodes of the old best count as the worst case). The vector of a stored best cannot be reconstructed from
 * its genome — re-evaluating it on a different batch would not be comparable.
 */
export function beatsBest(trainVec: number[], best?: { train: number; trainVec?: number[] }): boolean {
  if (!best) return true
  return lexGreater(trainVec, best.trainVec ?? [best.train], 0)
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

  constructor(readonly cfg: EsConfig, state?: EsState, private readonly fitness: FitnessFn = aggregateFitness, private readonly fitnessVec?: FitnessVecFn) {
    this.state = state ?? initialEsState(cfg)
    this.rng = createRng(0)
    this.rng.setState(this.state.rngState)
  }

  /** One generation on the given course keys (the same keys for every candidate: common random numbers). */
  async step(evaluate: EvaluateGenome, keys: string[]): Promise<GenerationReport> {
    const { dim, pairs, sigma, lr, weightDecay } = this.cfg
    const s = this.state
    // freeze mask (phase 1 of a widen-freeze run): frozen dims get NO perturbation — both antithetic candidates
    // stay at the center value there, so the gradient contribution w * e[d] is exactly 0 — and the weightDecay pull
    // is suspended below. Without a mask the eps stream and the decay are exactly the old behavior.
    const freeze = this.cfg.freeze
    const eps: number[][] = []
    for (let i = 0; i < pairs; i++) eps.push(Array.from({ length: dim }, (_, d) => (freeze?.[d] ? 0 : gaussian(this.rng))))
    const cands: number[][] = []
    for (const e of eps) {
      cands.push(s.theta.map((t, d) => t + sigma * e[d]!))
      cands.push(s.theta.map((t, d) => t - sigma * e[d]!))
    }
    const [centerMetrics, ...results] = await Promise.all([evaluate(s.theta, keys), ...cands.map((c) => evaluate(c, keys))])
    const fit = results.map((r) => this.fitness(r))
    // v3 weakest link: ranks from the LEXICOGRAPHIC order of the candidates' episode-value vectors (ties for identical
    // vectors, or within lexEps) — the scalar min saturates at 0 for one immediate stall and would leave all early
    // candidates unrankable. Only the u_i assignment changes; the Adam/gradient path below is untouched.
    const fv = this.fitnessVec
    const lexVecs = fv ? results.map((r) => fv(r)) : undefined
    const u = lexVecs ? lexCentredRanks(lexVecs, this.cfg.lexEps ?? 0) : centredRanks(fit)
    const grad = new Array<number>(dim).fill(0)
    for (let i = 0; i < pairs; i++) {
      const w = u[2 * i]! - u[2 * i + 1]!
      const e = eps[i]!
      for (let d = 0; d < dim; d++) grad[d]! += w * e[d]!
    }
    for (let d = 0; d < dim; d++) grad[d] = grad[d]! / (2 * pairs * sigma) - (freeze?.[d] ? 0 : weightDecay * s.theta[d]!)
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
      // tie share under the same eps as the ranks above (fitnessVec branch only; absent for scalar runs)
      ...(lexVecs ? { lexTieFrac: lexTieFraction(lexVecs, this.cfg.lexEps ?? 0) } : {}),
    }
  }
}
