/**
 * Persistence for evolution runs.
 *
 * JSON export schema (`schema: 'renn.av-evolution/1'`):
 * {
 *   schema: 'renn.av-evolution/1',
 *   exportedAt: number (ms epoch),
 *   run: RunRecord,                 // incl. specVersion, stackVersion, fitness weights, config, spec, resumable engine state
 *   candidates: CandidateRecord[],  // params + per-episode records + aggregate (fitness lower = better)
 *   generations: GenerationRecord[] // per-generation stats
 * }
 * Bump the schema string on any breaking change; importJSON rejects unknown schemas.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { Candidate, EvolutionConfig, EvolutionState, GenerationStats } from './evolution'
import { aggregate, type EpisodeRecord, type FitnessWeights } from './fitness'
import type { GenomeSpec, Params } from './genes'

export const EXPORT_SCHEMA = 'renn.av-evolution/1'

export interface RunRecord {
  runId: string
  name?: string
  createdAt: number
  updatedAt: number
  specVersion: string
  stackVersion: string
  weights: FitnessWeights
  config: EvolutionConfig
  spec: GenomeSpec
  trainKeys: string[]
  /** latest resumable engine state */
  state?: EvolutionState
}

export interface CandidateRecord {
  runId: string
  id: string
  gen: number
  parents: string[]
  params: Params
  vec: number[]
  sigma: number
  episodes: EpisodeRecord[]
  fitness: number
  meanExitT: number
  reachRate: number
  meanContactEvents: number
  n: number
  specVersion: string
  stackVersion: string
  weights: FitnessWeights
  createdAt: number
  updatedAt: number
}

export interface GenerationRecord {
  runId: string
  gen: number
  stats: GenerationStats
  createdAt: number
}

export interface RunExport {
  schema: typeof EXPORT_SCHEMA
  exportedAt: number
  run: RunRecord
  candidates: CandidateRecord[]
  generations: GenerationRecord[]
}

export interface EvolutionStore {
  saveRun(run: RunRecord): Promise<void>
  loadRun(runId: string): Promise<RunRecord | undefined>
  listRuns(): Promise<RunRecord[]>
  /** upsert (running-mean fitness changes as candidates get more episodes) */
  saveCandidates(run: Pick<RunRecord, 'runId' | 'specVersion' | 'stackVersion' | 'weights'>, cands: Candidate[]): Promise<void>
  /** lowest-fitness first; `'all'` spans every run */
  topCandidates(runId: string | 'all', n: number, minEpisodes?: number): Promise<CandidateRecord[]>
  saveGeneration(rec: GenerationRecord): Promise<void>
  listGenerations(runId: string): Promise<GenerationRecord[]>
  exportJSON(runId: string): Promise<RunExport>
  /** returns the imported runId (suffixed if it already exists) */
  importJSON(data: RunExport): Promise<string>
}

/** IDB keys cannot be NaN; Infinity is valid but we keep it finite for sorting. */
const keyFit = (f: number) => (Number.isFinite(f) ? f : 1e12)

export function toCandidateRecord(
  run: Pick<RunRecord, 'runId' | 'specVersion' | 'stackVersion' | 'weights'>,
  c: Candidate,
  now: number,
  createdAt?: number,
): CandidateRecord {
  const a = aggregate(c.episodes, run.weights)
  return {
    runId: run.runId,
    id: c.id,
    gen: c.gen,
    parents: c.parents,
    params: c.params,
    vec: c.vec,
    sigma: c.sigma,
    episodes: c.episodes,
    fitness: keyFit(a.fitness),
    meanExitT: Number.isFinite(a.meanExitT) ? a.meanExitT : 0,
    reachRate: a.reachRate,
    meanContactEvents: a.meanContactEvents,
    n: a.n,
    specVersion: run.specVersion,
    stackVersion: run.stackVersion,
    weights: run.weights,
    createdAt: createdAt ?? now,
    updatedAt: now,
  }
}

function checkImport(data: RunExport) {
  if (!data || data.schema !== EXPORT_SCHEMA) throw new Error(`unsupported export schema: ${String(data?.schema)}`)
}

function remap(data: RunExport, existing: boolean): RunExport {
  if (!existing) return data
  const runId = `${data.run.runId}-imp${Date.now().toString(36)}`
  return {
    ...data,
    run: { ...data.run, runId },
    candidates: data.candidates.map((c) => ({ ...c, runId })),
    generations: data.generations.map((g) => ({ ...g, runId })),
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

export class MemoryEvolutionStore implements EvolutionStore {
  private runs = new Map<string, RunRecord>()
  private cands = new Map<string, CandidateRecord>()
  private gens = new Map<string, GenerationRecord>()
  constructor(private now: () => number = Date.now) {}

  async saveRun(run: RunRecord) {
    this.runs.set(run.runId, clone(run))
  }
  async loadRun(runId: string) {
    const r = this.runs.get(runId)
    return r && clone(r)
  }
  async listRuns() {
    return [...this.runs.values()].map(clone).sort((a, b) => a.createdAt - b.createdAt)
  }
  async saveCandidates(run: Pick<RunRecord, 'runId' | 'specVersion' | 'stackVersion' | 'weights'>, cands: Candidate[]) {
    const t = this.now()
    for (const c of cands) {
      const k = `${run.runId}/${c.id}`
      this.cands.set(k, clone(toCandidateRecord(run, c, t, this.cands.get(k)?.createdAt)))
    }
  }
  async topCandidates(runId: string | 'all', n: number, minEpisodes = 1) {
    return [...this.cands.values()]
      .filter((c) => (runId === 'all' || c.runId === runId) && c.n >= minEpisodes)
      .sort((a, b) => a.fitness - b.fitness)
      .slice(0, n)
      .map(clone)
  }
  async saveGeneration(rec: GenerationRecord) {
    this.gens.set(`${rec.runId}/${rec.gen}`, clone(rec))
  }
  async listGenerations(runId: string) {
    return [...this.gens.values()].filter((g) => g.runId === runId).sort((a, b) => a.gen - b.gen).map(clone)
  }
  async exportJSON(runId: string): Promise<RunExport> {
    const run = await this.loadRun(runId)
    if (!run) throw new Error(`unknown run ${runId}`)
    return {
      schema: EXPORT_SCHEMA,
      exportedAt: this.now(),
      run,
      candidates: [...this.cands.values()].filter((c) => c.runId === runId).map(clone),
      generations: await this.listGenerations(runId),
    }
  }
  async importJSON(data: RunExport) {
    checkImport(data)
    const d = remap(clone(data), this.runs.has(data.run.runId))
    this.runs.set(d.run.runId, d.run)
    for (const c of d.candidates) this.cands.set(`${c.runId}/${c.id}`, c)
    for (const g of d.generations) this.gens.set(`${g.runId}/${g.gen}`, g)
    return d.run.runId
  }
}

export const IDB_UNAVAILABLE_MESSAGE = 'IndexedDB unavailable: AV evolution runs cannot be stored in this environment'
export const IDB_NAME = 'renn-av-evolution'

export class IdbEvolutionStore implements EvolutionStore {
  private _dbp: Promise<IDBPDatabase> | null = null
  constructor(
    private now: () => number = Date.now,
    private dbName: string = IDB_NAME,
  ) {}
  /** Opened lazily on first use, so constructing the store never touches IndexedDB (jsdom / SSR / blocked storage). */
  private get dbp(): Promise<IDBPDatabase> {
    if (this._dbp) return this._dbp
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error(IDB_UNAVAILABLE_MESSAGE))
    return (this._dbp = openDB(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('runs', { keyPath: 'runId' })
        const c = db.createObjectStore('candidates', { keyPath: ['runId', 'id'] })
        c.createIndex('byRun', 'runId')
        c.createIndex('byFitness', 'fitness')
        const g = db.createObjectStore('generations', { keyPath: ['runId', 'gen'] })
        g.createIndex('byRun', 'runId')
      },
    }))
  }
  async close() {
    if (this._dbp) (await this._dbp).close()
  }
  async saveRun(run: RunRecord) {
    await (await this.dbp).put('runs', clone(run))
  }
  async loadRun(runId: string) {
    return (await this.dbp).get('runs', runId) as Promise<RunRecord | undefined>
  }
  async listRuns() {
    const all = (await (await this.dbp).getAll('runs')) as RunRecord[]
    return all.sort((a, b) => a.createdAt - b.createdAt)
  }
  async saveCandidates(run: Pick<RunRecord, 'runId' | 'specVersion' | 'stackVersion' | 'weights'>, cands: Candidate[]) {
    const db = await this.dbp
    const tx = db.transaction('candidates', 'readwrite')
    const t = this.now()
    for (const c of cands) {
      const prev = (await tx.store.get([run.runId, c.id])) as CandidateRecord | undefined
      await tx.store.put(clone(toCandidateRecord(run, c, t, prev?.createdAt)))
    }
    await tx.done
  }
  async topCandidates(runId: string | 'all', n: number, minEpisodes = 1) {
    const db = await this.dbp
    const all: CandidateRecord[] =
      runId === 'all' ? await db.getAllFromIndex('candidates', 'byFitness') : await db.getAllFromIndex('candidates', 'byRun', runId)
    return all
      .filter((c) => c.n >= minEpisodes)
      .sort((a, b) => a.fitness - b.fitness)
      .slice(0, n)
  }
  async saveGeneration(rec: GenerationRecord) {
    await (await this.dbp).put('generations', clone(rec))
  }
  async listGenerations(runId: string) {
    const all = (await (await this.dbp).getAllFromIndex('generations', 'byRun', runId)) as GenerationRecord[]
    return all.sort((a, b) => a.gen - b.gen)
  }
  async exportJSON(runId: string): Promise<RunExport> {
    const run = await this.loadRun(runId)
    if (!run) throw new Error(`unknown run ${runId}`)
    const db = await this.dbp
    return {
      schema: EXPORT_SCHEMA,
      exportedAt: this.now(),
      run,
      candidates: (await db.getAllFromIndex('candidates', 'byRun', runId)) as CandidateRecord[],
      generations: await this.listGenerations(runId),
    }
  }
  async importJSON(data: RunExport) {
    checkImport(data)
    const d = remap(clone(data), !!(await this.loadRun(data.run.runId)))
    const db = await this.dbp
    const tx = db.transaction(['runs', 'candidates', 'generations'], 'readwrite')
    await tx.objectStore('runs').put(d.run)
    for (const c of d.candidates) await tx.objectStore('candidates').put(c)
    for (const g of d.generations) await tx.objectStore('generations').put(g)
    await tx.done
    return d.run.runId
  }
}
