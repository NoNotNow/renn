import { createRng, gaussian, type Rng } from '@/avEvolution/core/rng'
import { genomeLength, genomeShape, inputsOfGenome, N_HIDDEN, N_IN, N_IN_V3, N_OUT, policyForward } from './policy'
import { aggregateFitness, DEFAULT_ES_CONFIG, initialEsState, lexCompare, lexGreater, PolicyEs, type EsConfig, type EsState, type EvaluateGenome, type FitnessFn, type FitnessVecFn, type GenerationReport } from './es'

/**
 * Island model on top of the evolution strategy: several independent ES centres ("islands") learn side by side on the same course
 * batches. Every `epoch` generations they are ranked on fresh courses; the worst MATURE island is then replaced either by a crossover of
 * the two best islands or by a brand new random network ("immigrant"). Crossover works on hidden NEURONS (incoming weights + bias +
 * outgoing weights): the second parent's neurons are first aligned to the first parent's (permutation and sign symmetry of tanh units),
 * otherwise the child would be a broken mixture of unrelated feature orders.
 *
 * Adaptive mutation strength: an island whose epoch-rank score VECTOR (ascending episode values) has not lexicographically
 * improved by more than STAGNATION_EPSILON for more than STAGNATION_EPOCHS consecutive epochs is stagnating; its mutation sigma is boosted (per
 * island, or globally when the best island score stalls) by SIGMA_BOOST_STEP per further stagnant epoch, capped at SIGMA_BOOST_MAX. The first real
 * improvement resets the counter and the sigma to the base level — the boost only ever exists while the stagnation persists.
 *
 * FOCUS mode: while the run stagnates, only the stagnant / weak islands keep stepping (concentrated search); the others
 * pause completely — frozen center, age and bookkeeping, but still ranked on the fresh epoch courses with their last center.
 * A focused island returns to normal operation once it lexicographically improves over its pre-focus best ("over the hump");
 * when all of them do (or FOCUS_MAX_EPOCHS pass), the whole run resumes normally. See `reproduce` for the exact rules.
 */

/** Genome layout of a net with `nIn` inputs (v1: N_IN = 22, v2: 24, v3: 26) and H hidden units; every helper below derives both from the genome length (any H). */
const layout = (nIn: number, H: number) => {
  const B1 = H * nIn
  const W2 = B1 + H
  return { B1, W2, B2: W2 + N_OUT * H }
}
const BLOCK = N_IN + 1 + N_OUT

/** Hidden neuron j of a genome as one block: [incoming weights (nIn), bias, outgoing weights (N_OUT)]. */
export function neuronBlock(g: ArrayLike<number>, j: number): number[] {
  const { nIn, hidden: H } = genomeShape(g.length)
  const { B1, W2 } = layout(nIn, H)
  const b: number[] = []
  for (let i = 0; i < nIn; i++) b.push(g[j * nIn + i]!)
  b.push(g[B1 + j]!)
  for (let k = 0; k < N_OUT; k++) b.push(g[W2 + k * H + j]!)
  return b
}

export function setNeuronBlock(g: number[], j: number, b: ArrayLike<number>, sign = 1): void {
  const { nIn, hidden: H } = genomeShape(g.length)
  const { B1, W2 } = layout(nIn, H)
  for (let i = 0; i < nIn; i++) g[j * nIn + i] = sign * b[i]!
  g[B1 + j] = sign * b[nIn]!
  // tanh is odd: negating a neuron's incoming side and its outgoing weights leaves the function unchanged
  for (let k = 0; k < N_OUT; k++) g[W2 + k * H + j] = sign * b[nIn + 1 + k]!
}

/** Plausible policy inputs (rays mostly clear, speeds, unit goal vector ...) for comparing what hidden neurons compute. */
export function sampleInputs(n: number, rng: Rng, nIn = N_IN): number[][] {
  const out: number[][] = []
  for (let s = 0; s < n; s++) {
    const x: number[] = []
    const nRays = N_IN - 8
    for (let i = 0; i < nRays; i++) x.push(rng.next() < 0.55 ? rng.next() : 0)
    x.push(rng.next() * 1.3 - 0.3, gaussian(rng) * 0.3, gaussian(rng) * 0.3)
    const a = rng.next() * 2 * Math.PI
    x.push(Math.cos(a), Math.sin(a), rng.next())
    if (nIn >= N_IN_V3) {
      // v3: next-segment direction (unit vector) and the two touch flags (mostly clear) before previous steer / gas
      const b = rng.next() * 2 * Math.PI
      x.push(Math.cos(b), Math.sin(b))
      x.push(rng.next() < 0.08 ? 1 : 0, rng.next() < 0.04 ? 1 : 0)
    } else if (nIn > N_IN) {
      // v2: next-segment direction (unit vector) before previous steer / gas
      const b = rng.next() * 2 * Math.PI
      x.push(Math.cos(b), Math.sin(b))
    }
    x.push(rng.next() * 2 - 1, rng.next() * 2 - 1)
    out.push(x)
  }
  return out
}

function hiddenActivations(g: ArrayLike<number>, xs: number[][]): number[][] {
  const { nIn, hidden: H } = genomeShape(g.length)
  const { B1 } = layout(nIn, H)
  return Array.from({ length: H }, (_, j) =>
    xs.map((x) => {
      let s = g[B1 + j]!
      for (let i = 0; i < nIn; i++) s += g[j * nIn + i]! * x[i]!
      return Math.tanh(s)
    }),
  )
}

function correlation(a: number[], b: number[]): number {
  const n = a.length
  const ma = a.reduce((x, y) => x + y, 0) / n
  const mb = b.reduce((x, y) => x + y, 0) / n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb)
    saa += (a[i]! - ma) ** 2
    sbb += (b[i]! - mb) ** 2
  }
  return saa < 1e-12 || sbb < 1e-12 ? 0 : sab / Math.sqrt(saa * sbb)
}

/** Optimal assignment (maximise total weight) for a small square matrix: Hungarian algorithm on the negated matrix. */
function assign(weight: number[][]): number[] {
  const n = weight.length
  const cost = weight.map((r) => r.map((w) => -w))
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(n + 1).fill(0)
  const p = new Array<number>(n + 1).fill(0)
  const way = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(n + 1).fill(Infinity)
    const used = new Array<boolean>(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]!
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!
        if (cur < minv[j]!) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j]! < delta) {
          delta = minv[j]!
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]!]! += delta
          v[j]! -= delta
        } else minv[j]! -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]!
      p[j0] = p[j1]!
      j0 = j1
    } while (j0)
  }
  const result = new Array<number>(n).fill(0)
  for (let j = 1; j <= n; j++) result[p[j]! - 1] = j - 1
  return result
}

/**
 * For every hidden neuron i of `a`, the matching neuron of `b` and the sign to apply to it (-1 when the two are anti-correlated),
 * found by correlating the hidden activations on shared sample inputs.
 */
export function alignNeurons(a: ArrayLike<number>, b: ArrayLike<number>, samples = 200, seed = 7): { match: number[]; sign: number[] } {
  const xs = sampleInputs(samples, createRng(seed), inputsOfGenome(a.length))
  const ha = hiddenActivations(a, xs)
  const hb = hiddenActivations(b, xs)
  const corr = ha.map((r) => hb.map((c) => correlation(r, c)))
  const match = assign(corr.map((r) => r.map((c) => Math.abs(c))))
  return { match, sign: match.map((m, i) => (corr[i]![m]! < 0 ? -1 : 1)) }
}

/** Child = parent A where each hidden neuron is, with probability `pB`, replaced by the aligned neuron of parent B (at least one of each). */
export function crossoverNeurons(a: ArrayLike<number>, b: ArrayLike<number>, rng: Rng, pB = 0.5): number[] {
  if (a.length !== b.length) throw new Error(`crossoverNeurons: parents differ in size (${a.length} vs ${b.length})`)
  const { nIn, hidden: H } = genomeShape(a.length)
  const { match, sign } = alignNeurons(a, b)
  const child = Array.from(a)
  const take = Array.from({ length: H }, () => rng.next() < pB)
  if (!take.some(Boolean)) take[Math.floor(rng.next() * H)] = true
  if (take.every(Boolean)) take[Math.floor(rng.next() * H)] = false
  for (let i = 0; i < H; i++) if (take[i]) setNeuronBlock(child, i, neuronBlock(b, match[i]!), sign[i]!)
  // output biases: average of the parents
  const o2 = layout(nIn, H).B2
  for (let k = 0; k < N_OUT; k++) child[o2 + k] = (a[o2 + k]! + b[o2 + k]!) / 2
  return child
}

export function freshGenome(rng: Rng, initStd = DEFAULT_ES_CONFIG.initStd, nIn = N_IN, hidden = N_HIDDEN): number[] {
  const g = Array.from({ length: genomeLength(nIn, hidden) }, () => gaussian(rng) * initStd)
  const B2 = layout(nIn, hidden).B2
  // start prior (see tools/policy-evolution/run.ts): a positive speed-target bias so random policies at least roll forward
  g[B2 + 1] = 0.5
  return g
}

export interface IslandsConfig {
  islands: number
  /** generations between island rankings / replacements */
  epoch: number
  /** an island must be at least this old (generations since its start) to be replaced */
  mature: number
  /** probability that a replacement is a crossover of the two best islands (else a random immigrant) */
  pCross: number
}

export const DEFAULT_ISLANDS: IslandsConfig = { islands: 3, epoch: 25, mature: 75, pCross: 0.5 }

/**
 * Stagnation-driven sigma boost. An epoch counter `stagn` grows by 1 for every epoch whose rank score does not beat the island's
 * (resp. the global) best by more than STAGNATION_EPSILON; the first improvement by more than that resets it to 0.
 */
export const STAGNATION_EPOCHS = 3
export const STAGNATION_EPSILON = 1e-3
/** sigma multiplier per stagnant epoch beyond STAGNATION_EPOCHS, capped at SIGMA_BOOST_MAX */
export const SIGMA_BOOST_STEP = 1.5
export const SIGMA_BOOST_MAX = 4

/** sigma multiplier for `stagn` consecutive stagnant epochs: 1 at or below the threshold, then SIGMA_BOOST_STEP^(stagn - STAGNATION_EPOCHS), capped at SIGMA_BOOST_MAX. */
export function sigmaBoost(stagn: number | undefined): number {
  const s = (stagn ?? 0) - STAGNATION_EPOCHS
  return s <= 0 ? 1 : Math.min(SIGMA_BOOST_MAX, SIGMA_BOOST_STEP ** s)
}

/**
 * FOCUS mode safety net: an active focus ends at the latest after this many epoch ends, back to normal operation
 * with the stagn counters reset (a still-elevated counter would re-enter focus at the very next epoch end). 4 epochs
 * (~100 gens at epoch 25): long enough that the sigma boost — which first fires after STAGNATION_EPOCHS + 1 stagnant
 * epochs — can act inside the focus window, short enough that a badly chosen focus set does not burn a long plateau
 * while the paused islands and the normal replacement / crossover machinery are starved.
 */
export const FOCUS_MAX_EPOCHS = 4

export interface IslandState {
  es: EsState
  /** generations since this island was (re)started */
  age: number
  /** how it started: 'random' | 'cross' */
  origin: string
  /** best epoch-rank score seen by this island (stagnation tracking; undefined until its first epoch) */
  bestScore?: number
  /** best epoch-rank score VECTOR (ascending episode values, lexicographic stagnation tracking; optional: pre-lex state files) */
  bestScoreVec?: number[]
  /** consecutive epochs without a > STAGNATION_EPSILON improvement of bestScore (sigma boost; optional: pre-boost state files) */
  stagn?: number
  /** center fitness of the last STEPPED generation (display of a paused island during focus; optional: pre-focus state files) */
  lastCenter?: number
  /** CSA-adapted BASE sigma of this island, WITHOUT the stagnation boost (optional: written only with `csa` on — older state files have none and start at `esCfg.sigma`) */
  sigma?: number
  /** CSA evolution path, dim-length (optional: written only with `csa` on; a fresh / replaced island starts at path zero) */
  csaPath?: number[]
}

export interface IslandsState {
  gen: number
  islands: IslandState[]
  rngState: number
  /** best epoch-rank score seen by any island, and consecutive epochs without improvement (global stagnation boost) */
  globalBest?: number
  /** best epoch-rank score VECTOR of any island (lexicographic global stagnation tracking; optional: pre-lex state files) */
  globalBestVec?: number[]
  globalStagn?: number
  /**
   * FOCUS mode (optional: pre-focus state files = normal mode): while set, only the `set` islands step their ES each
   * generation; the others pause untouched (frozen center, age, stagn bookkeeping) until every focused island has
   * lexicographically improved over its pre-focus best ("over the hump") or FOCUS_MAX_EPOCHS ends the focus.
   */
  focus?: { set: number[]; epochs: number; sinceGen: number }
  /** log of replacements: {gen, replaced, with, scores} */
  events: Array<{ gen: number; replaced: number; with: string; scores: number[] }>
}

/** `warm`: a genome (of length esCfg.dim) every island centre starts from instead of a random network. */
export function initialIslands(esCfg: EsConfig, cfg: IslandsConfig, warm?: ArrayLike<number>): IslandsState {
  const rng = createRng(esCfg.seed * 7919 + 13)
  const islands: IslandState[] = []
  for (let k = 0; k < cfg.islands; k++) {
    const es = initialEsState({ ...esCfg, seed: esCfg.seed * 1000 + k })
    es.theta = warm ? Array.from(warm) : freshGenome(createRng(esCfg.seed * 1000 + k), esCfg.initStd, genomeShape(esCfg.dim).nIn, genomeShape(esCfg.dim).hidden)
    islands.push({ es, age: 0, origin: 'random', stagn: 0 })
  }
  return { gen: 0, islands, rngState: rng.getState(), globalStagn: 0, events: [] }
}

export interface IslandsStepReport {
  gen: number
  /** per-island report of this generation (a paused island repeats its `lastCenter`, no centerMetrics) */
  reports: GenerationReport[]
  /** effective sigma multipliers applied in this generation (per island) */
  boosts: number[]
  /** islands that did NOT step this generation (paused by focus mode) */
  paused: number[]
}

/**
 * The island model driver. `esCfg.pairs` is the number of antithetic pairs PER island.
 *
 * CSA (opt-in, final constructor flag; the runner persists it): per island, Hansen cumulative step-size
 * adaptation — the island's BASE sigma is adapted from the length of its conjugate evolution path, so a consistently
 * directed search widens its steps and directionless dithering narrows them. The stagnation boost keeps multiplying
 * on TOP of that base, and with the flag off nothing is written and the trajectories are bit-identical to the
 * pre-CSA code.
 */
export class IslandEs {
  readonly engines: PolicyEs[]
  private readonly rng: Rng
  /** one mutable EsConfig per island (the engines' own objects): only `sigma` is rewritten, from the base sigma and the boost */
  private readonly engineCfgs: EsConfig[]

  constructor(readonly esCfg: EsConfig, readonly cfg: IslandsConfig, public state: IslandsState, private readonly fitness: FitnessFn = aggregateFitness, private readonly fitnessVec?: FitnessVecFn, private readonly csa = false) {
    this.engineCfgs = state.islands.map((_, k) => ({ ...esCfg, seed: esCfg.seed * 1000 + k }))
    this.engines = state.islands.map((isl, k) => new PolicyEs(this.engineCfgs[k]!, isl.es, fitness, fitnessVec))
    this.rng = createRng(0)
    this.rng.setState(state.rngState)
  }

  /** Effective sigma multiplier of island k: its own stagnation, or the global one, whichever boosts more. */
  boost(k: number): number {
    return Math.max(sigmaBoost(this.state.islands[k]?.stagn), sigmaBoost(this.state.globalStagn))
  }

  /** Indices paused by an active focus; `k` steps unless it is paused. */
  paused(): number[] {
    const f = this.state.focus
    return f ? this.state.islands.map((_, k) => k).filter((k) => !f.set.includes(k)) : []
  }

  /**
   * One generation: every island takes its ES step on the same course batch (with its current sigma boost applied).
   * During an active focus only the focused islands step; the paused ones are no-ops — center, age and ES state stay
   * exactly as they were (their `lastCenter` repeats in the report so the log keeps showing the frozen center, and
   * their `centerMetrics` stay empty so the curriculum / stage EMAs do not re-count stale runs).
   */
  async step(evaluate: EvaluateGenome, keys: string[]): Promise<IslandsStepReport> {
    const paused = new Set(this.paused())
    const boosts = this.state.islands.map((_, k) => this.boost(k))
    this.state.islands.forEach((isl, k) => {
      // CSA adapts the island's BASE sigma, the stagnation boost multiplies on top of it; without csa (or a
      // stored sigma) this is exactly the old `this.esCfg.sigma * boosts[k]` — the off-path stays bit-identical
      const base = this.csa && isl.sigma !== undefined ? isl.sigma : this.esCfg.sigma
      this.engineCfgs[k]!.sigma = base * boosts[k]!
    })
    // with csa on only: the center before the step, to measure this generation's displacement (no allocation off-path)
    const thetaBefore = this.csa ? this.state.islands.map((isl, k) => (paused.has(k) ? undefined : isl.es.theta.slice())) : undefined
    const frozenReport = (k: number): GenerationReport => ({
      gen: this.state.gen + 1,
      keys,
      center: this.state.islands[k]!.lastCenter ?? Number.NaN,
      best: Number.NaN,
      mean: Number.NaN,
      worst: Number.NaN,
      sigma: this.engineCfgs[k]!.sigma,
      episodes: 0,
    })
    const reports = await Promise.all(this.engines.map((e, k) => (paused.has(k) ? Promise.resolve(frozenReport(k)) : e.step(evaluate, keys))))
    this.state.gen++
    this.state.islands.forEach((isl, k) => {
      if (paused.has(k)) return
      isl.es = this.engines[k]!.state
      isl.age++
      isl.lastCenter = reports[k]!.center
    })
    if (this.csa) {
      // Hansen cumulative step-size adaptation (textbook CMA-ES constants, per island that STEPPED — paused islands
      // keep their sigma / path frozen): compare ||p||, the length of the conjugate evolution path, against chiN, the
      // length a pure random walk of the same step size would have. A consistently directed displacement lets p
      // accumulate and ||p|| pass chiN -> the base sigma grows; directionless dithering cancels in p -> it shrinks.
      const dim = this.esCfg.dim
      const muEff = this.esCfg.pairs // antithetic pairs per island
      const c = (muEff + 2) / (dim + muEff + 3) // c_sigma: path accumulates over ~1/c generations
      const damp = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (dim + 1)) - 1) + c // d_sigma
      const chiN = Math.sqrt(dim) * (1 - 1 / (4 * dim) + 1 / (21 * dim ** 2)) // E||N(0, I_dim)||
      const scale = Math.sqrt(c * (2 - c) * muEff)
      this.state.islands.forEach((isl, k) => {
        const before = thetaBefore![k]
        if (before === undefined) return
        const s = this.engineCfgs[k]!.sigma // the sigma actually used this generation: base * boost
        const p = new Array<number>(dim)
        let norm = 0
        for (let i = 0; i < dim; i++) {
          p[i] = (1 - c) * (isl.csaPath?.[i] ?? 0) + scale * ((isl.es.theta[i]! - before[i]!) / s)
          norm += p[i]! * p[i]!
        }
        // the base sigma never leaves a factor SIGMA_BOOST_MAX around esCfg.sigma, whatever the path does
        const lo = this.esCfg.sigma / SIGMA_BOOST_MAX
        const hi = this.esCfg.sigma * SIGMA_BOOST_MAX
        isl.sigma = Math.min(hi, Math.max(lo, (isl.sigma ?? this.esCfg.sigma) * Math.exp((Math.sqrt(norm) / chiN - 1) / damp)))
        isl.csaPath = p
      })
    }
    this.state.rngState = this.rng.getState()
    return { gen: this.state.gen, reports, boosts, paused: [...paused] }
  }

  isEpochEnd(): boolean {
    return this.state.gen > 0 && this.state.gen % this.cfg.epoch === 0
  }

  /**
   * Rank the islands by their score VECTORS (ascending episode values; lexicographic order — the worst run decides,
   * ties break at the second worst, a missing episode pads with 0) and, if a mature island exists besides the two
   * best, replace the worst mature one by a crossover child or a random immigrant. Returns the index of the best
   * island and the event (if any).
   *
   * Also updates the stagnation bookkeeping (per island and global) from `scoreVecs` — at every epoch end, even when
   * no island is replaced. An improvement is a LEXICOGRAPHIC one by more than STAGNATION_EPSILON: positions that
   * differ by at most the epsilon count as equal, the first position beyond it decides. State files without vectors
   * (pre-lex) have no stored baseline: the first epoch anchors it and behaves as never stagnant. PAUSED islands
   * (focus mode) skip their per-island bookkeeping: their center is frozen, so a fresh-course "improvement" would be
   * course noise, not learning — they keep taking part in the ranking / replacement with their last center.
   *
   * FOCUS mode transitions (epoch end only): entry when any island or the global best stagnates — the focus set is
   * every STAGNANT island (stagn > 0; "at least those that stagnate"), or when only the global best stagnates the
   * single WORST-RANKED island; a proper subset only (all islands stagnant = nothing to pause = normal operation,
   * the global sigma boost covers that). A focused island LEAVES the focus when its fresh-course vector
   * lexicographically improves over its best (the stagn reset above — the best cannot have moved during focus
   * without the island leaving first, so this is the pre-focus best) or when it is replaced (fresh lineage, nothing
   * to get over). When the set empties the focus ends; at FOCUS_MAX_EPOCHS it ends with all stagn counters reset
   * (else the boost re-enters focus at the very next epoch end).
   */
  reproduce(scoreVecs: number[][]): { best: number; event?: IslandsState['events'][number] } {
    const focus = this.state.focus
    const scores = scoreVecs.map((v) => v[0] ?? 0)
    for (let i = 0; i < this.state.islands.length; i++) {
      if (focus && !focus.set.includes(i)) continue // paused: bookkeeping frozen
      const isl = this.state.islands[i]!
      const vec = scoreVecs[i]!
      if (isl.bestScoreVec === undefined || lexGreater(vec, isl.bestScoreVec, STAGNATION_EPSILON)) isl.stagn = 0
      else isl.stagn = (isl.stagn ?? 0) + 1
      if (isl.bestScoreVec === undefined || lexCompare(vec, isl.bestScoreVec) > 0) isl.bestScoreVec = vec
      isl.bestScore = Math.max(scores[i]!, isl.bestScore ?? -Infinity)
    }
    const order = scoreVecs.map((v, i) => [v, i] as const).sort((a, b) => lexCompare(b[0], a[0])).map((x) => x[1])
    const best = order[0]!
    const top = scoreVecs[best]!
    if (this.state.globalBestVec === undefined || lexGreater(top, this.state.globalBestVec, STAGNATION_EPSILON)) this.state.globalStagn = 0
    else this.state.globalStagn = (this.state.globalStagn ?? 0) + 1
    if (this.state.globalBestVec === undefined || lexCompare(top, this.state.globalBestVec) > 0) this.state.globalBestVec = top
    this.state.globalBest = Math.max(...scores, this.state.globalBest ?? -Infinity)
    let event: IslandsState['events'][number] | undefined
    const candidates = order.slice(2).filter((i) => this.state.islands[i]!.age >= this.cfg.mature)
    if (this.cfg.islands >= 3 && candidates.length > 0) {
      const worst = candidates[candidates.length - 1]!
      const cross = this.rng.next() < this.cfg.pCross
      const genome = cross
        ? crossoverNeurons(this.state.islands[order[0]!]!.es.theta, this.state.islands[order[1]!]!.es.theta, this.rng)
        : freshGenome(this.rng, this.esCfg.initStd, genomeShape(this.esCfg.dim).nIn, genomeShape(this.esCfg.dim).hidden)
      const es = initialEsState({ ...this.esCfg, seed: this.esCfg.seed * 1000 + worst + this.state.gen })
      es.theta = genome
      // the fresh island carries no sigma / csaPath: a new lineage restarts CSA at the base sigma, path zero
      this.state.islands[worst] = { es, age: 0, origin: cross ? 'cross' : 'random', stagn: 0 }
      this.engineCfgs[worst] = { ...this.esCfg, seed: this.esCfg.seed * 1000 + worst + this.state.gen }
      this.engineCfgs[worst].sigma = this.esCfg.sigma * this.boost(worst)
      this.engines[worst] = new PolicyEs(this.engineCfgs[worst], es, this.fitness, this.fitnessVec)
      this.state.rngState = this.rng.getState()
      event = { gen: this.state.gen, replaced: worst, with: cross ? 'crossover' : 'immigrant', scores: scores.map((s) => Math.round(s * 1000) / 1000) }
      this.state.events.push(event)
    }
    if (focus) {
      focus.epochs++
      // a focused island stays while it still stagnates; the stagn reset (lex improvement over its pre-focus
      // best) or a replacement (fresh lineage) lets it out
      focus.set = focus.set.filter((i) => i !== event?.replaced && (this.state.islands[i]!.stagn ?? 0) > 0)
      if (focus.set.length === 0) this.state.focus = undefined
      else if (focus.epochs >= FOCUS_MAX_EPOCHS) {
        focus.set.forEach((i) => (this.state.islands[i]!.stagn = 0))
        this.state.globalStagn = 0
        this.state.focus = undefined
      }
    } else {
      const stagnant = this.state.islands.map((x, i) => ((x.stagn ?? 0) > 0 ? i : -1)).filter((i) => i >= 0)
      const set = stagnant.length > 0 ? stagnant : (this.state.globalStagn ?? 0) > 0 ? [order[order.length - 1]!] : []
      // focus needs someone to pause: when EVERY island stagnates there is nothing to concentrate on — the global
      // sigma boost already covers that case (and the focus cap would reset its counters every FOCUS_MAX_EPOCHS)
      if (set.length > 0 && set.length < this.state.islands.length) this.state.focus = { set, epochs: 0, sinceGen: this.state.gen }
    }
    return { best, event }
  }
}

/** Re-exported for tests: output of a genome on one input. */
export { policyForward, BLOCK }
