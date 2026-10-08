/* Node-only worker_threads pool: one episode per worker at a time, jobs queue up. */
import { Worker } from 'node:worker_threads'
import type { PolicyEpisodeMetrics } from '@/policyEvolution/episode'
import type { EvaluateGenome } from '@/policyEvolution/es'
import type { WorkerJob } from './worker'

interface Pending {
  job: WorkerJob
  resolve: (m: PolicyEpisodeMetrics) => void
  reject: (e: Error) => void
}

export class PolicyPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Pending[] = []
  private running = new Map<Worker, Pending>()
  private nextId = 1
  private ready: Promise<void>

  constructor(n: number, private readonly seconds?: number) {
    const url = new URL('./worker-boot.mjs', import.meta.url)
    const boots: Promise<void>[] = []
    for (let i = 0; i < n; i++) {
      const w = new Worker(url)
      this.workers.push(w)
      boots.push(
        new Promise<void>((resolve, reject) => {
          w.once('error', reject)
          w.on('message', (msg: { ready?: boolean; metrics?: PolicyEpisodeMetrics; error?: string }) => {
            if (msg.ready) {
              this.idle.push(w)
              resolve()
              return
            }
            const p = this.running.get(w)
            this.running.delete(w)
            this.idle.push(w)
            if (p) {
              if (msg.error) p.reject(new Error(msg.error))
              else p.resolve(msg.metrics!)
            }
            this.pump()
          })
        }),
      )
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

  episode(genome: number[], key: string): Promise<PolicyEpisodeMetrics> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { id: this.nextId++, genome, key, seconds: this.seconds }, resolve, reject })
      void this.ready.then(() => this.pump())
    })
  }

  evaluator(): EvaluateGenome {
    return (genome, keys) => Promise.all(keys.map((k) => this.episode(genome, k)))
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()))
  }
}
