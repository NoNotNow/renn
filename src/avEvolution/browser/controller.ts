/**
 * Run controller for in-browser AV evolution: owns the EvolutionEngine, drives generations unattended against an injected
 * evaluation backend (Web Worker pool in the app, fakes in tests), and persists after every generation to an EvolutionStore
 * so a new controller over the same store can resume the run.
 */
import { DEFAULT_EVOLUTION_CONFIG, EvolutionEngine, type EvolutionConfig, type EvaluateFn, type GenerationStats } from '../core/evolution'
import type { EvolutionStore, RunRecord } from '../core/store'
import { AV_GENOME_SPEC } from '../genes'
import { listMazeEpisodes } from '../maze/episodes'

export interface EvalBackend {
  evaluate: EvaluateFn
  stackVersion: string
  close(): void | Promise<void>
}

export interface NewRunOptions {
  name?: string
  popSize?: number
  eliteCount?: number
  episodesPerEval?: number
  seed?: number
  trainKeys?: string[]
}

export type StartOptions = ({ runId: string } | { newRun: NewRunOptions }) & {
  workers: number
  /** stop automatically after this many generations in this session (default: until stop()) */
  maxGenerations?: number
}

export type ControllerStatus = 'idle' | 'starting' | 'running' | 'stopping'

export interface ControllerState {
  status: ControllerStatus
  runId: string | null
  gen: number
  evals: number
  last: GenerationStats | null
  /** episodes/s of the latest completed generation */
  evalsPerSec: number
  error: string | null
  /** bumped after every persisted generation so views can refresh from the store */
  persistedTick: number
}

export interface ControllerDeps {
  store: EvolutionStore
  createBackend: (o: { workers: number }) => Promise<EvalBackend>
  stackVersionFallback?: string
}

const initial = (): ControllerState => ({ status: 'idle', runId: null, gen: -1, evals: 0, last: null, evalsPerSec: 0, error: null, persistedTick: 0 })

export class AvEvolutionController {
  private state: ControllerState = initial()
  private listeners = new Set<() => void>()
  private stopFlag = false
  private loop: Promise<void> | null = null

  constructor(private deps: ControllerDeps) {}

  getState(): ControllerState {
    return this.state
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  /** Begin (or resume) a run. Resolves once the run loop is started; use whenIdle() to await its end. */
  async start(opts: StartOptions): Promise<string> {
    if (this.state.status !== 'idle') throw new Error(`controller is ${this.state.status}`)
    this.stopFlag = false
    this.set({ ...initial(), status: 'starting', persistedTick: this.state.persistedTick })
    let backend: EvalBackend | null = null
    try {
      backend = await this.deps.createBackend({ workers: Math.max(1, Math.floor(opts.workers)) })
      const { engine, run } = await this.prepareRun(opts, backend.stackVersion)
      this.set({ status: 'running', runId: run.runId, gen: engine.gen, evals: engine.evals })
      this.loop = this.runLoop(engine, run, backend, Math.max(1, Math.floor(opts.workers)), opts.maxGenerations)
      return run.runId
    } catch (e) {
      await backend?.close()
      this.set({ status: 'idle', error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }

  private async prepareRun(opts: StartOptions, stackVersion: string): Promise<{ engine: EvolutionEngine; run: RunRecord }> {
    const { store } = this.deps
    if ('runId' in opts) {
      const run = await store.loadRun(opts.runId)
      if (!run) throw new Error(`unknown run ${opts.runId}`)
      if (!run.state) throw new Error(`run ${opts.runId} has no resumable engine state`)
      if (run.specVersion !== AV_GENOME_SPEC.specVersion)
        throw new Error(`run ${opts.runId} was created with gene spec v${run.specVersion}; the current spec is v${AV_GENOME_SPEC.specVersion}. Start a new run (resuming would change the gene set).`)
      return { engine: EvolutionEngine.fromJSON(run.state), run }
    }
    const n = opts.newRun
    const train = n.trainKeys?.length ? n.trainKeys : listMazeEpisodes().train.map((e) => e.key)
    const popSize = Math.max(2, Math.floor(n.popSize ?? DEFAULT_EVOLUTION_CONFIG.popSize))
    const config: Partial<EvolutionConfig> = {
      seed: n.seed ?? Date.now() % 100000,
      popSize,
      eliteCount: Math.min(Math.max(1, Math.floor(n.eliteCount ?? DEFAULT_EVOLUTION_CONFIG.eliteCount)), popSize),
      episodesPerEval: Math.max(1, Math.floor(n.episodesPerEval ?? DEFAULT_EVOLUTION_CONFIG.episodesPerEval)),
    }
    const engine = new EvolutionEngine({ spec: AV_GENOME_SPEC, trainKeys: train, config })
    const now = Date.now()
    const run: RunRecord = {
      runId: `run-${now.toString(36)}`,
      name: n.name,
      createdAt: now,
      updatedAt: now,
      specVersion: AV_GENOME_SPEC.specVersion,
      stackVersion: stackVersion || this.deps.stackVersionFallback || 'none',
      weights: engine.weights,
      config: engine.config,
      spec: AV_GENOME_SPEC,
      trainKeys: engine.trainKeys,
    }
    await store.saveRun(run)
    return { engine, run }
  }

  private async runLoop(engine: EvolutionEngine, run0: RunRecord, backend: EvalBackend, workers: number, maxGens?: number) {
    const { store } = this.deps
    let run = run0
    let done = 0
    try {
      while (!this.stopFlag && (maxGens === undefined || done < maxGens)) {
        const st = await engine.step(backend.evaluate, { concurrency: workers * 2, shouldStop: () => this.stopFlag })
        if (st.aborted || this.stopFlag) break
        await store.saveCandidates(run, [...engine.getPopulation(), ...engine.getHallOfFame()])
        await store.saveGeneration({ runId: run.runId, gen: st.gen, stats: st, createdAt: Date.now() })
        run = { ...run, updatedAt: Date.now(), state: engine.toJSON() }
        await store.saveRun(run)
        done++
        this.set({
          gen: st.gen,
          evals: engine.evals,
          last: st,
          evalsPerSec: st.wallMs > 0 ? st.evals / (st.wallMs / 1000) : 0,
          persistedTick: this.state.persistedTick + 1,
        })
      }
    } catch (e) {
      if (!this.stopFlag) this.set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      this.set({ status: 'stopping' })
      try {
        await backend.close()
      } finally {
        this.loop = null
        this.set({ status: 'idle' })
      }
    }
  }

  /** Request stop; the in-flight generation is discarded (state stays at the last persisted generation). */
  async stop(): Promise<void> {
    this.stopFlag = true
    if (this.state.status === 'running') this.set({ status: 'stopping' })
    await this.whenIdle()
  }

  async whenIdle(): Promise<void> {
    while (this.loop) await this.loop
  }
}
