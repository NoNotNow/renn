import { aggregate, DEFAULT_FITNESS_WEIGHTS, toEpisodeRecord, type Aggregate, type EpisodeMetrics, type EpisodeRecord, type FitnessWeights } from './fitness'
import { defaultParams, denormalise, normalise, type GenomeSpec, type Params } from './genes'
import { mutate, perturbGroup, uniformCrossover, type Genotype } from './operators'
import { createRng, type Rng } from './rng'

export interface Candidate extends Genotype {
  id: string
  /** generation of birth (0 = seed population) */
  gen: number
  parents: string[]
  params: Params
  episodes: EpisodeRecord[]
}

export interface EvolutionConfig {
  popSize: number
  eliteCount: number
  crossoverProb: number
  /** per-gene mutation prob; undefined => operator default */
  mutProb?: number
  sigmaInit: number
  sigmaMin: number
  sigmaMax: number
  /** episodes per new candidate per generation */
  episodesPerEval: number
  /** elites get one extra episode each generation (running-mean fitness) */
  reevalElites: boolean
  hallOfFameSize: number
  /** candidates need at least this many episodes to enter the hall of fame */
  minEpisodesForHof: number
  seed: number
}

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  popSize: 16,
  eliteCount: 4,
  crossoverProb: 0.5,
  sigmaInit: 0.12,
  sigmaMin: 0.02,
  sigmaMax: 0.3,
  episodesPerEval: 2,
  reevalElites: true,
  hallOfFameSize: 20,
  minEpisodesForHof: 3,
  seed: 1,
}

export interface GenerationStats {
  gen: number
  /** best (lowest) population fitness after selection */
  best: number
  mean: number
  median: number
  sigmaMean: number
  /** episodes evaluated this generation */
  evals: number
  wallMs: number
  bestId: string
  aborted?: boolean
}

export type EvaluateFn = (params: Params, episodeKeys: string[]) => Promise<EpisodeMetrics[]>

export interface StepOptions {
  /** max candidates evaluated at once (default 1) */
  concurrency?: number
  /** polled before starting each candidate; true => abort the generation (state is left untouched) */
  shouldStop?: () => boolean
  signal?: { aborted: boolean }
  /** called after each candidate evaluation completes */
  onCandidate?: (c: Candidate, agg: Aggregate) => void
}

export interface EvolutionState {
  schema: 'renn.av-evolution.state/1'
  spec: GenomeSpec
  config: EvolutionConfig
  weights: FitnessWeights
  trainKeys: string[]
  initialParams: Params | null
  rngState: number
  gen: number
  nextId: number
  keyCursor: number
  eliteKeyCursor: number
  evals: number
  population: Candidate[]
  hallOfFame: Candidate[]
}

export interface EngineInit {
  spec: GenomeSpec
  trainKeys: string[]
  config?: Partial<EvolutionConfig>
  weights?: Partial<FitnessWeights>
  /** overrides spec defaults for the seed individual */
  initialParams?: Params
}

export const fitnessOf = (c: Candidate): number => aggregate(c.episodes).fitness

const byFitness = (a: Candidate, b: Candidate) => {
  const d = fitnessOf(a) - fitnessOf(b)
  if (d !== 0 && !Number.isNaN(d)) return d
  return b.episodes.length - a.episodes.length || (a.id < b.id ? -1 : 1)
}

export class EvolutionEngine {
  readonly spec: GenomeSpec
  readonly config: EvolutionConfig
  readonly weights: FitnessWeights
  readonly trainKeys: string[]
  private initialParams: Params | null
  private rng: Rng
  private _gen = 0
  private nextId = 0
  private keyCursor = 0
  private eliteKeyCursor = 0
  private totalEvals = 0
  private population: Candidate[] = []
  private hof: Candidate[] = []

  constructor(init: EngineInit) {
    if (init.trainKeys.length === 0) throw new Error('trainKeys must not be empty')
    this.spec = init.spec
    this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...init.config }
    this.weights = { ...DEFAULT_FITNESS_WEIGHTS, ...init.weights }
    this.trainKeys = init.trainKeys.slice()
    this.initialParams = init.initialParams ?? null
    this.rng = createRng(this.config.seed)
  }

  get gen(): number {
    return this._gen
  }
  get evals(): number {
    return this.totalEvals
  }
  getPopulation(): readonly Candidate[] {
    return this.population
  }
  getHallOfFame(): readonly Candidate[] {
    return this.hof
  }
  best(): Candidate | undefined {
    return this.population.length ? [...this.population].sort(byFitness)[0] : undefined
  }

  private newCandidate(g: Genotype, parents: string[]): Candidate {
    return {
      id: `c${this.nextId++}`,
      gen: this._gen,
      parents,
      vec: g.vec,
      sigma: g.sigma,
      params: denormalise(this.spec, g.vec),
      episodes: [],
    }
  }

  private seedPopulation(): Candidate[] {
    const c = this.config
    const base: Genotype = { vec: normalise(this.spec, { ...defaultParams(this.spec), ...this.initialParams }), sigma: c.sigmaInit }
    const out: Genotype[] = [base]
    const groups = [...new Set(this.spec.genes.map((g) => g.group))]
    for (const grp of groups) {
      if (out.length >= c.popSize) break
      out.push(perturbGroup(this.spec, base, grp, this.rng, c.sigmaInit * 1.5))
    }
    while (out.length < c.popSize) out.push(mutate(this.spec, base, this.rng, this.mutOpts()))
    return out.map((g) => this.newCandidate(g, []))
  }

  private mutOpts() {
    return { mutProb: this.config.mutProb, sigmaMin: this.config.sigmaMin, sigmaMax: this.config.sigmaMax }
  }

  private tournament(pop: Candidate[]): Candidate {
    const a = pop[Math.floor(this.rng.next() * pop.length)]
    const b = pop[Math.floor(this.rng.next() * pop.length)]
    return byFitness(a, b) <= 0 ? a : b
  }

  private takeKeys(cursorName: 'keyCursor' | 'eliteKeyCursor', n: number): string[] {
    const keys: string[] = []
    const len = this.trainKeys.length
    for (let i = 0; i < Math.min(n, len); i++) keys.push(this.trainKeys[(this[cursorName] + i) % len])
    this[cursorName] = (this[cursorName] + n) % len
    return keys
  }

  /** Run one generation. If aborted, engine state is left exactly as before the call. */
  async step(evaluate: EvaluateFn, opts: StepOptions = {}): Promise<GenerationStats> {
    const t0 = Date.now()
    const c = this.config
    const snapshot = { rng: this.rng.getState(), nextId: this.nextId, keyCursor: this.keyCursor, eliteKeyCursor: this.eliteKeyCursor }
    const seeding = this.population.length === 0
    const nextGen = seeding ? 0 : this._gen + 1
    const savedGen = this._gen
    this._gen = nextGen

    // ---- build the work list (all rng use happens here => deterministic regardless of concurrency)
    let offspring: Candidate[]
    if (seeding) offspring = this.seedPopulation()
    else {
      offspring = []
      for (let i = 0; i < c.popSize; i++) {
        const p1 = this.tournament(this.population)
        let g: Genotype
        let parents = [p1.id]
        if (this.population.length > 1 && this.rng.next() < c.crossoverProb) {
          let p2 = this.tournament(this.population)
          for (let tries = 0; p2 === p1 && tries < 4; tries++) p2 = this.tournament(this.population)
          g = uniformCrossover(p1, p2, this.rng)
          parents = [p1.id, p2.id]
        } else g = { vec: p1.vec, sigma: p1.sigma }
        offspring.push(this.newCandidate(mutate(this.spec, g, this.rng, this.mutOpts()), parents))
      }
    }
    const genKeys = this.takeKeys('keyCursor', c.episodesPerEval)
    type Job = { cand: Candidate; keys: string[] }
    const jobs: Job[] = offspring.map((cand) => ({ cand, keys: genKeys }))
    const sortedPop = [...this.population].sort(byFitness)
    const elites = sortedPop.slice(0, c.eliteCount)
    if (!seeding && c.reevalElites) {
      for (const e of elites) jobs.push({ cand: e, keys: this.takeKeys('eliteKeyCursor', 1) })
    }

    // ---- evaluate with a concurrency pool; results are staged and committed only if not aborted
    const results: (EpisodeRecord[] | null)[] = jobs.map(() => null)
    let cursor = 0
    let aborted = false
    const stopped = () => aborted || !!opts.shouldStop?.() || !!opts.signal?.aborted
    const worker = async () => {
      for (;;) {
        if (stopped()) {
          aborted = true
          return
        }
        const idx = cursor++
        if (idx >= jobs.length) return
        const job = jobs[idx]
        const metrics = await evaluate(job.cand.params, job.keys)
        results[idx] = metrics.map((m) => toEpisodeRecord(m, this.weights))
        if (opts.onCandidate) opts.onCandidate(job.cand, aggregate([...job.cand.episodes, ...results[idx]!]))
      }
    }
    const nWorkers = Math.max(1, Math.min(opts.concurrency ?? 1, jobs.length))
    await Promise.all(Array.from({ length: nWorkers }, worker))
    if (!aborted && results.some((r) => r === null)) aborted = true

    if (aborted) {
      this.rng.setState(snapshot.rng)
      this.nextId = snapshot.nextId
      this.keyCursor = snapshot.keyCursor
      this.eliteKeyCursor = snapshot.eliteKeyCursor
      this._gen = savedGen
      return { ...this.stats(Date.now() - t0, 0), aborted: true }
    }

    let evalCount = 0
    jobs.forEach((job, i) => {
      job.cand.episodes = [...job.cand.episodes, ...results[i]!]
      evalCount += results[i]!.length
    })
    this.totalEvals += evalCount

    // ---- (mu+lambda) selection: elites are guaranteed, remainder by fitness
    const pool = [...this.population, ...offspring].sort(byFitness)
    const eliteIds = new Set(elites.map((e) => e.id))
    const kept: Candidate[] = pool.filter((p) => eliteIds.has(p.id)).slice(0, c.eliteCount)
    for (const p of pool) {
      if (kept.length >= c.popSize) break
      if (!kept.includes(p)) kept.push(p)
    }
    this.population = kept.sort(byFitness)
    this.updateHof()
    return this.stats(Date.now() - t0, evalCount)
  }

  private updateHof() {
    const byId = new Map(this.hof.map((h) => [h.id, h]))
    for (const p of this.population) {
      if (p.episodes.length >= this.config.minEpisodesForHof) byId.set(p.id, p)
    }
    this.hof = [...byId.values()].sort(byFitness).slice(0, this.config.hallOfFameSize)
  }

  private stats(wallMs: number, evals: number): GenerationStats {
    const fits = this.population.map(fitnessOf).filter(Number.isFinite).sort((a, b) => a - b)
    const mean = fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : NaN
    const median = fits.length ? (fits.length % 2 ? fits[(fits.length - 1) / 2] : (fits[fits.length / 2 - 1] + fits[fits.length / 2]) / 2) : NaN
    const sigmaMean = this.population.length ? this.population.reduce((a, p) => a + p.sigma, 0) / this.population.length : NaN
    const b = this.best()
    return { gen: this._gen, best: fits[0] ?? NaN, mean, median, sigmaMean, evals, wallMs, bestId: b?.id ?? '' }
  }

  toJSON(): EvolutionState {
    return JSON.parse(
      JSON.stringify({
        schema: 'renn.av-evolution.state/1',
        spec: this.spec,
        config: this.config,
        weights: this.weights,
        trainKeys: this.trainKeys,
        initialParams: this.initialParams,
        rngState: this.rng.getState(),
        gen: this._gen,
        nextId: this.nextId,
        keyCursor: this.keyCursor,
        eliteKeyCursor: this.eliteKeyCursor,
        evals: this.totalEvals,
        population: this.population,
        hallOfFame: this.hof,
      } satisfies EvolutionState),
    )
  }

  static fromJSON(s: EvolutionState): EvolutionEngine {
    if (s.schema !== 'renn.av-evolution.state/1') throw new Error(`unsupported state schema ${String(s.schema)}`)
    const e = new EvolutionEngine({ spec: s.spec, trainKeys: s.trainKeys, config: s.config, weights: s.weights, initialParams: s.initialParams ?? undefined })
    e.rng.setState(s.rngState)
    e._gen = s.gen
    e.nextId = s.nextId
    e.keyCursor = s.keyCursor
    e.eliteKeyCursor = s.eliteKeyCursor
    e.totalEvals = s.evals
    e.population = JSON.parse(JSON.stringify(s.population))
    e.hof = JSON.parse(JSON.stringify(s.hallOfFame))
    return e
  }
}
