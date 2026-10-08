/**
 * (mu+lambda) evolution of the AV maze profile with a hard constraint proxy.
 *
 * Candidate pipeline (all sim work goes through the TaskRunner = worker pool, results cached by task id):
 *   1. sentinel tier (5 proxy cases x budgets, ~12 s CPU): any failure => infeasible, harness skipped (score = offset + violation).
 *   2. harness on the full train set (solo / flee / flee-real x mazes x starts) => fitness.
 *   3. only if fitness <= the elite cut (fixed at generation start) the remaining proxy cases (22 cases, both budgets) run;
 *      feasible <=> every proxy case passes. Otherwise the candidate stays "unverified" (cannot be elite, can never be reported as best).
 * Persistence: checkpoint.json after every candidate and generation, candidates.jsonl, tasks.jsonl; resume = same out dir.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRng, type Rng } from '@/avEvolution/core/rng'
import type { EpResult, EpSpec } from '../hunt-maze/episode'
import type { CaseResult } from './probe/proxy'
import { constraintScore, DEFAULT_WEIGHTS, harnessFitness, infeasibleScore, type FitWeights } from './fitness'
import { activeKeys, crossover, decodeGenome, encodeProfile, emptyGenome, mutate, profileHash, profileParams, proxyExtra, type Genome, type Profile } from './genome'
import { appendCandidate, files, loadCandidates, readJson, writeJsonAtomic, type CandRecord, type Checkpoint } from './store'
import { epTaskId, proxyCases, proxyId, pxTaskId, sentinelCases, type Budget, type ProxyId, type Task } from './tasks'

export interface TaskRunner { run<T>(t: Task): Promise<T> }
export interface SeedProfile { name: string; profile: Record<string, unknown> }
export interface EvoOpts {
  outDir: string
  popSize: number
  eliteCount: number
  /** target number of completed generations (0 = only the seed generation) */
  gens: number
  seed: number
  seconds: number
  specs: EpSpec[]
  world?: string
  weights: FitWeights
  /** a candidate gets the full proxy when fitness <= cut * cutSlack */
  cutSlack: number
  crossP: number
  seeds: SeedProfile[]
  log?: (s: string) => void
}

const sigOf = (o: EvoOpts) => createHash('sha1').update(JSON.stringify([o.seed, o.popSize, o.seconds, o.specs.map((s) => s.id), o.world, o.weights, o.seeds.map((s) => s.name)])).digest('hex').slice(0, 12)

export class Evolution {
  readonly cands: Map<string, CandRecord>
  private base: Record<string, CaseResult> = {}
  private baseFit = NaN
  private cp: Checkpoint
  private rng: Rng
  private t0 = Date.now()
  private evalsThisRun = 0
  private stopped = false
  private readonly f: ReturnType<typeof files>
  private log: (s: string) => void

  constructor(private o: EvoOpts, private runner: TaskRunner) {
    this.f = files(o.outDir)
    fs.mkdirSync(o.outDir, { recursive: true })
    this.log = o.log ?? ((s) => console.log(s))
    this.cands = loadCandidates(this.f.candidates)
    const sig = sigOf(o)
    const prev = readJson<Checkpoint>(this.f.checkpoint)
    if (prev && prev.configSig !== sig) throw new Error(`out dir ${o.outDir} holds a run with a different config (sig ${prev.configSig} != ${sig}); use a new --out`)
    this.cp = prev ?? { version: 1, gen: 0, offspring: null, pop: [], rngState: 0, initDone: false, initPop: [], baseFitness: null, configSig: sig, history: [], wallSPrev: 0 }
    this.rng = createRng(o.seed)
    if (prev) this.rng.setState(prev.rngState)
    else this.cp.rngState = this.rng.getState()
    if (prev?.baseFitness != null) this.baseFit = prev.baseFitness
  }

  stop(): void { this.stopped = true }
  private save(): void {
    this.cp.rngState = this.rng.getState()
    writeJsonAtomic(this.f.checkpoint, this.cp)
  }
  private wallS(): number { return this.cp.wallSPrev + (Date.now() - this.t0) / 1000 }

  // ---- evaluation ----
  private async proxyBatch(hash: string, profile: Profile, ids: ProxyId[]): Promise<{ id: string; r: CaseResult }[]> {
    const extra = proxyExtra(profile)
    return Promise.all(ids.map(async (p) => ({ id: proxyId(p), r: await this.runner.run<CaseResult>({ t: 'px', id: pxTaskId(hash, p), name: p.name, budget: p.budget as Budget, extra }) })))
  }
  private async harness(hash: string, profile: Profile): Promise<EpResult[]> {
    const params = profileParams(profile)
    return Promise.all(this.o.specs.map((spec) => this.runner.run<EpResult>({ t: 'ep', id: epTaskId(hash, spec.id, this.o.seconds, this.o.world), spec, params, seconds: this.o.seconds, world: this.o.world })))
  }

  /** cut = fitness a candidate must beat to earn the full proxy (fixed per generation). */
  private cut(): number {
    const feas = [...this.cands.values()].filter((c) => c.feasible === true && this.cp.pop.some((g) => profileHash(decodeGenome(g)) === c.hash)).map((c) => c.fitness!).sort((a, b) => a - b)
    const ref = feas.length >= this.o.eliteCount ? feas[this.o.eliteCount - 1]! : this.baseFit
    return (Number.isFinite(ref) ? ref : Infinity) * this.o.cutSlack
  }

  async evaluate(g: Genome, gen: number, cut: number): Promise<CandRecord> {
    const profile = decodeGenome(g)
    const hash = profileHash(profile)
    const have = this.cands.get(hash)
    if (have && (have.stage !== 'harness' || !(have.fitness! <= cut))) return have
    const tm = { sentinel: 0, harness: 0, proxy: 0 }
    let rec: CandRecord = have ?? { hash, gen, genome: g, profile, nKeys: activeKeys(g), stage: 'sentinel-fail', feasible: false, violation: 0, failing: [], fitness: null, score: Infinity, per: null, proxy: {}, timingsMs: tm }
    const t0 = Date.now()
    if (!have) {
      const sent = await this.proxyBatch(hash, profile, sentinelCases())
      tm.sentinel = Date.now() - t0
      for (const s of sent) rec.proxy[s.id] = s.r
      const cs = constraintScore(sent, this.base)
      if (!cs.feasible) {
        rec = { ...rec, stage: 'sentinel-fail', feasible: false, violation: cs.violation, failing: cs.failing, timingsMs: tm, score: infeasibleScore(cs.violation, Number.isFinite(this.baseFit) ? this.baseFit : 0, this.o.weights) }
        return this.record(rec)
      }
      const t1 = Date.now()
      const eps = await this.harness(hash, profile)
      tm.harness = Date.now() - t1
      const h = harnessFitness(eps, this.o.weights, rec.nKeys)
      rec = { ...rec, stage: 'harness', feasible: null, fitness: h.fitness, per: h.per, score: h.fitness, timingsMs: tm }
      if (hash === 'base') this.baseFit = h.fitness
    }
    if (hash === 'base' || rec.fitness! <= cut) {
      const t2 = Date.now()
      const all = await this.proxyBatch(hash, profile, proxyCases())
      for (const s of all) rec.proxy[s.id] = s.r
      const cs = constraintScore(all, this.base)
      rec = { ...rec, stage: 'full', feasible: cs.feasible, violation: cs.violation, failing: cs.failing, timingsMs: { ...rec.timingsMs, proxy: Date.now() - t2 } }
      rec.score = cs.feasible ? rec.fitness! : infeasibleScore(cs.violation, rec.fitness!, this.o.weights)
    }
    return this.record(rec)
  }

  private record(rec: CandRecord): CandRecord {
    this.cands.set(rec.hash, rec)
    appendCandidate(this.f.candidates, rec)
    this.evalsThisRun++
    this.save()
    this.progress()
    return rec
  }

  // ---- search ----
  private seedGenomes(): Genome[] {
    const gs: Genome[] = [emptyGenome(), ...this.o.seeds.map((s) => encodeProfile(s.profile))]
    const out: Genome[] = []
    const seen = new Set<string>()
    for (const g of gs) { const h = profileHash(decodeGenome(g)); if (!seen.has(h)) { seen.add(h); out.push(g) } }
    const nonBase = out.filter((g) => profileHash(decodeGenome(g)) !== 'base')
    let guard = 0
    while (out.length < this.o.popSize && nonBase.length && guard++ < 500) {
      const m = mutate(nonBase[Math.floor(this.rng.next() * nonBase.length)]!, this.rng, undefined, 2)
      const h = profileHash(decodeGenome(m))
      if (!seen.has(h)) { seen.add(h); out.push(m) }
    }
    return out.slice(0, Math.max(this.o.popSize, 1))
  }

  private rank(gs: Genome[]): { g: Genome; rec: CandRecord }[] {
    const seen = new Set<string>()
    const out: { g: Genome; rec: CandRecord }[] = []
    for (const g of gs) {
      const rec = this.cands.get(profileHash(decodeGenome(g)))
      if (!rec || seen.has(rec.hash)) continue
      seen.add(rec.hash)
      out.push({ g, rec })
    }
    return out.sort((a, b) => a.rec.score - b.rec.score || (a.rec.hash < b.rec.hash ? -1 : 1))
  }

  private makeOffspring(): Genome[] {
    const ranked = this.rank(this.cp.pop)
    const pick = () => {
      const a = ranked[Math.floor(this.rng.next() * ranked.length)]!
      const b = ranked[Math.floor(this.rng.next() * ranked.length)]!
      return (a.rec.score <= b.rec.score ? a : b).g
    }
    const kids: Genome[] = []
    const seen = new Set<string>()
    for (let n = 0; n < this.o.popSize; n++) {
      for (let tries = 0; tries < 40; tries++) {
        const p1 = pick()
        const child = this.rng.next() < this.o.crossP ? crossover(p1, pick(), this.rng) : p1
        const k = mutate(child, this.rng, undefined, 1 + tries / 10)
        const h = profileHash(decodeGenome(k))
        if (h === 'base' || this.cands.has(h) || seen.has(h)) continue
        seen.add(h)
        kids.push(k)
        break
      }
    }
    return kids
  }

  async run(): Promise<void> {
    const cp = this.cp
    this.log(`# out ${this.o.outDir}  pop ${this.o.popSize} elite ${this.o.eliteCount} gens ${cp.gen}/${this.o.gens}  train episodes/cand ${this.o.specs.length}`)
    if (!cp.initDone) {
      if (!cp.initPop.length) { cp.initPop = this.seedGenomes(); this.save() }
      // base first: it defines the baseline margins used for relative violation and the first elite cut
      const baseG = cp.initPop.find((g) => profileHash(decodeGenome(g)) === 'base') ?? emptyGenome()
      const b = await this.evaluate(baseG, 0, Infinity)
      this.base = b.proxy
      if (!b.feasible) this.log(`WARNING: base is not feasible (failing: ${b.failing.join(', ')})`)
      this.baseFit = b.fitness!
      cp.baseFitness = this.baseFit
      const cut = this.cut() * 1 // base fitness (no feasible elites yet)
      await Promise.all(cp.initPop.map((g) => this.evaluate(g, 0, cut)))
      cp.pop = this.rank(cp.initPop).slice(0, this.o.popSize).map((r) => r.g)
      cp.initDone = true
      cp.gen = 0
      this.log(this.genLine(0))
      this.endGen(0)
    } else {
      this.base = this.cands.get('base')!.proxy
    }
    while (cp.gen < this.o.gens && !this.stopped) {
      const gen = cp.gen + 1
      cp.offspring ??= this.makeOffspring()
      this.save()
      const cut = this.cut()
      await Promise.all(cp.offspring.map((g) => this.evaluate(g, gen, cut)))
      // promote earlier unverified population members that now beat the cut
      await Promise.all(cp.pop.map((g) => this.evaluate(g, gen, cut)))
      cp.pop = this.rank([...cp.pop, ...cp.offspring]).slice(0, this.o.popSize).map((r) => r.g)
      cp.offspring = null
      cp.gen = gen
      this.log(this.genLine(gen))
      this.endGen(gen)
    }
    this.writeBest()
    this.progress()
  }

  private endGen(gen: number): void {
    const all = [...this.cands.values()].filter((c) => c.gen === gen)
    this.cp.history.push({ gen, bestFeasible: this.bestFeasible()?.fitness ?? null, feasibleRate: all.length ? all.filter((c) => c.feasible === true).length / all.length : 0, evals: this.cands.size, wallS: this.wallS() })
    this.cp.wallSPrev = this.wallS()
    this.t0 = Date.now()
    this.save()
    this.writeBest()
  }

  bestFeasible(): CandRecord | null {
    let b: CandRecord | null = null
    for (const c of this.cands.values()) if (c.feasible === true && c.stage === 'full' && (!b || c.fitness! < b.fitness!)) b = c
    return b
  }
  private writeBest(): void {
    const top = [...this.cands.values()].filter((c) => c.feasible === true).sort((a, b) => a.fitness! - b.fitness!).slice(0, 10)
    writeJsonAtomic(this.f.best, { baseFitness: this.baseFit, best: top[0] ? { hash: top[0].hash, fitness: top[0].fitness, ...top[0].profile } : null, top: top.map((c) => ({ hash: c.hash, fitness: c.fitness, nKeys: c.nKeys, ...c.profile })) })
  }
  private genLine(gen: number): string {
    const b = this.bestFeasible()
    const all = [...this.cands.values()].filter((c) => c.gen === gen)
    return `gen ${gen}: ${all.length} new cands, feasible ${all.filter((c) => c.feasible === true).length}, unverified ${all.filter((c) => c.feasible === null).length}, infeasible ${all.filter((c) => c.feasible === false).length}; best feasible ${b ? b.fitness!.toFixed(2) + ' (' + b.hash + ', ' + b.nKeys + ' keys)' : '-'} vs base ${this.baseFit.toFixed(2)}; wall ${this.wallS().toFixed(0)} s`
  }
  progress(): void {
    const all = [...this.cands.values()]
    const done = all.filter((c) => c.stage !== 'sentinel-fail' || c.feasible === false)
    const gensDone = this.cp.history.filter((h) => h.gen > 0)
    const avgGen = gensDone.length > 1 ? (gensDone[gensDone.length - 1]!.wallS - gensDone[0]!.wallS) / (gensDone.length - 1) : gensDone[0]?.wallS ?? 0
    const b = this.bestFeasible()
    writeJsonAtomic(this.f.progress, {
      gen: this.cp.gen, targetGens: this.o.gens, inGen: this.cp.offspring ? this.cp.gen + 1 : null, candidates: all.length, evaluatedThisRun: this.evalsThisRun,
      baseFitness: this.baseFit, bestFeasible: b ? { hash: b.hash, fitness: b.fitness, nKeys: b.nKeys } : null,
      feasibleRate: done.length ? all.filter((c) => c.feasible === true).length / done.length : 0,
      sentinelFailRate: all.length ? all.filter((c) => c.stage === 'sentinel-fail').length / all.length : 0,
      wallS: this.wallS(), etaS: Math.max(0, this.o.gens - this.cp.gen) * avgGen, history: this.cp.history,
    })
  }
}
