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
  /**
   * Size of the per-generation episode BATCH (common random numbers): every candidate of a generation, including the
   * re-scored elites, is ranked on exactly these keys (a rotating window over the train pool; >= pool size => all keys).
   * Episodes are deterministic per (params, key), so an elite only runs the batch keys it has not seen yet.
   */
  episodesPerEval: number
  /** the best `fullEvalTop` candidates of each generation are completed on ALL train keys (hall of fame entry ticket) */
  fullEvalTop: number
  /** baseline scores below this (s) are floored to it when forming the per-episode ratio (trivial starts must not dominate) */
  ratioFloor: number
  hallOfFameSize: number
  seed: number
  /** if set, only these genes are mutated / crossed (others stay at the seed individual's value) */
  activeGenes?: string[]
}

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  popSize: 16,
  eliteCount: 4,
  crossoverProb: 0.5,
  sigmaInit: 0.12,
  sigmaMin: 0.02,
  sigmaMax: 0.3,
  episodesPerEval: 6,
  fullEvalTop: 2,
  ratioFloor: 20,
  hallOfFameSize: 20,
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
  /** keys of the last completed generation's batch (the keys population fitness is measured on) */
  batchKeys?: string[]
  /** per-key reference of the default params (score = episodeScore, exitT); fitness is score / baseline score */
  baseline?: Record<string, BaselineEntry> | null
  evals: number
  population: Candidate[]
  hallOfFame: Candidate[]
}

export interface BaselineEntry {
  score: number
  exitT: number
}

export interface EngineInit {
  spec: GenomeSpec
  trainKeys: string[]
  config?: Partial<EvolutionConfig>
  weights?: Partial<FitnessWeights>
  /** overrides spec defaults for the seed individual */
  initialParams?: Params
  /** per-key baseline (default params) used to normalise every episode score */
  baseline?: Record<string, BaselineEntry>
  /** extra seed individuals (partial params over the defaults), added after the default individual */
  seedParams?: Params[]
}

/** Fitness over the candidate's episodes, restricted to `keys` when given (common-batch comparison). */
export const fitnessOf = (c: Candidate, keys?: string[], w?: Pick<FitnessWeights, 'wWorst'>): number => {
  const eps = keys ? c.episodes.filter((e) => keys.includes(e.key)) : c.episodes
  if (keys && eps.length < new Set(keys).size) return Infinity
  return aggregate(eps, w).fitness
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
  private batchKeys: string[] = []
  private baseline: Record<string, BaselineEntry> | null
  private seedParams: Params[]
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
    this.baseline = init.baseline ?? null
    this.seedParams = init.seedParams ?? []
    this.batchKeys = this.trainKeys.slice(0, Math.max(1, this.config.episodesPerEval))
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
  /** keys the current population was ranked on */
  getBatchKeys(): readonly string[] {
    return this.batchKeys
  }
  getBaseline(): Record<string, BaselineEntry> | null {
    return this.baseline
  }
  /** fitness on the common batch (lower is better) */
  private fit = (c: Candidate): number => fitnessOf(c, this.batchKeys, this.weights)
  /** fitness over ALL train keys (Infinity until every train key was evaluated) */
  fullFitness = (c: Candidate): number => fitnessOf(c, this.trainKeys, this.weights)
  private byFit = (a: Candidate, b: Candidate) => {
    const d = this.fit(a) - this.fit(b)
    if (d !== 0 && !Number.isNaN(d)) return d
    return b.episodes.length - a.episodes.length || (a.id < b.id ? -1 : 1)
  }
  private byFull = (a: Candidate, b: Candidate) => {
    const d = this.fullFitness(a) - this.fullFitness(b)
    if (d !== 0 && !Number.isNaN(d)) return d
    return a.id < b.id ? -1 : 1
  }
  best(): Candidate | undefined {
    return this.population.length ? [...this.population].sort(this.byFit)[0] : undefined
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
    for (const sp of this.seedParams) {
      if (out.length >= c.popSize) break
      out.push({ vec: normalise(this.spec, { ...defaultParams(this.spec), ...this.initialParams, ...sp }), sigma: c.sigmaInit })
    }
    const groups = [...new Set(this.spec.genes.map((g) => g.group))]
    for (const grp of groups) {
      if (out.length >= c.popSize) break
      out.push(perturbGroup(this.spec, base, grp, this.rng, c.sigmaInit * 1.5))
    }
    while (out.length < c.popSize) out.push(mutate(this.spec, base, this.rng, this.mutOpts()))
    return out.map((g) => this.newCandidate(g, []))
  }

  private mutOpts() {
    const active = this.config.activeGenes
    const activeIdx = active ? this.spec.genes.map((g, i) => (active.includes(g.key) ? i : -1)).filter((i) => i >= 0) : undefined
    return { mutProb: this.config.mutProb, sigmaMin: this.config.sigmaMin, sigmaMax: this.config.sigmaMax, activeIdx }
  }

  private tournament(pop: Candidate[]): Candidate {
    const a = pop[Math.floor(this.rng.next() * pop.length)]
    const b = pop[Math.floor(this.rng.next() * pop.length)]
    return this.byFit(a, b) <= 0 ? a : b
  }

  private takeKeys(n: number): string[] {
    const keys: string[] = []
    const len = this.trainKeys.length
    for (let i = 0; i < Math.min(n, len); i++) keys.push(this.trainKeys[(this.keyCursor + i) % len])
    this.keyCursor = (this.keyCursor + n) % len
    return keys
  }

  private record(m: EpisodeMetrics): EpisodeRecord {
    const b = this.baseline?.[m.key]
    return toEpisodeRecord(m, this.weights, b ? Math.max(b.score, this.config.ratioFloor ?? 0) : undefined)
  }

  /** Run one generation. If aborted, engine state is left exactly as before the call. */
  async step(evaluate: EvaluateFn, opts: StepOptions = {}): Promise<GenerationStats> {
    const t0 = Date.now()
    const c = this.config
    const snapshot = { rng: this.rng.getState(), nextId: this.nextId, keyCursor: this.keyCursor }
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
    // ---- common random numbers: ONE batch of keys for the whole generation (offspring AND elites)
    const batch = this.takeKeys(c.episodesPerEval)
    const sortedPop = [...this.population].sort(this.byFit)
    const elites = sortedPop.slice(0, c.eliteCount)
    type Job = { cand: Candidate; keys: string[] }
    const missing = (cand: Candidate, keys: string[]) => keys.filter((k) => !cand.episodes.some((e) => e.key === k))
    const jobs: Job[] = offspring.map((cand) => ({ cand, keys: batch }))
    if (!seeding) for (const e of elites) if (missing(e, batch).length) jobs.push({ cand: e, keys: missing(e, batch) })

    // ---- evaluate with a concurrency pool; results are staged and committed only if not aborted
    const added = new Map<Candidate, EpisodeRecord[]>()
    let aborted = false
    const stopped = () => aborted || !!opts.shouldStop?.() || !!opts.signal?.aborted
    const runJobs = async (list: Job[]) => {
      let cursor = 0
      const worker = async () => {
        for (;;) {
          if (stopped()) {
            aborted = true
            return
          }
          const idx = cursor++
          if (idx >= list.length) return
          const job = list[idx]
          const metrics = await evaluate(job.cand.params, job.keys)
          const recs = metrics.map((m) => this.record(m))
          added.set(job.cand, [...(added.get(job.cand) ?? []), ...recs])
          if (opts.onCandidate) opts.onCandidate(job.cand, aggregate([...job.cand.episodes, ...added.get(job.cand)!], this.weights))
        }
      }
      const nWorkers = Math.max(1, Math.min(opts.concurrency ?? 1, list.length))
      await Promise.all(Array.from({ length: nWorkers }, worker))
      if (!aborted && cursor < list.length) aborted = true
    }
    const withStaged = (cand: Candidate) => ({ ...cand, episodes: [...cand.episodes, ...(added.get(cand) ?? [])] })
    const commit = () => {
      for (const [cand, recs] of added) cand.episodes = [...cand.episodes, ...recs]
      added.clear()
    }
    await runJobs(jobs)
    let evalCount = 0
    // phase 2: complete the best candidates of this generation on ALL train keys (hall-of-fame entry ticket)
    if (!aborted) {
      const staged = [...elites, ...offspring].map(withStaged)
      const bf = (x: Candidate) => fitnessOf(x, batch, this.weights)
      const stagedById = new Map(staged.map((x) => [x.id, x]))
      const top = [...new Set([...elites, ...offspring].map((x) => x.id))]
        .map((id) => stagedById.get(id)!)
        .sort((x, y) => bf(x) - bf(y) || (x.id < y.id ? -1 : 1))
        .slice(0, c.fullEvalTop)
      const real = new Map([...elites, ...offspring].map((x) => [x.id, x]))
      const full: Job[] = []
      for (const t of top) {
        const cand = real.get(t.id)!
        const miss = this.trainKeys.filter((k) => !t.episodes.some((e) => e.key === k))
        if (miss.length) full.push({ cand, keys: miss })
      }
      await runJobs(full)
    }

    if (aborted) {
      this.rng.setState(snapshot.rng)
      this.nextId = snapshot.nextId
      this.keyCursor = snapshot.keyCursor
      this._gen = savedGen
      return { ...this.stats(Date.now() - t0, 0), aborted: true }
    }
    for (const recs of added.values()) evalCount += recs.length
    commit()
    this.totalEvals += evalCount
    this.batchKeys = batch

    // ---- (mu+lambda) selection on the common batch: elites guaranteed, remainder by fitness
    const pool = [...elites, ...offspring].sort(this.byFit)
    const eliteIds = new Set(elites.map((e) => e.id))
    const kept: Candidate[] = pool.filter((p) => eliteIds.has(p.id)).slice(0, c.eliteCount)
    for (const p of pool) {
      if (kept.length >= c.popSize) break
      if (!kept.includes(p)) kept.push(p)
    }
    this.population = kept.sort(this.byFit)
    this.updateHof(pool)
    return this.stats(Date.now() - t0, evalCount)
  }

  /** Hall of fame: only candidates evaluated on EVERY train key, ranked by that full-train fitness. */
  private updateHof(fresh: Candidate[]) {
    const byId = new Map(this.hof.map((h) => [h.id, h]))
    for (const p of fresh) if (Number.isFinite(this.fullFitness(p))) byId.set(p.id, p)
    this.hof = [...byId.values()].sort(this.byFull).slice(0, this.config.hallOfFameSize)
  }

  private stats(wallMs: number, evals: number): GenerationStats {
    const fits = this.population.map(this.fit).filter(Number.isFinite).sort((a, b) => a - b)
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
        batchKeys: this.batchKeys,
        baseline: this.baseline,
        evals: this.totalEvals,
        population: this.population,
        hallOfFame: this.hof,
      } satisfies EvolutionState),
    )
  }

  static fromJSON(s: EvolutionState): EvolutionEngine {
    if (s.schema !== 'renn.av-evolution.state/1') throw new Error(`unsupported state schema ${String(s.schema)}`)
    const e = new EvolutionEngine({ spec: s.spec, trainKeys: s.trainKeys, config: s.config, weights: { ...s.weights, wReversal: (s.weights as Partial<FitnessWeights>).wReversal ?? 0 }, initialParams: s.initialParams ?? undefined, baseline: s.baseline ?? undefined })
    // states saved before the reversal weight existed resume with 0 so their stored fitness stays comparable
    e.rng.setState(s.rngState)
    e._gen = s.gen
    e.nextId = s.nextId
    e.keyCursor = s.keyCursor
    if (s.batchKeys?.length) e.batchKeys = s.batchKeys.slice()
    e.baseline = s.baseline ?? null
    e.totalEvals = s.evals
    e.population = JSON.parse(JSON.stringify(s.population))
    e.hof = JSON.parse(JSON.stringify(s.hallOfFame))
    return e
  }
}
