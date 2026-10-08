/* worker_threads entry: runs one policy episode at a time (determinism patches globals => strictly serial per worker). */
import { parentPort } from 'node:worker_threads'
import { runPolicyEpisode } from '@/policyEvolution/episode'

export interface WorkerJob {
  id: number
  genome: number[]
  key: string
  seconds?: number
}

let queue: Promise<void> = Promise.resolve()

parentPort!.on('message', (job: WorkerJob) => {
  queue = queue.then(async () => {
    try {
      parentPort!.postMessage({ id: job.id, metrics: await runPolicyEpisode(job.genome, job.key, { seconds: job.seconds }) })
    } catch (e) {
      parentPort!.postMessage({ id: job.id, error: e instanceof Error ? (e.stack ?? e.message) : String(e) })
    }
  })
})
parentPort!.postMessage({ ready: true })
