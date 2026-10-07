import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { EpisodeMetrics } from '../core/fitness'
import { AV_GENOME_SPEC } from '../genes'
import { IdbEvolutionStore } from '../core/store'
import { AvEvolutionController, type EvalBackend } from './controller'

const fakeMetrics = (key: string, params: Record<string, number>): EpisodeMetrics => {
  const s = Object.values(params).reduce((a, v) => a + Math.abs(Number(v) || 0), 0)
  return {
    key,
    reached: true,
    exitT: 10 + (s % 7),
    timeoutSec: 60,
    remainingDist: 0,
    contactEvents: 0,
    contactFrames: 0,
    dt: 1 / 60,
    minStaticGap: 1,
    flipped: false,
    stalledSec: 0,
    wallMs: 1,
  }
}

const backendFactory = () => async (): Promise<EvalBackend> => ({
  evaluate: async (params, keys) => {
    await new Promise((r) => setTimeout(r, 1))
    return keys.map((k) => fakeMetrics(k, params as Record<string, number>))
  },
  stackVersion: 'fake-stack',
  close: () => {},
})

const waitFor = async (cond: () => boolean, ms = 15000) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('AvEvolutionController', () => {
  it('runs generations unattended, stops, and a new controller resumes the same run from IndexedDB', async () => {
    const dbName = `test-av-${Math.random()}`
    const store1 = new IdbEvolutionStore(Date.now, dbName)
    const c1 = new AvEvolutionController({ store: store1, createBackend: backendFactory() })
    const runId = await c1.start({ newRun: { popSize: 4, eliteCount: 2, episodesPerEval: 1, seed: 3 }, workers: 2 })
    await waitFor(() => c1.getState().gen >= 2)
    await c1.stop()
    expect(c1.getState().status).toBe('idle')
    const gen1 = c1.getState().gen
    expect(gen1).toBeGreaterThanOrEqual(2)

    const run = (await store1.loadRun(runId))!
    expect(run.state).toBeTruthy()
    const savedGen = run.state!.gen
    const hofBefore = (await store1.topCandidates(runId, 50)).map((c) => c.id)
    expect(hofBefore.length).toBeGreaterThan(0)
    expect((await store1.listGenerations(runId)).length).toBeGreaterThanOrEqual(3)
    await store1.close()

    const store2 = new IdbEvolutionStore(Date.now, dbName)
    const c2 = new AvEvolutionController({ store: store2, createBackend: backendFactory() })
    const hofAfter = (await store2.topCandidates(runId, 50)).map((c) => c.id)
    expect(hofAfter).toEqual(hofBefore)
    await c2.start({ runId, workers: 2, maxGenerations: 1 })
    expect(c2.getState().gen).toBe(savedGen)
    await c2.whenIdle()
    expect(c2.getState().gen).toBe(savedGen + 1)
    expect(c2.getState().status).toBe('idle')
    const run2 = (await store2.loadRun(runId))!
    expect(run2.state!.gen).toBe(savedGen + 1)
    expect(run2.state!.evals).toBeGreaterThan(run.state!.evals)
    await store2.close()
  })

  it('surfaces backend failures as an error and returns to idle', async () => {
    const store = new IdbEvolutionStore(Date.now, `test-av-${Math.random()}`)
    const c = new AvEvolutionController({ store, createBackend: async () => Promise.reject(new Error('boom')) })
    await expect(c.start({ newRun: { popSize: 4 }, workers: 1 })).rejects.toThrow('boom')
    expect(c.getState().status).toBe('idle')
    expect(c.getState().error).toBe('boom')
    await store.close()
  })

  it('refuses to resume a run saved under an older gene spec version (v2 -> v4) and leaves it untouched', async () => {
    const store = new IdbEvolutionStore(Date.now, `test-av-${Math.random()}`)
    const c1 = new AvEvolutionController({ store, createBackend: backendFactory() })
    const runId = await c1.start({ newRun: { popSize: 4, eliteCount: 2, episodesPerEval: 1, seed: 3 }, workers: 1, maxGenerations: 1 })
    await c1.whenIdle()
    const run = (await store.loadRun(runId))!
    expect(run.specVersion).toBe(AV_GENOME_SPEC.specVersion)
    await store.saveRun({ ...run, specVersion: '2' })
    const c2 = new AvEvolutionController({ store, createBackend: backendFactory() })
    await expect(c2.start({ runId, workers: 1, maxGenerations: 1 })).rejects.toThrow(/gene spec v2.*current spec is v4/)
    expect(c2.getState().status).toBe('idle')
    expect((await store.loadRun(runId))!.state!.gen).toBe(run.state!.gen)
    await store.close()
  })
})
