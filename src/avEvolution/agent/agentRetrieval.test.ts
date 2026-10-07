import 'fake-indexeddb/auto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLogicVerificationBrowserAttachHandler } from '@/agent/logicVerificationBrowserAttachHandler'
import { registerAgentBuilderAuthoring, type AgentBuilderAuthoringActions } from '@/agent/agentBuilderAuthoringRegistry'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import type { Candidate } from '../core/evolution'
import { DEFAULT_FITNESS_WEIGHTS } from '../core/fitness'
import { IdbEvolutionStore, type RunRecord } from '../core/store'
import { buildApplyPatch } from './readApi'
import { setAvEvolutionStore } from './storeRegistry'

const run: RunRecord = {
  runId: 'r1',
  name: 'run one',
  createdAt: 1,
  updatedAt: 1,
  specVersion: 's1',
  stackVersion: 'v1',
  weights: DEFAULT_FITNESS_WEIGHTS,
  config: {} as RunRecord['config'],
  spec: {} as RunRecord['spec'],
  trainKeys: [],
}

const cand = (id: string, score: number, params: Record<string, unknown>): Candidate => ({
  id,
  gen: 0,
  parents: [],
  vec: [0],
  sigma: 0.1,
  params: params as Candidate['params'],
  episodes: [{ key: 'e', score, reached: true, exitT: score, contactEvents: 0 }],
})

async function seed() {
  const store = new IdbEvolutionStore(Date.now, `t-${Math.random()}`)
  await store.saveRun(run)
  await store.saveCandidates(run, [
    cand('a', 30, { k: { x: 1 } }),
    cand('b', 10, { k: { x: 2 } }),
    cand('c', 20, { k: { x: 3 } }),
  ])
  setAvEvolutionStore(store)
  return store
}

afterEach(() => {
  setAvEvolutionStore(null)
  registerAgentBuilderAuthoring(null)
})

describe('av_evolution browser RPC', () => {
  it('lists runs and returns elites sorted by fitness', async () => {
    await seed()
    const h = createLogicVerificationBrowserAttachHandler()
    const runs = (await h.dispatchRpc('av_evolution_list', {})) as { runId: string; bestFitness: number }[]
    expect(runs.map((r) => r.runId)).toEqual(['r1'])
    expect(runs[0].bestFitness).toBe(10)
    const best = (await h.dispatchRpc('av_evolution_best', { runId: 'r1', topN: 2 })) as { id: string }[]
    expect(best.map((b) => b.id)).toEqual(['b', 'c'])
  })

  it('apply builds an entityPipeStack patch and routes it through apply_world_patch', async () => {
    await seed()
    const seen: unknown[] = []
    registerAgentBuilderAuthoring({
      applyLogicVerificationWorldPatchToDocument: (patch: unknown) => {
        seen.push(patch)
        return { ok: true, affectedEntityIds: ['car'] }
      },
    } as unknown as AgentBuilderAuthoringActions)
    const h = createLogicVerificationBrowserAttachHandler()
    const out = (await h.dispatchRpc('av_evolution_apply', {
      runId: 'r1',
      candidateId: 'b',
      entityId: 'car',
      pipeId: 'p',
    })) as { patch: unknown }
    const expected = { entityPipeStack: [{ entityId: 'car', pipeId: 'p', stackIndex: 0, mergeBindingParams: { k: { x: 2 } } }] }
    expect(out.patch).toEqual(expected)
    expect(seen).toEqual([expected])
  })

  it('buildApplyPatch requires entityId', () => {
    expect(() => buildApplyPatch({ params: {} }, {} as never)).toThrow(/entityId/)
  })
})

describe('headless disk fallback', () => {
  it('McpSession without browser reads exports from disk', async () => {
    const store = await seed()
    const exp = await store.exportJSON('r1')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'av-evo-'))
    try {
      await writeFile(path.join(dir, 'r1.json'), JSON.stringify(exp))
      await writeFile(path.join(dir, 'junk.json'), '{"schema":"other"}')
      const s = new LogicVerificationMcpSession()
      const best = (await s.avEvolutionBest({ topN: 2, exportDir: dir })) as { id: string }[]
      expect(best.map((b) => b.id)).toEqual(['b', 'c'])
      const runs = (await s.avEvolutionList({ exportDir: dir })) as { runId: string; candidateCount: number }[]
      expect(runs[0]).toMatchObject({ runId: 'r1', candidateCount: 3 })
      await expect(s.avEvolutionApply({ runId: 'r1', candidateId: 'b', entityId: 'car' })).rejects.toThrow(/attach_browser/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
