/* Node-only worker_threads pool implementing the engine's EvaluateFn (one episode per worker at a time). */
import { Worker } from 'node:worker_threads'
import type { EvaluateFn } from '@/avEvolution/core/evolution'
import type { EpisodeMetrics } from '@/avEvolution/core/fitness'
import type { Params } from '@/avEvolution/core/genes'
import type { WorkerJob } from './worker'

export interface PoolOptions {
  workers: number
  exampleId?: string
  stopOnReach?: boolean
}

interface Pending {
  job: WorkerJob
  resolve: (m: EpisodeMetrics) => void
  reject: (e: Error) => void
}

export class EpisodePool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Pending[] = []
  private running = new Map<Worker, Pending>()
  private nextId = 1
  private ready: Promise<void>

  constructor(opts: PoolOptions) {
    const url = new URL('./worker-boot.mjs', import.meta.url)
    const boots: Promise<void>[] = []
    for (let i = 0; i < opts.workers; i++) {
      const w = new Worker(url, { workerData: { exampleId: opts.exampleId, stopOnReach: opts.stopOnReach } })
      this.workers.push(w)
      boots.push(
        new Promise<void>((resolve, reject) => {
          w.once('error', reject)
          w.on('message', (msg: { ready?: boolean; id?: number; metrics?: EpisodeMetrics; error?: string }) => {
            if (msg.ready) {
              this.idle.push(w)
              resolve()
              return
            }
            const p = this.running.get(w)
            this.running.delete(w)
            this.idle.push(w)
            if (p) (msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.metrics!))
            this.pump()
          })
        }),
      )
      w.on('error', (e) => {
        const p = this.running.get(w)
        this.running.delete(w)
        p?.reject(e)
      })
    }
    this.ready = Promise.all(boots).then(() => this.pump())
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!
      const p = this.queue.shift()!
      this.running.set(w, p)
      w.postMessage(p.job)
    }
  }

  episode(params: Params, key: string): Promise<EpisodeMetrics> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { id: this.nextId++, params, key }, resolve, reject })
      void this.ready.then(() => this.pump())
    })
  }

  /** Evaluate fn for the engine: a candidate's episodes are spread over idle workers. */
  evaluator(): EvaluateFn {
    return (params, keys) => Promise.all(keys.map((k) => this.episode(params, k)))
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()))
  }
}
