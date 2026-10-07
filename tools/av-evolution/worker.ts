/* worker_threads entry: evaluates one maze episode at a time (determinism patches globals => strictly serial per worker). */
import { parentPort, workerData } from 'node:worker_threads'
import { mazeEpisodeByKey, runMazeEpisode } from '@/avEvolution/eval/episode'
import type { Params } from '@/avEvolution/core/genes'
import { loadSourceWorld } from './loadSource'

export interface WorkerJob {
  id: number
  params: Params
  key: string
}

const opts = (workerData ?? {}) as { exampleId?: string; stopOnReach?: boolean }
const source = loadSourceWorld(opts.exampleId)
let queue: Promise<void> = Promise.resolve()

parentPort!.on('message', (job: WorkerJob) => {
  queue = queue.then(async () => {
    try {
      const metrics = await runMazeEpisode(source, job.params, mazeEpisodeByKey(job.key), { stopOnReach: opts.stopOnReach })
      parentPort!.postMessage({ id: job.id, metrics })
    } catch (e) {
      parentPort!.postMessage({ id: job.id, error: e instanceof Error ? (e.stack ?? e.message) : String(e) })
    }
  })
})
parentPort!.postMessage({ ready: true })
