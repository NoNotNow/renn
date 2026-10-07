/* App-side evaluation backend: Web Worker pool over the shipped source world (never evaluates on the main thread). */
import { AvEvolutionController, type EvalBackend } from './controller'
import { BrowserEpisodePool } from './pool'
import { getAvEvolutionStore } from '../agent/storeRegistry'

/** World holding the AV car (same default as the node CLI). */
export const AV_SOURCE_WORLD_ID = 'self_hunt_flexible'

export function defaultWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  return Math.max(1, Math.min(8, cores - 1))
}

export async function createWorkerBackend(o: { workers: number; exampleId?: string; stopOnReach?: boolean }): Promise<EvalBackend> {
  const pool = new BrowserEpisodePool({
    workers: o.workers,
    exampleId: o.exampleId ?? AV_SOURCE_WORLD_ID,
    baseUrl: import.meta.env.BASE_URL,
    stopOnReach: o.stopOnReach,
  })
  try {
    await pool.whenReady()
  } catch (e) {
    pool.close()
    throw e
  }
  return { evaluate: pool.evaluator(), stackVersion: pool.stackVersion, close: () => pool.close() }
}

let shared: AvEvolutionController | null = null

/** Singleton controller bound to the shared store (same one the agent API reads). */
export function getAvEvolutionController(): AvEvolutionController {
  return (shared ??= new AvEvolutionController({ store: getAvEvolutionStore(), createBackend: createWorkerBackend }))
}
