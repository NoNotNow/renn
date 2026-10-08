/** worker_threads pool (<= 5 threads) with a persistent per-task result cache (append-only jsonl) and in-flight de-duplication. */
import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import type { Task } from './tasks'

export const MAX_WORKERS = 5

interface Pending { task: Task; resolve: (r: unknown) => void; reject: (e: Error) => void }

export class TaskPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Pending[] = []
  private running = new Map<Worker, { p: Pending; id: number }>()
  private inflight = new Map<string, Promise<unknown>>()
  private nextId = 1
  private ready: Promise<void>
  readonly cache = new Map<string, unknown>()
  stats = { computed: 0, cached: 0, computeMs: 0 }
  private journal: number | null = null

  constructor(workers: number, cacheFile?: string) {
    const n = Math.max(1, Math.min(MAX_WORKERS, workers))
    if (cacheFile) {
      if (fs.existsSync(cacheFile)) {
        for (const line of fs.readFileSync(cacheFile, 'utf8').split('\n')) {
          if (!line.trim()) continue
          try { const o = JSON.parse(line) as { k: string; r: unknown }; this.cache.set(o.k, o.r) } catch { /* torn last line after a kill: ignore */ }
        }
      }
      this.journal = fs.openSync(cacheFile, 'a')
    }
    const url = new URL('./worker-boot.mjs', import.meta.url)
    const boots: Promise<void>[] = []
    for (let i = 0; i < n; i++) {
      const w = new Worker(url, { workerData: {} })
      this.workers.push(w)
      boots.push(new Promise<void>((resolve, reject) => {
        w.once('error', reject)
        w.on('message', (m: { ready?: boolean; id?: number; result?: unknown; error?: string; ms?: number }) => {
          if (m.ready) { this.idle.push(w); resolve(); return }
          const cur = this.running.get(w)
          this.running.delete(w)
          this.idle.push(w)
          if (cur) {
            if (m.error) cur.p.reject(new Error(`${cur.p.task.id}: ${m.error}`))
            else { this.stats.computeMs += m.ms ?? 0; cur.p.resolve(m.result) }
          }
          this.pump()
        })
      }))
      w.on('error', (e) => { const c = this.running.get(w); this.running.delete(w); c?.p.reject(e) })
    }
    this.ready = Promise.all(boots).then(() => this.pump())
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!
      const p = this.queue.shift()!
      const id = this.nextId++
      this.running.set(w, { p, id })
      w.postMessage({ id, task: p.task })
    }
  }

  /** Result of a task: from the cache if finished before (also across restarts), else computed once in a worker. */
  run<T>(task: Task): Promise<T> {
    if (this.cache.has(task.id)) { this.stats.cached++; return Promise.resolve(this.cache.get(task.id) as T) }
    const fl = this.inflight.get(task.id)
    if (fl) return fl as Promise<T>
    const pr = new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve: resolve as (r: unknown) => void, reject })
      void this.ready.then(() => this.pump())
    }).then((r) => {
      this.cache.set(task.id, r)
      this.stats.computed++
      if (this.journal !== null) fs.writeSync(this.journal, JSON.stringify({ k: task.id, r }) + '\n')
      this.inflight.delete(task.id)
      return r
    }, (e) => { this.inflight.delete(task.id); throw e })
    this.inflight.set(task.id, pr)
    return pr
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()))
    if (this.journal !== null) { fs.closeSync(this.journal); this.journal = null }
  }
}
