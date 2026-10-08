import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AV_GENOME_SPEC } from '@/avEvolution/genes'
import { createRng } from '@/avEvolution/core/rng'
import type { EpResult, EpSpec } from '../hunt-maze/episode'
import type { CaseResult } from './probe/proxy'
import { disjointStarts, specSet } from './common'
import { Evolution, type TaskRunner } from './evolve'
import { caseViolation, constraintScore, DEFAULT_WEIGHTS, harnessFitness, infeasibleScore } from './fitness'
import { assertKeysValid, crossover, decodeGenome, emptyGenome, encodeProfile, HOLD_MAX, HOLD_MIN, keyValue, LM_KEYS, mutate, profileHash, profileParams, proxyExtra } from './genome'
import { proxyCases, sentinelCases, type Task } from './tasks'

const seedDir = path.join(__dirname, 'seeds')
const seed = (n: string) => JSON.parse(fs.readFileSync(path.join(seedDir, `${n}.json`), 'utf8')) as Record<string, unknown>

describe('genome', () => {
  it('has only valid, bounded, non-CPU-budget keys', () => {
    expect(() => assertKeysValid()).not.toThrow()
    expect(new Set(LM_KEYS).size).toBe(LM_KEYS.length)
    expect(LM_KEYS.length).toBe(33)
    for (const k of LM_KEYS) expect(AV_GENOME_SPEC.genes.some((g) => g.key === k)).toBe(true)
    expect(LM_KEYS.some((k) => /sweep|saver|budget|tick/i.test(k))).toBe(false)
  })
  it('encode/decode roundtrips the seeds (to 4 significant digits) and keeps absent keys absent', () => {
    for (const n of ['S8', 'P1', 'LMnoC']) {
      const raw = seed(n)
      const flat = (raw.mazeProfile ?? raw) as Record<string, number>
      const p = decodeGenome(encodeProfile(raw))
      expect(Object.keys(p.mazeProfile).sort()).toEqual(Object.keys(flat).filter((k) => k !== 'mazeProfileHold').sort())
      for (const [k, v] of Object.entries(flat)) expect(Math.abs(p.mazeProfile[k]! - v) / Math.max(Math.abs(v), 1e-9)).toBeLessThan(2e-3)
      expect(p.mazeProfileHold).toBe(3)
    }
  })
  it('empty genome is the base profile (no hold, hash base, no params, proxy override clears the profile)', () => {
    const p = decodeGenome(emptyGenome())
    expect(p).toEqual({ mazeProfile: {} })
    expect(profileHash(p)).toBe('base')
    expect(profileParams(p)).toEqual({})
    expect(Object.keys(proxyExtra(p))).toEqual(['mazeProfile'])
  })
  it('stays inside the gene bounds and the hold range under heavy mutation / crossover; hash is order independent', () => {
    const rng = createRng(7)
    let g = encodeProfile(seed('LMnoC'))
    const h0 = profileHash(decodeGenome(g))
    for (let i = 0; i < 300; i++) g = crossover(mutate(g, rng, undefined, 4), mutate(g, rng, undefined, 4), rng)
    const p = decodeGenome(g)
    for (const [k, v] of Object.entries(p.mazeProfile)) {
      const spec = AV_GENOME_SPEC.genes.find((x) => x.key === k)!
      expect(v).toBeGreaterThanOrEqual(spec.min!)
      expect(v).toBeLessThanOrEqual(spec.max!)
      if (spec.type === 'int') expect(Number.isInteger(v)).toBe(true)
    }
    expect(p.mazeProfileHold ?? 3).toBeGreaterThanOrEqual(HOLD_MIN)
    expect(p.mazeProfileHold ?? 3).toBeLessThanOrEqual(HOLD_MAX)
    expect(keyValue('fieldBlockCost', 0)).toBe(50)
    expect(keyValue('fieldBlockCost', 1)).toBe(1000)
    const rev = { mazeProfile: Object.fromEntries(Object.entries(decodeGenome(encodeProfile(seed('S8'))).mazeProfile).reverse()), mazeProfileHold: 3 }
    expect(profileHash(rev)).toBe(profileHash(decodeGenome(encodeProfile(seed('S8')))))
    expect(h0).not.toBe('base')
  })
})

const ep = (kind: string, t: number, reached: boolean, o: Partial<EpResult> = {}): EpResult => ({ id: `${kind}-x`, kind, maze: 'A', reached, exitT: t, outT: null, catchT: null, contactEvents: 0, contactFrames: 0, reversals: 0, reverseS: 0, hits: 0, firstHitT: null, minChaserDist: 9, profFlips: 0, profOnS: 0, flipped: false, simS: t, wallMs: 1, endDist: 0, ...o }) as EpResult
const cr = (name: string, pass: boolean, margins: { key: string; slack: number; limit?: number }[] = []): CaseResult => ({ name, kind: 'maze', pass, failed: pass ? [] : ['x'], margins: margins.map((m) => ({ key: m.key, value: 0, limit: m.limit ?? 1, slack: m.slack })), wallMs: 1, goalT: 1 })

describe('fitness', () => {
  it('aggregates scenario means, penalties and the parsimony term', () => {
    const w = { ...DEFAULT_WEIGHTS, scen: { solo: 1, flee: 2 }, unreached: 10, hit: 1, reversal: 1, reverseS: 1, contactFrame: 0.1, keyCost: 0.5 }
    const eps = [ep('solo', 10, true), ep('solo', 20, true), ep('flee', 100, false, { hits: 2, reversals: 4, reverseS: 2, contactFrames: 10 }), ep('flee', 20, true)]
    const { fitness, per } = harnessFitness(eps, w, 4)
    // solo: 15 ; flee: mean 60 + (10 + 2 + 4 + 2 + 1)/2 = 69.5, x2 ; keys 4 x 0.5
    expect(fitness).toBeCloseTo(15 + 139 + 2, 6)
    expect(per.flee!.reached).toBe(1)
    expect(per.flee!.meanTimeout).toBe(60)
    expect(per.solo!.meanExit).toBe(15)
  })
  it('scores constraint violations relative to the base margins; passing cases never count', () => {
    const base = { 'c:full': cr('c', true, [{ key: 'contact', slack: -3, limit: 1 }, { key: 'goalT', slack: 5, limit: 50 }]) }
    // failing, contact worse than base by 2 (limit 1 -> norm 1), goalT violated by 4 (limit 50 -> /50) but base had slack +5 => ref 0
    const bad = cr('c', false, [{ key: 'contact', slack: -5, limit: 1 }, { key: 'goalT', slack: -4, limit: 50 }])
    expect(caseViolation(bad, base['c:full'])).toBeCloseTo(2 + 4 / 50, 6)
    // failing only in a margin that is as bad as the base's own => floor 0.1
    expect(caseViolation(cr('c', false, [{ key: 'contact', slack: -3, limit: 1 }]), base['c:full'])).toBeCloseTo(0.1, 6)
    const cs = constraintScore([{ id: 'c:full', r: bad }, { id: 'd:full', r: cr('d', true, [{ key: 'q', slack: -9 }]) }], base)
    expect(cs.feasible).toBe(false)
    expect(cs.failing).toEqual(['c:full'])
    expect(constraintScore([{ id: 'd:full', r: cr('d', true, [{ key: 'q', slack: -9 }]) }], base).feasible).toBe(true)
    expect(infeasibleScore(0.1, 50)).toBeGreaterThan(1000 * 0 + 500)
  })
})

describe('proxy / sentinel case sets', () => {
  it('sentinel is a subset of the full proxy; full proxy has no duplicates', () => {
    const all = proxyCases().map((p) => `${p.name}:${p.budget}`)
    expect(new Set(all).size).toBe(all.length)
    for (const s of sentinelCases()) expect(all).toContain(`${s.name}:${s.budget}`)
    expect(sentinelCases().length).toBe(9)
  })
})

describe('held-out starts', () => {
  it('are disjoint from the train starts and have the same size', () => {
    const train = specSet({ kinds: ['solo'] })
    const held = specSet({ kinds: ['solo'], heldOut: true })
    expect(train.length).toBe(21)
    expect(held.length).toBeGreaterThanOrEqual(15)
    expect(disjointStarts(train, held)).toBe(true)
    expect(new Set([...train, ...held].map((s) => s.id)).size).toBe(train.length + held.length)
  }, 120_000)
})

function fakeRunner(log: string[]): TaskRunner {
  const h = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return {
    async run<T>(t: Task): Promise<T> {
      log.push(t.id)
      if (t.t === 'ep') {
        const x = h(t.id)
        const hash = t.id.split('|')[1]!
        const good = hash === 'base' ? 0 : (x % 7)
        return ep(t.spec.kind, 60 - good, true, { id: t.spec.id }) as T
      }
      const x = h(t.id)
      const hash = t.id.split('|')[1]!
      // ~50% of candidates fail the sentinel case maze-gate-exit, ~20% fail some later case; base passes everything
      const fail = hash !== 'base' && ((t.name === 'maze-gate-exit' && x % 2 === 0) || (t.name === 's-bend-14' && x % 5 === 0))
      return cr(t.name, !fail, [{ key: 'shuttle', slack: fail ? -1 : 2, limit: 2 }]) as T
    },
  }
}
const spec = (id: string, kind: 'solo' | 'flee'): EpSpec => ({ id, kind, maze: 'A', bbox: [0, 1, 0, 1], start: { x: 0, z: 0, yawDeg: 0 }, goal: [0, 0], chasers: [] })

describe('Evolution checkpoint / resume', () => {
  it('resumes from the out dir without recomputing finished candidates and continues at the next generation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpe-'))
    const o = { outDir: dir, popSize: 4, eliteCount: 2, gens: 1, seed: 3, seconds: 10, specs: [spec('solo-A1', 'solo'), spec('flee-A1', 'flee')], weights: DEFAULT_WEIGHTS, cutSlack: 1, crossP: 0.5, seeds: [{ name: 'S8', profile: seed('S8') }, { name: 'P1', profile: seed('P1') }, { name: 'LMnoC', profile: seed('LMnoC') }], log: () => {} }
    const log1: string[] = []
    const e1 = new Evolution(o, fakeRunner(log1))
    await e1.run()
    const cp1 = JSON.parse(fs.readFileSync(path.join(dir, 'checkpoint.json'), 'utf8')) as { gen: number; offspring: unknown }
    expect(cp1.gen).toBe(1)
    expect(cp1.offspring).toBeNull()
    const hashes1 = new Set(e1.cands.keys())
    expect(hashes1.has('base')).toBe(true)
    expect(e1.cands.get('base')!.feasible).toBe(true)
    // rerun with the same dir and the new TOTAL target 2: only generation 2 is computed
    const log2: string[] = []
    const e2 = new Evolution({ ...o, gens: 2 }, fakeRunner(log2))
    expect([...e2.cands.keys()].sort()).toEqual([...hashes1].sort())
    await e2.run()
    for (const id of log2) expect(hashes1.has(id.split('|')[1]!)).toBe(false)
    expect(log2.length).toBeGreaterThan(0)
    expect((JSON.parse(fs.readFileSync(path.join(dir, 'checkpoint.json'), 'utf8')) as { gen: number }).gen).toBe(2)
    // a third run with the same target does nothing at all
    const log3: string[] = []
    await new Evolution({ ...o, gens: 2 }, fakeRunner(log3)).run()
    expect(log3).toEqual([])
    // best is feasible-only and verified
    const best = e2.bestFeasible()
    if (best) { expect(best.feasible).toBe(true); expect(best.stage).toBe('full'); expect(best.failing).toEqual([]) }
    // infeasible / sentinel-failed candidates never reported
    for (const c of e2.cands.values()) if (c.feasible !== true) expect(e2.bestFeasible()?.hash).not.toBe(c.hash)
    // a config change is refused
    expect(() => new Evolution({ ...o, seed: 99 }, fakeRunner([]))).toThrow(/different config/)
    fs.rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('mid-generation kill: offspring are fixed in the checkpoint, a resume evaluates the same ones', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpe-'))
    const o = { outDir: dir, popSize: 4, eliteCount: 2, gens: 1, seed: 5, seconds: 10, specs: [spec('solo-A1', 'solo')], weights: DEFAULT_WEIGHTS, cutSlack: 1, crossP: 0.5, seeds: [{ name: 'S8', profile: seed('S8') }, { name: 'LMnoC', profile: seed('LMnoC') }], log: () => {} }
    // runner that throws after N tasks inside generation 1 (simulated crash)
    let n = 0
    const crashing: TaskRunner = { run: async <T,>(t: Task): Promise<T> => { if (JSON.parse(fs.readFileSync(path.join(dir, 'checkpoint.json'), 'utf8')).initDone && ++n > 6) throw new Error('crash'); return fakeRunner([]).run<T>(t) } }
    await expect(new Evolution(o, crashing).run()).rejects.toThrow('crash')
    const mid = JSON.parse(fs.readFileSync(path.join(dir, 'checkpoint.json'), 'utf8')) as { gen: number; offspring: unknown[] | null }
    expect(mid.gen).toBe(0)
    expect(mid.offspring?.length).toBeGreaterThan(0)
    const e = new Evolution(o, fakeRunner([]))
    await e.run()
    expect((JSON.parse(fs.readFileSync(path.join(dir, 'checkpoint.json'), 'utf8')) as { gen: number }).gen).toBe(1)
    fs.rmSync(dir, { recursive: true, force: true })
  }, 60_000)
})
