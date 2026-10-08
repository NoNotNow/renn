/* worker_threads entry: one labyrinth episode at a time (determinism patches globals => serial per worker). */
import { parentPort, workerData } from 'node:worker_threads'
import { loadSourceWorld } from '../av-evolution/loadSource'
import { runEpisode, type EpOpts, type EpSpec } from './episode'

export interface Job { id: number; spec: EpSpec; opts: EpOpts }
const source = loadSourceWorld((workerData as { exampleId?: string } | undefined)?.exampleId)
let queue: Promise<void> = Promise.resolve()
parentPort!.on('message', (job: Job) => {
  queue = queue.then(async () => {
    try {
      parentPort!.postMessage({ id: job.id, result: await runEpisode(source, job.spec, job.opts) })
    } catch (e) {
      parentPort!.postMessage({ id: job.id, error: e instanceof Error ? (e.stack ?? e.message) : String(e) })
    }
  })
})
parentPort!.postMessage({ ready: true })
