import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FITNESS_WEIGHTS,
  EvolutionEngine,
  IdbEvolutionStore,
  MemoryEvolutionStore,
  aggregate,
  createRng,
  denormalise,
  episodeScore,
  fitnessOf,
  mutate,
  normalise,
  perturbGroup,
  toEpisodeRecord,
  uniformCrossover,
  validateSpec,
  type EpisodeMetrics,
  type EvaluateFn,
  type GenomeSpec,
  type RunRecord,
} from './index'

const spec: GenomeSpec = {
  specVersion: 'test-1',
  genes: [
    { key: 'gain', type: 'float', min: 0.1, max: 10, scale: 'log', default: 1, group: 'steer' },
    { key: 'lookahead', type: 'float', min: 0, max: 5, default: 2, group: 'steer' },
    { key: 'rays', type: 'int', min: 3, max: 15, default: 7, group: 'sense' },
    { key: 'brake', type: 'bool', default: false, group: 'speed' },
    { key: 'mode', type: 'enum', options: ['a', 'b', 'c'], default: 'b', group: 'speed' },
  ],
}

const metrics = (o: Partial<EpisodeMetrics> = {}): EpisodeMetrics => ({
  key: 'k', reached: true, exitT: 20, timeoutSec: 60, remainingDist: 0, contactEvents: 0, contactFrames: 0, dt: 1 / 60,
  minStaticGap: 1, flipped: false, stalledSec: 0, wallMs: 1, ...o,
})

describe('genes', () => {
  it('validates spec', () => {
    expect(validateSpec(spec)).toEqual([])
    expect(validateSpec({ specVersion: 'x', genes: [{ key: 'a', type: 'float', min: 0, max: 1, scale: 'log', default: 0.5, group: 'g' }] }).length).toBe(1)
  })
  it('round-trips and respects types', () => {
    const p = { gain: 3.3, lookahead: 4.2, rays: 9, brake: true, mode: 'c' }
    const back = denormalise(spec, normalise(spec, p))
    expect(back.gain as number).toBeCloseTo(3.3, 9)
    expect(back.lookahead as number).toBeCloseTo(4.2, 9)
    expect(back.rays).toBe(9)
    expect(back.brake).toBe(true)
    expect(back.mode).toBe('c')
  })
  it('log scale uses log space; enum index/(n-1)', () => {
    const v = normalise(spec, { gain: 1 })
    expect(v[0]).toBeCloseTo(0.5, 9) // sqrt(0.1*10) = 1
    expect(normalise(spec, { mode: 'a' })[4]).toBe(0)
    expect(normalise(spec, { mode: 'c' })[4]).toBe(1)
    expect(normalise(spec, { mode: 'b' })[4]).toBe(0.5)
  })
  it('clamps out-of-range vectors and rounds ints', () => {
    const p = denormalise(spec, [-3, 9, 0.52, 0.49, 7])
    expect(p.gain).toBeCloseTo(0.1, 9)
    expect(p.lookahead).toBe(5)
    expect(Number.isInteger(p.rays)).toBe(true)
    expect(p.rays).toBe(9)
    expect(p.brake).toBe(false)
    expect(p.mode).toBe('c')
  })
})

describe('operators', () => {
  const base = { vec: normalise(spec, {}), sigma: 0.12 }
  const opts = { sigmaMin: 0.02, sigmaMax: 0.3 }
  it('mutation stays in bounds, sigma stays clamped, deterministic', () => {
    const run = () => {
      const rng = createRng(42)
      let g = { vec: [0.01, 0.99, 0.5, 1, 0], sigma: 0.12 }
      const trail: number[] = []
      for (let i = 0; i < 500; i++) {
        g = mutate(spec, g, rng, opts)
        trail.push(g.sigma)
        expect(g.sigma).toBeGreaterThanOrEqual(0.02)
        expect(g.sigma).toBeLessThanOrEqual(0.3)
        for (const x of g.vec) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(1)
        }
      }
      return { g, trail }
    }
    const a = run()
    expect(run()).toEqual(a)
    expect(new Set(a.trail).size).toBeGreaterThan(50) // sigma adapts
    expect(Math.min(...a.trail)).toBeGreaterThanOrEqual(0.02)
  })
  it('mutation always changes something', () => {
    const rng = createRng(1)
    for (let i = 0; i < 50; i++) expect(mutate(spec, base, rng, { ...opts, mutProb: 0 }).vec).not.toEqual(base.vec)
  })
  it('crossover genes come from parents', () => {
    const a = { vec: [0, 0, 0, 0, 0], sigma: 0.1 }
    const b = { vec: [1, 1, 1, 1, 1], sigma: 0.2 }
    const rng = createRng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 30; i++) {
      const c = uniformCrossover(a, b, rng)
      c.vec.forEach((x) => expect([0, 1]).toContain(x))
      seen.add(c.vec.reduce((s, x) => s + x, 0))
    }
    expect(seen.size).toBeGreaterThan(2)
  })
  it('perturbGroup touches only that group', () => {
    const rng = createRng(5)
    for (let i = 0; i < 20; i++) {
      const g = perturbGroup(spec, base, 'steer', rng, 0.2)
      expect(g.vec.slice(2)).toEqual(base.vec.slice(2))
    }
  })
})

describe('fitness', () => {
  it('DNF is worse than any finish within timeout; contacts penalised', () => {
    const slowFinish = episodeScore(metrics({ exitT: 59.9 }))
    const dnf = episodeScore(metrics({ reached: false, remainingDist: 0.1 }))
    expect(dnf).toBeGreaterThan(slowFinish)
    expect(episodeScore(metrics({ reached: false, remainingDist: 10 }))).toBeGreaterThan(dnf)
    const clean = episodeScore(metrics())
    expect(episodeScore(metrics({ contactEvents: 2 }))).toBeCloseTo(clean + 2 * DEFAULT_FITNESS_WEIGHTS.wContact, 9)
    expect(episodeScore(metrics({ contactFrames: 60 }))).toBeCloseTo(clean + 2, 9)
    expect(episodeScore(metrics({ flipped: true }))).toBeCloseTo(clean + 200, 9)
  })
  it('aggregates', () => {
    const eps = [metrics({ exitT: 10 }), metrics({ reached: false, remainingDist: 4, contactEvents: 2 })].map((m) => toEpisodeRecord(m))
    const a = aggregate(eps)
    expect(a.n).toBe(2)
    expect(a.reachRate).toBe(0.5)
    expect(a.meanContactEvents).toBe(1)
    expect(a.fitness).toBeCloseTo((10 + 60 + 2 + 6) / 2, 9)
  })
})

// ---- synthetic objective: 10 float genes, noisy quadratic
const qSpec: GenomeSpec = {
  specVersion: 'q-1',
  genes: Array.from({ length: 10 }, (_, i) => ({ key: `g${i}`, type: 'float' as const, min: 0, max: 1, default: 0.9, group: i < 5 ? 'a' : 'b' })),
}
const target = qSpec.genes.map((_, i) => 0.1 + 0.08 * i)
const keys = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']
function quadEval(noise: number, seed = 99): EvaluateFn {
  const rng = createRng(seed)
  return async (params, ks) =>
    ks.map((key) => {
      const d = qSpec.genes.reduce((s, g, i) => s + ((params[g.key] as number) - target[i]) ** 2, 0)
      const n = noise ? (rng.next() - 0.5) * 2 * noise : 0
      return metrics({ key, exitT: 10 + 40 * d + n })
    })
}

describe('engine', () => {
  it('optimises a noisy quadratic within 30 generations', async () => {
    const eng = new EvolutionEngine({ spec: qSpec, trainKeys: keys, config: { seed: 7 } })
    const ev = quadEval(1)
    const first = await eng.step(ev)
    for (let i = 0; i < 29; i++) await eng.step(ev)
    const last = eng.best()!
    const d = qSpec.genes.reduce((s, g, i) => s + ((last.params[g.key] as number) - target[i]) ** 2, 0)
    expect(eng.gen).toBe(29)
    expect(d).toBeLessThan(0.15)
    expect(fitnessOf(last)).toBeLessThan(first.best - 3)
    expect(eng.getHallOfFame().length).toBeGreaterThan(0)
  })

  it('seed population contains the default params first', async () => {
    const eng = new EvolutionEngine({ spec: qSpec, trainKeys: keys, initialParams: { g0: 0.5 } })
    await eng.step(quadEval(0))
    const first = eng.getPopulation().find((c) => c.id === 'c0')
    expect(first?.params.g0).toBeCloseTo(0.5, 9)
    expect(first?.params.g1).toBeCloseTo(0.9, 9)
    expect(eng.getPopulation().length).toBe(16)
  })

  it('plus selection: best never gets worse on a noiseless objective; elites survive', async () => {
    const eng = new EvolutionEngine({ spec: qSpec, trainKeys: keys, config: { seed: 3, reevalElites: false } })
    const ev = quadEval(0)
    let prev = Infinity
    for (let i = 0; i < 12; i++) {
      const before = new Set(eng.getPopulation().slice(0, 4).map((c) => c.id))
      const s = await eng.step(ev)
      expect(s.best).toBeLessThanOrEqual(prev + 1e-9)
      prev = s.best
      if (i > 0) {
        const after = new Set(eng.getPopulation().map((c) => c.id))
        for (const id of before) expect(after.has(id)).toBe(true)
      }
    }
  })

  it('re-evaluates elites so fitness is a running mean', async () => {
    const eng = new EvolutionEngine({ spec: qSpec, trainKeys: keys, config: { seed: 3, episodesPerEval: 2 } })
    const ev = quadEval(0.5)
    await eng.step(ev)
    await eng.step(ev)
    await eng.step(ev)
    const maxN = Math.max(...eng.getPopulation().map((c) => c.episodes.length))
    expect(maxN).toBeGreaterThanOrEqual(4)
    const top = eng.getPopulation().find((c) => c.episodes.length === maxN)!
    expect(fitnessOf(top)).toBeCloseTo(top.episodes.reduce((s, e) => s + e.score, 0) / top.episodes.length, 9)
  })

  it('toJSON/fromJSON resume gives identical continuation', async () => {
    const a = new EvolutionEngine({ spec: qSpec, trainKeys: keys, config: { seed: 11 } })
    const evA = quadEval(0.5, 5)
    for (let i = 0; i < 4; i++) await a.step(evA)
    const snap = JSON.parse(JSON.stringify(a.toJSON()))
    const b = EvolutionEngine.fromJSON(snap)
    // evaluator noise stream must match: replay by constructing fresh evaluators with the same state
    const mk = () => {
      const noise = createRng(123)
      return async (params: Record<string, number | boolean | string>, ks: string[]) =>
        ks.map((key) => metrics({ key, exitT: 10 + qSpec.genes.reduce((s, g, i) => s + ((params[g.key] as number) - target[i]) ** 2, 0) * 40 + noise.next() }))
    }
    const sa: unknown[] = []
    const sb: unknown[] = []
    const ea = mk()
    const eb = mk()
    for (let i = 0; i < 3; i++) {
      const x = await a.step(ea)
      const y = await b.step(eb)
      sa.push({ ...x, wallMs: 0 })
      sb.push({ ...y, wallMs: 0 })
    }
    expect(sb).toEqual(sa)
    expect(b.toJSON()).toEqual(a.toJSON())
  })

  it('concurrency does not change results; abort leaves state untouched', async () => {
    const mkEngine = () => new EvolutionEngine({ spec: qSpec, trainKeys: keys, config: { seed: 21 } })
    const ev = quadEval(0)
    const a = mkEngine()
    const b = mkEngine()
    for (let i = 0; i < 3; i++) {
      await a.step(ev, { concurrency: 1 })
      await b.step(async (p, k) => {
        await new Promise((r) => setTimeout(r, Math.random() * 3))
        return ev(p, k)
      }, { concurrency: 5 })
    }
    expect(b.toJSON().population).toEqual(a.toJSON().population)

    const before = JSON.stringify(a.toJSON())
    let calls = 0
    const s = await a.step(ev, { shouldStop: () => ++calls > 5 })
    expect(s.aborted).toBe(true)
    expect(JSON.stringify(a.toJSON())).toBe(before)
    const again = await a.step(ev)
    expect(again.gen).toBe(3)
  })
})

describe('stores', () => {
  const stores: [string, () => MemoryEvolutionStore | IdbEvolutionStore][] = [
    ['memory', () => new MemoryEvolutionStore()],
    ['idb', () => new IdbEvolutionStore(Date.now, `test-${Math.random()}`)],
  ]
  for (const [name, make] of stores) {
    it(`${name} store round-trips runs, candidates, generations and JSON export`, async () => {
      const store = make()
      const eng = new EvolutionEngine({ spec: qSpec, trainKeys: keys, config: { seed: 2 } })
      const run: RunRecord = {
        runId: 'r1', createdAt: 1, updatedAt: 1, specVersion: qSpec.specVersion, stackVersion: 'stack-9',
        weights: eng.weights, config: eng.config, spec: qSpec, trainKeys: keys,
      }
      await store.saveRun(run)
      const ev = quadEval(0.2)
      for (let i = 0; i < 3; i++) {
        const st = await eng.step(ev)
        await store.saveCandidates(run, [...eng.getPopulation()])
        await store.saveGeneration({ runId: 'r1', gen: st.gen, stats: st, createdAt: 2 })
      }
      await store.saveRun({ ...run, updatedAt: 5, state: eng.toJSON() })
      expect((await store.loadRun('r1'))?.updatedAt).toBe(5)
      expect((await store.listRuns()).length).toBe(1)
      const top = await store.topCandidates('r1', 5)
      expect(top.length).toBe(5)
      expect(top.map((t) => t.fitness)).toEqual([...top.map((t) => t.fitness)].sort((a, b) => a - b))
      expect(top[0].stackVersion).toBe('stack-9')
      expect(top[0].weights).toEqual(DEFAULT_FITNESS_WEIGHTS)
      expect((await store.topCandidates('all', 3)).length).toBe(3)
      expect((await store.listGenerations('r1')).map((g) => g.gen)).toEqual([0, 1, 2])

      const exp = await store.exportJSON('r1')
      expect(exp.schema).toBe('renn.av-evolution/1')
      const store2 = make()
      const id = await store2.importJSON(JSON.parse(JSON.stringify(exp)))
      expect(id).toBe('r1')
      expect(await store2.topCandidates('r1', 5)).toEqual(top)
      const resumed = EvolutionEngine.fromJSON((await store2.loadRun('r1'))!.state!)
      expect(resumed.gen).toBe(2)
      expect(await store2.importJSON(exp)).not.toBe('r1') // collision => renamed
      await expect(store2.importJSON({ ...exp, schema: 'nope' } as never)).rejects.toThrow()
    })
  }
})
