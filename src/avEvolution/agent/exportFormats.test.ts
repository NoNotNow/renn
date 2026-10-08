import 'fake-indexeddb/auto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLogicVerificationBrowserAttachHandler } from '@/agent/logicVerificationBrowserAttachHandler'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import type { Candidate } from '../core/evolution'
import { DEFAULT_FITNESS_WEIGHTS } from '../core/fitness'
import { IdbEvolutionStore, MemoryEvolutionStore, prepareExport, sortCandidatesBestFirst, type EvolutionStore, type RunExport, type RunRecord } from '../core/store'
import { bestFromExports, dedupeExports, listRunsFromExports } from './readApi'
import { readExportsFromDisk } from './diskExports'
import { setAvEvolutionStore } from './storeRegistry'

const run: RunRecord = {
  runId: 'r1',
  createdAt: 1,
  updatedAt: 1,
  specVersion: 's1',
  stackVersion: 'v1',
  weights: DEFAULT_FITNESS_WEIGHTS,
  config: {} as RunRecord['config'],
  spec: {} as RunRecord['spec'],
  trainKeys: ['e1', 'e2'],
  state: { marker: 'resumable' } as unknown as RunRecord['state'],
}

/** score undefined => unevaluated (no episodes). Saved in a deliberately unsorted order. */
const cand = (id: string, gen: number, score?: number): Candidate => ({
  id,
  gen,
  parents: [],
  vec: [0.5, 0.25],
  sigma: 0.1,
  params: { id } as unknown as Candidate['params'],
  episodes: score === undefined ? [] : ['e1', 'e2'].map((key) => ({ key, score, reached: true, exitT: score, contactEvents: 0, reversals: 2, reverseS: 1 })),
})

const CANDS = [cand('c10', 3), cand('a', 0, 30), cand('c2', 1), cand('b', 1, 10), cand('c', 2, 20), cand('d', 2, 10)]

async function seeded(store: EvolutionStore) {
  await store.saveRun(run)
  await store.saveCandidates(run, CANDS)
  await store.saveGeneration({ runId: 'r1', gen: 0, stats: { gen: 0, best: 10 } as never, createdAt: 1 })
  return store
}

describe('sortCandidatesBestFirst / prepareExport', () => {
  it('evaluated first by fitness, then unevaluated by gen and numeric id; does not mutate', () => {
    const rows = [
      { id: 'c10', gen: 3, n: 0, fitness: 1e12 },
      { id: 'a', gen: 0, n: 2, fitness: 30 },
      { id: 'c2', gen: 1, n: 0, fitness: 1e12 },
      { id: 'b', gen: 1, n: 2, fitness: 10 },
      { id: 'z', gen: 1, n: 1, fitness: Infinity },
    ]
    const copy = JSON.stringify(rows)
    expect(sortCandidatesBestFirst(rows).map((r) => r.id)).toEqual(['b', 'a', 'c2', 'z', 'c10'])
    expect(JSON.stringify(rows)).toBe(copy)
  })

  for (const [name, make] of [
    ['memory', () => new MemoryEvolutionStore()],
    ['idb', () => new IdbEvolutionStore(Date.now, `ef-${Math.random()}`)],
  ] as const) {
    it(`${name} store: full export is sorted and keeps everything; compact is top-N without episodes/vecs/state`, async () => {
      const store = await seeded(make())
      const full = await store.exportJSON('r1')
      expect(full.candidates.map((c) => c.id)).toEqual(['b', 'd', 'c', 'a', 'c2', 'c10'])
      expect(full.compact).toBeUndefined()
      expect(full.candidates[0].episodes).toHaveLength(2)
      expect(full.candidates[0].vec).toEqual([0.5, 0.25])
      expect(full.run.state).toBeDefined()

      const compact = await store.exportJSON('r1', { compact: true, topN: 3 })
      expect(compact.schema).toBe(full.schema)
      expect(compact.candidates.map((c) => c.id)).toEqual(['b', 'd', 'c'])
      expect(compact.compact).toEqual({ topN: 3, totalCandidates: 6 })
      expect(compact.candidates.every((c) => c.episodes.length === 0 && c.vec.length === 0)).toBe(true)
      expect(compact.candidates[0]).toMatchObject({ fitness: 10, n: 2, params: { id: 'b' }, meanReversals: 2 })
      expect(compact.run.state).toBeUndefined()
      expect(compact.generations).toEqual(full.generations)
      expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length)

      // a compact export is still importable (not resumable)
      const id = await make().importJSON(JSON.parse(JSON.stringify(compact)))
      expect(id).toBe('r1')
    })
  }

  it('default compact topN is 50 and old unsorted data gets sorted by prepareExport', async () => {
    const full = await (await seeded(new MemoryEvolutionStore())).exportJSON('r1')
    const unsorted: RunExport = { ...full, candidates: [...full.candidates].reverse() }
    expect(prepareExport(unsorted).candidates.map((c) => c.id)[0]).toBe('b')
    expect(prepareExport(unsorted, { compact: true }).compact?.topN).toBe(50)
  })
})

describe('readers accept full, compact and old unsorted exports', () => {
  it('bestFromExports / listRunsFromExports / dedupe', async () => {
    const full = await (await seeded(new MemoryEvolutionStore())).exportJSON('r1')
    const unsorted: RunExport = { ...full, candidates: [...full.candidates].reverse() }
    const compact = prepareExport(full, { compact: true, topN: 2 })
    for (const e of [full, unsorted, compact]) {
      expect(bestFromExports([e], { topN: 2 }).map((c) => c.id)).toEqual(['b', 'd'])
      expect(bestFromExports([e], { topN: 1 })[0]).toMatchObject({ meanReversals: 2, params: { id: 'b' } })
    }
    expect(listRunsFromExports([compact])[0]).toMatchObject({ runId: 'r1', candidateCount: 6, bestFitness: 10 })
    // full + compact twin of the same run count once, full preferred
    expect(dedupeExports([compact, full])).toEqual([full])
    expect(dedupeExports([full, compact])).toEqual([full])
    expect(listRunsFromExports([compact, full])).toHaveLength(1)
    expect(bestFromExports([compact, full], { topN: 10, minEpisodes: 0 })).toHaveLength(6)
  })

  it('disk + McpSession: list/best over both files; av_evolution_export defaults to compact, full on request, outFile summary', async () => {
    const store = await seeded(new MemoryEvolutionStore())
    const full = await store.exportJSON('r1')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'av-evo-fmt-'))
    try {
      await writeFile(path.join(dir, 'r1.av-evolution.json'), JSON.stringify({ ...full, candidates: [...full.candidates].reverse() }))
      await writeFile(path.join(dir, 'r1.av-evolution.compact.json'), JSON.stringify(prepareExport(full, { compact: true, topN: 2 })))
      expect(await readExportsFromDisk(dir)).toHaveLength(2)
      const s = new LogicVerificationMcpSession()
      expect(((await s.avEvolutionBest({ topN: 3, exportDir: dir })) as { id: string }[]).map((c) => c.id)).toEqual(['b', 'd', 'c'])
      expect(((await s.avEvolutionList({ exportDir: dir })) as unknown[]).length).toBe(1)

      const compact = (await s.avEvolutionExport({ runId: 'r1', exportDir: dir, topN: 2 })) as RunExport
      expect(compact.compact).toBeDefined()
      expect(compact.candidates.map((c) => c.id)).toEqual(['b', 'd'])
      const fullAgain = (await s.avEvolutionExport({ runId: 'r1', exportDir: dir, compact: false })) as RunExport
      expect(fullAgain.compact).toBeUndefined()
      expect(fullAgain.candidates.map((c) => c.id)).toEqual(['b', 'd', 'c', 'a', 'c2', 'c10'])
      const summary = (await s.avEvolutionExport({ runId: 'r1', exportDir: dir, outFile: '../escape/x', topN: 4 })) as { path: string; candidates: number; compact: boolean }
      expect(summary).toMatchObject({ candidates: 4, compact: true })
      expect(path.dirname(summary.path)).toBe(dir) // basename only
      expect((JSON.parse(await readFile(summary.path, 'utf8')) as RunExport).candidates).toHaveLength(4)
      await expect(s.avEvolutionExport({ runId: 'nope', exportDir: dir })).rejects.toThrow(/unknown run/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('browser attach RPC av_evolution_export honours compact + topN', async () => {
    setAvEvolutionStore(await seeded(new IdbEvolutionStore(Date.now, `rpc-${Math.random()}`)))
    try {
      const h = createLogicVerificationBrowserAttachHandler()
      const out = (await h.dispatchRpc('av_evolution_export', { runId: 'r1', compact: true, topN: 2 })) as RunExport
      expect(out.candidates.map((c) => c.id)).toEqual(['b', 'd'])
      expect(out.candidates[0].episodes).toEqual([])
    } finally {
      setAvEvolutionStore(null)
    }
  })
})
