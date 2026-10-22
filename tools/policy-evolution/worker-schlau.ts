/* worker_threads entry: runs one schlau episode at a time (determinism patches globals => strictly serial per worker). */
import { parentPort } from 'node:worker_threads'
import { initRapier } from '@/physics/rapierPhysics'
import { runSchlauEpisode } from '@/policyEvolution/schlauEpisode'

export interface SchlauWorkerJob { id: number; genome: number[]; key: string }

// Kein seconds/shaping im Job — runSchlauEpisode kennt seine Sekunden-Cap via schlauEpisodeSeconds(d0).
// the first job waits for the physics engine (initRapier is what every episode would await anyway)
let queue: Promise<void> = initRapier()

parentPort!.on('message', (job: SchlauWorkerJob) => {
  queue = queue.then(async () => {
    try {
      parentPort!.postMessage({ id: job.id, metrics: await runSchlauEpisode(job.genome, job.key) })
    } catch (e) {
      parentPort!.postMessage({ id: job.id, error: e instanceof Error ? (e.stack ?? e.message) : String(e) })
    }
  })
})
parentPort!.postMessage({ ready: true })
