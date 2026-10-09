import { createRng, gaussian, type Rng } from '@/avEvolution/core/rng'
import { GENOME_LENGTH, N_HIDDEN, N_IN, N_OUT, policyForward } from './policy'
import { DEFAULT_ES_CONFIG, initialEsState, PolicyEs, type EsConfig, type EsState, type EvaluateGenome, type GenerationReport } from './es'

/**
 * Island model on top of the evolution strategy: several independent ES centres ("islands") learn side by side on the same course
 * batches. Every `epoch` generations they are ranked on fresh courses; the worst MATURE island is then replaced either by a crossover of
 * the two best islands or by a brand new random network ("immigrant"). Crossover works on hidden NEURONS (incoming weights + bias +
 * outgoing weights): the second parent's neurons are first aligned to the first parent's (permutation and sign symmetry of tanh units),
 * otherwise the child would be a broken mixture of unrelated feature orders.
 */

const BLOCK = N_IN + 1 + N_OUT
const W1 = 0
const B1 = N_HIDDEN * N_IN
const W2 = B1 + N_HIDDEN
const B2 = W2 + N_OUT * N_HIDDEN

/** Hidden neuron j of a genome as one block: [incoming weights (N_IN), bias, outgoing weights (N_OUT)]. */
export function neuronBlock(g: ArrayLike<number>, j: number): number[] {
  const b: number[] = []
  for (let i = 0; i < N_IN; i++) b.push(g[W1 + j * N_IN + i]!)
  b.push(g[B1 + j]!)
  for (let k = 0; k < N_OUT; k++) b.push(g[W2 + k * N_HIDDEN + j]!)
  return b
}

export function setNeuronBlock(g: number[], j: number, b: ArrayLike<number>, sign = 1): void {
  for (let i = 0; i < N_IN; i++) g[W1 + j * N_IN + i] = sign * b[i]!
  g[B1 + j] = sign * b[N_IN]!
  // tanh is odd: negating a neuron's incoming side and its outgoing weights leaves the function unchanged
  for (let k = 0; k < N_OUT; k++) g[W2 + k * N_HIDDEN + j] = sign * b[N_IN + 1 + k]!
}

/** Plausible policy inputs (rays mostly clear, speeds, unit goal vector ...) for comparing what hidden neurons compute. */
export function sampleInputs(n: number, rng: Rng): number[][] {
  const out: number[][] = []
  for (let s = 0; s < n; s++) {
    const x: number[] = []
    const nRays = N_IN - 8
    for (let i = 0; i < nRays; i++) x.push(rng.next() < 0.55 ? rng.next() : 0)
    x.push(rng.next() * 1.3 - 0.3, gaussian(rng) * 0.3, gaussian(rng) * 0.3)
    const a = rng.next() * 2 * Math.PI
    x.push(Math.cos(a), Math.sin(a), rng.next(), rng.next() * 2 - 1, rng.next() * 2 - 1)
    out.push(x)
  }
  return out
}

function hiddenActivations(g: ArrayLike<number>, xs: number[][]): number[][] {
  return Array.from({ length: N_HIDDEN }, (_, j) =>
    xs.map((x) => {
      let s = g[B1 + j]!
      for (let i = 0; i < N_IN; i++) s += g[W1 + j * N_IN + i]! * x[i]!
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
  const xs = sampleInputs(samples, createRng(seed))
  const ha = hiddenActivations(a, xs)
  const hb = hiddenActivations(b, xs)
  const corr = ha.map((r) => hb.map((c) => correlation(r, c)))
  const match = assign(corr.map((r) => r.map((c) => Math.abs(c))))
  return { match, sign: match.map((m, i) => (corr[i]![m]! < 0 ? -1 : 1)) }
}

/** Child = parent A where each hidden neuron is, with probability `pB`, replaced by the aligned neuron of parent B (at least one of each). */
export function crossoverNeurons(a: ArrayLike<number>, b: ArrayLike<number>, rng: Rng, pB = 0.5): number[] {
  const { match, sign } = alignNeurons(a, b)
  const child = Array.from(a)
  const take = Array.from({ length: N_HIDDEN }, () => rng.next() < pB)
  if (!take.some(Boolean)) take[Math.floor(rng.next() * N_HIDDEN)] = true
  if (take.every(Boolean)) take[Math.floor(rng.next() * N_HIDDEN)] = false
  for (let i = 0; i < N_HIDDEN; i++) if (take[i]) setNeuronBlock(child, i, neuronBlock(b, match[i]!), sign[i]!)
  // output biases: average of the parents
  for (let k = 0; k < N_OUT; k++) child[B2 + k] = (a[B2 + k]! + b[B2 + k]!) / 2
  return child
}

export function freshGenome(rng: Rng, initStd = DEFAULT_ES_CONFIG.initStd): number[] {
  const g = Array.from({ length: GENOME_LENGTH }, () => gaussian(rng) * initStd)
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

export interface IslandState {
  es: EsState
  /** generations since this island was (re)started */
  age: number
  /** how it started: 'random' | 'cross' */
  origin: string
}

export interface IslandsState {
  gen: number
  islands: IslandState[]
  rngState: number
  /** log of replacements: {gen, replaced, with, scores} */
  events: Array<{ gen: number; replaced: number; with: string; scores: number[] }>
}

export function initialIslands(esCfg: EsConfig, cfg: IslandsConfig): IslandsState {
  const rng = createRng(esCfg.seed * 7919 + 13)
  const islands: IslandState[] = []
  for (let k = 0; k < cfg.islands; k++) {
    const es = initialEsState({ ...esCfg, seed: esCfg.seed * 1000 + k })
    es.theta = freshGenome(createRng(esCfg.seed * 1000 + k), esCfg.initStd)
    islands.push({ es, age: 0, origin: 'random' })
  }
  return { gen: 0, islands, rngState: rng.getState(), events: [] }
}

export interface IslandsStepReport {
  gen: number
  /** per-island report of this generation */
  reports: GenerationReport[]
}

/** The island model driver. `esCfg.pairs` is the number of antithetic pairs PER island. */
export class IslandEs {
  readonly engines: PolicyEs[]
  private readonly rng: Rng

  constructor(readonly esCfg: EsConfig, readonly cfg: IslandsConfig, public state: IslandsState) {
    this.engines = state.islands.map((isl, k) => new PolicyEs({ ...esCfg, seed: esCfg.seed * 1000 + k }, isl.es))
    this.rng = createRng(0)
    this.rng.setState(state.rngState)
  }

  /** One generation: every island takes its ES step on the same course batch. */
  async step(evaluate: EvaluateGenome, keys: string[]): Promise<IslandsStepReport> {
    const reports = await Promise.all(this.engines.map((e) => e.step(evaluate, keys)))
    this.state.gen++
    this.state.islands.forEach((isl, k) => {
      isl.es = this.engines[k]!.state
      isl.age++
    })
    this.state.rngState = this.rng.getState()
    return { gen: this.state.gen, reports }
  }

  isEpochEnd(): boolean {
    return this.state.gen > 0 && this.state.gen % this.cfg.epoch === 0
  }

  /**
   * Rank the islands by `scores` (higher = better) and, if a mature island exists besides the two best, replace the worst mature one
   * by a crossover child or a random immigrant. Returns the index of the best island and the event (if any).
   */
  reproduce(scores: number[]): { best: number; event?: IslandsState['events'][number] } {
    const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1])
    const best = order[0]!
    const candidates = order.slice(2).filter((i) => this.state.islands[i]!.age >= this.cfg.mature)
    if (this.cfg.islands < 3 || candidates.length === 0) return { best }
    const worst = candidates[candidates.length - 1]!
    const cross = this.rng.next() < this.cfg.pCross
    const genome = cross
      ? crossoverNeurons(this.state.islands[order[0]!]!.es.theta, this.state.islands[order[1]!]!.es.theta, this.rng)
      : freshGenome(this.rng, this.esCfg.initStd)
    const es = initialEsState({ ...this.esCfg, seed: this.esCfg.seed * 1000 + worst + this.state.gen })
    es.theta = genome
    this.state.islands[worst] = { es, age: 0, origin: cross ? 'cross' : 'random' }
    this.engines[worst] = new PolicyEs({ ...this.esCfg, seed: this.esCfg.seed * 1000 + worst + this.state.gen }, es)
    this.state.rngState = this.rng.getState()
    const event = { gen: this.state.gen, replaced: worst, with: cross ? 'crossover' : 'immigrant', scores: scores.map((s) => Math.round(s * 1000) / 1000) }
    this.state.events.push(event)
    return { best, event }
  }
}

/** Re-exported for tests: output of a genome on one input. */
export { policyForward, BLOCK }
