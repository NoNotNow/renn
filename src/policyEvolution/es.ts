import { createRng, gaussian, type Rng } from '@/avEvolution/core/rng'
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

  constructor(readonly cfg: EsConfig, state?: EsState) {
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
    const fit = results.map((r) => aggregateFitness(r))
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
      center: aggregateFitness(centerMetrics!),
      best: Math.max(...fit),
      mean: fit.reduce((a, b) => a + b, 0) / fit.length,
      worst: Math.min(...fit),
      sigma,
      episodes: (cands.length + 1) * keys.length,
    }
  }
}
