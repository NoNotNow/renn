/* worker_threads entry: runs one policy episode at a time (determinism patches globals => strictly serial per worker). */
import { parentPort } from 'node:worker_threads'
import { initRapier } from '@/physics/rapierPhysics'
import { runPolicyEpisode } from '@/policyEvolution/episode'

export interface WorkerJob {
  id: number
  genome: number[]
  key: string
  seconds?: number
}

// the first job waits for the physics engine: crux chain lookups run the SYNC pursuit gate before the episode starts,
// which needs a warm engine (initRapier is what every episode would await anyway)
let queue: Promise<void> = initRapier()

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
