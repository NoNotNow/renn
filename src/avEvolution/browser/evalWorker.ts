/// <reference lib="webworker" />
/* Web Worker entry: ONE evaluator per worker, episodes strictly serial (determinism patches global Math.random/Date.now). */
import { mazeEpisodeByKey, runMazeEpisode } from '@/avEvolution/eval/episode'
import { prepareSourceWorld } from '@/avEvolution/eval/evaluator'
import { avStackVersion } from '@/globalPipeline/avStackVersion'
import type { RennWorld } from '@/types/world'
import type { ShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'
import type { WorkerInbound, WorkerOutbound } from './workerProtocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let source: RennWorld | null = null
let stopOnReach = true
let chain: Promise<void> = Promise.resolve()

const post = (m: WorkerOutbound) => ctx.postMessage(m)
const errText = (e: unknown) => (e instanceof Error ? (e.stack ?? e.message) : String(e))

async function init(m: Extract<WorkerInbound, { type: 'init' }>) {
  try {
    stopOnReach = m.stopOnReach
    const base = m.baseUrl.endsWith('/') ? m.baseUrl : `${m.baseUrl}/`
    const [rawRes, bundleRes] = await Promise.all([
      fetch(`${base}exampleWorlds/${m.exampleId}/world.json`),
      fetch(`${base}global/shipped-global-behavior-library.json`),
    ])
    if (!rawRes.ok) throw new Error(`world fetch failed: ${rawRes.status}`)
    if (!bundleRes.ok) throw new Error(`global library fetch failed: ${bundleRes.status}`)
    source = prepareSourceWorld((await rawRes.json()) as RennWorld, (await bundleRes.json()) as ShippedGlobalBehaviorLibraryBundle)
    post({ type: 'ready', stackVersion: avStackVersion(source) })
  } catch (e) {
    post({ type: 'initError', error: errText(e) })
  }
}

ctx.onmessage = (ev: MessageEvent<WorkerInbound>) => {
  const m = ev.data
  if (m.type === 'init') {
    void init(m)
    return
  }
  chain = chain.then(async () => {
    try {
      if (!source) throw new Error('worker not initialised')
      const metrics = await runMazeEpisode(source, m.params, mazeEpisodeByKey(m.key), { stopOnReach })
      post({ type: 'result', id: m.id, metrics })
    } catch (e) {
      post({ type: 'result', id: m.id, error: errText(e) })
    }
  })
}
