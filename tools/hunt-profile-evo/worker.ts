/* worker_threads entry: harness episodes AND proxy cases, strictly one sim at a time per thread (determinism patches globals). */
import { parentPort } from 'node:worker_threads'
import { MAZE_CASES } from '@/test/fixtures/avMazeCases'
import { loadSourceWorld } from '../av-evolution/loadSource'
import { runEpisode } from '../hunt-maze/episode'
import { runEvasionCase, runMazeCase } from './probe/proxy'
import { KR_CASES, runKeepRightCase } from './probe/proxy-kr'
import type { Task } from './tasks'

const sources = new Map<string, ReturnType<typeof loadSourceWorld>>()
const sourceOf = (id?: string) => {
  const k = id ?? ''
  if (!sources.has(k)) sources.set(k, loadSourceWorld(id))
  return sources.get(k)!
}

async function runTask(t: Task): Promise<unknown> {
  if (t.t === 'ep') return runEpisode(sourceOf(t.world), t.spec, { params: t.params, applyTo: 'av', seconds: t.seconds })
  const mz = MAZE_CASES.find((c) => c.name === t.name)
  if (mz) return runMazeCase(mz, t.extra, t.budget === 'none' ? 'full' : t.budget)
  if (KR_CASES.includes(t.name)) return runKeepRightCase(t.name, t.extra)
  return runEvasionCase(t.name, t.extra, t.budget === 'none' ? 'full' : t.budget)
}

let queue: Promise<void> = Promise.resolve()
parentPort!.on('message', (job: { id: number; task: Task }) => {
  queue = queue.then(async () => {
    const t0 = performance.now()
    try {
      parentPort!.postMessage({ id: job.id, result: await runTask(job.task), ms: performance.now() - t0 })
    } catch (e) {
      parentPort!.postMessage({ id: job.id, error: e instanceof Error ? (e.stack ?? e.message) : String(e) })
    }
  })
})
parentPort!.postMessage({ ready: true })
