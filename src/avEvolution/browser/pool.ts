/* Web Worker pool implementing the engine's EvaluateFn: one episode per worker at a time, queue across workers. */
import type { EvaluateFn } from '../core/evolution'
import type { EpisodeMetrics } from '../core/fitness'
import type { Params } from '../core/genes'
import type { PoolWorkerLike, WorkerOutbound } from './workerProtocol'

export interface BrowserPoolOptions {
  workers: number
  exampleId: string
  baseUrl: string
  stopOnReach?: boolean
  /** Defaults to a Vite module worker (evalWorker.ts). */
  createWorker?: () => PoolWorkerLike
}

interface Pending {
  id: number
  params: Params
  key: string
  resolve: (m: EpisodeMetrics) => void
  reject: (e: Error) => void
}

export function defaultCreateWorker(): PoolWorkerLike {
  return new Worker(new URL('./evalWorker.ts', import.meta.url), { type: 'module' }) as unknown as PoolWorkerLike
}

export class BrowserEpisodePool {
  stackVersion = 'none'
  private workers: PoolWorkerLike[] = []
  private idle: PoolWorkerLike[] = []
  private queue: Pending[] = []
  private running = new Map<PoolWorkerLike, Pending>()
  private nextId = 1
  private closed = false
  private ready: Promise<void>

  constructor(opts: BrowserPoolOptions) {
    const make = opts.createWorker ?? defaultCreateWorker
    const boots: Promise<void>[] = []
    for (let i = 0; i < Math.max(1, opts.workers); i++) {
      const w = make()
      this.workers.push(w)
      boots.push(
        new Promise<void>((resolve, reject) => {
          w.onerror = (ev) => {
            const err = new Error(ev.message ?? 'worker error')
            const p = this.running.get(w)
            this.running.delete(w)
            if (p) p.reject(err)
            reject(err)
          }
          w.onmessage = (ev: { data: WorkerOutbound }) => {
            const m = ev.data
            if (m.type === 'ready') {
              this.stackVersion = m.stackVersion
              this.idle.push(w)
              resolve()
            } else if (m.type === 'initError') {
              reject(new Error(m.error))
            } else {
              const p = this.running.get(w)
              this.running.delete(w)
              this.idle.push(w)
              if (p && m.metrics && !m.error) p.resolve(m.metrics)
              else if (p) p.reject(new Error(m.error ?? 'no metrics'))
              this.pump()
            }
          }
          w.postMessage({ type: 'init', exampleId: opts.exampleId, baseUrl: opts.baseUrl, stopOnReach: opts.stopOnReach !== false })
        }),
      )
    }
    this.ready = Promise.all(boots).then(() => this.pump())
    this.ready.catch(() => {})
  }

  whenReady(): Promise<void> {
    return this.ready
  }

  private pump() {
    while (!this.closed && this.idle.length && this.queue.length) {
      const w = this.idle.shift()!
      const p = this.queue.shift()!
      this.running.set(w, p)
      w.postMessage({ type: 'job', id: p.id, params: p.params, key: p.key })
    }
  }

  episode(params: Params, key: string): Promise<EpisodeMetrics> {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('pool closed'))
      this.queue.push({ id: this.nextId++, params, key, resolve, reject })
      void this.ready.then(() => this.pump(), reject)
    })
  }

  evaluator(): EvaluateFn {
    return (params, keys) => Promise.all(keys.map((k) => this.episode(params, k)))
  }

  close(): void {
    this.closed = true
    for (const w of this.workers) w.terminate()
    const err = new Error('pool closed')
    for (const p of this.queue) p.reject(err)
    for (const p of this.running.values()) p.reject(err)
    this.queue = []
    this.running.clear()
  }
}
