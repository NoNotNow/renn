import type { EpisodeMetrics } from '../core/fitness'
import type { Params } from '../core/genes'

export type WorkerInbound =
  | { type: 'init'; exampleId: string; baseUrl: string; stopOnReach: boolean }
  | { type: 'job'; id: number; params: Params; key: string }

export type WorkerOutbound =
  | { type: 'ready'; stackVersion: string }
  | { type: 'initError'; error: string }
  | { type: 'result'; id: number; metrics?: EpisodeMetrics; error?: string }

/** Minimal Worker surface the pool needs (lets tests inject fakes). */
export interface PoolWorkerLike {
  postMessage(m: WorkerInbound): void
  terminate(): void
  onmessage: ((ev: { data: WorkerOutbound }) => void) | null
  onerror: ((ev: { message?: string }) => void) | null
}
