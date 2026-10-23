/**
 * Unit tests of export-schlau-candidates' FAST path (the pure parts): mergeFastBest — the merge/splice of the
 * run's latest best into the exported candidates file without headless scoring — and runFastExport's
 * file-level behavior (atomic write, skip-not-throw on racing/partial reads). The FULL export (islands +
 * headless scores, minutes slow) stays covered by the standing rule's live runs, not by tests.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mergeFastBest, runFastExport, type SchlauCandidatesFile, type SchlauLatestBestFile } from './export-schlau-candidates'

/** A valid schlau genome: len = 29 H + 2 with H = 1 (the smallest shape ensureSchlauGenome accepts). */
function genome(fill = 0): number[] {
  return Array.from({ length: 31 }, (_, i) => (i % 7 === 0 ? fill : i / 100))
}

function latestBest(gen: number, island = 1): SchlauLatestBestFile {
  return { schema: 'renn.policy-evolution.latest-best/1', source: 'test-results/policy-evolution/schlau.json', policy: 'schlau', best: { gen, island, genome: genome(0.5) } }
}

function existingFile(candidates: SchlauCandidatesFile['candidates']): SchlauCandidatesFile {
  return {
    schema: 'renn.policy-evolution.candidates/1',
    source: 'test-results/policy-evolution/schlau.json',
    policy: 'schlau',
    gen: 40,
    updatedAt: '2026-10-22T00:00:00.000Z',
    candidates,
  }
}

const ISLAND = { id: 'island-0', label: 'I1', gen: 40, genome: genome(), detail: 'island 1 center' }
const SHIPPED = { id: 'shipped', label: 'Shipped', gen: 10, genome: genome(), detail: 'shippedPolicySchlau.json' }

describe('mergeFastBest', () => {
  it('replaces an existing scored best IN PLACE: order kept, islands/shipped untouched, stale scores dropped, freshness marked', () => {
    const existing = existingFile([
      { ...ISLAND },
      { id: 'best', label: 'Best', gen: 40, genome: genome(), detail: 'latest best by train fitness', scores: { schlau_1: { best: 10, routes: [1] } }, scoredGen: 40 },
      { ...SHIPPED },
    ])
    const merged = mergeFastBest(existing, latestBest(120, 2), new Date('2026-10-23T01:00:00.000Z'))
    // order preserved: islands ... best ... shipped/placeholder tail
    expect(merged.candidates.map((c) => c.id)).toEqual(['island-0', 'best', 'shipped'])
    const best = merged.candidates[1]!
    expect(best.gen).toBe(120)
    expect(best.genome).toEqual(genome(0.5))
    // the fresh best carries NO scores (they would describe the old genome) and says so in its detail
    expect(best.scores).toBeUndefined()
    expect(best.scoredGen).toBeUndefined()
    expect(best.detail).toContain('island 2')
    expect(best.detail).toContain('headless scores pending')
    // everything but updatedAt keeps describing the last FULL export (its islands, its gen)
    expect(merged.updatedAt).toBe('2026-10-23T01:00:00.000Z')
    expect(merged.gen).toBe(40)
    expect(merged.source).toBe('test-results/policy-evolution/schlau.json')
    expect(merged.candidates[0]).toEqual(ISLAND)
    expect(merged.candidates[2]).toEqual(SHIPPED)
    // the input file is not mutated (the fast path may race the full export's read)
    expect(existing.candidates[1]!.gen).toBe(40)
    expect(existing.updatedAt).toBe('2026-10-22T00:00:00.000Z')
  })

  it('inserts a new best before the shipped/placeholder tail when the file has no best yet', () => {
    const merged = mergeFastBest(existingFile([{ ...ISLAND }, { ...SHIPPED }]), latestBest(120))
    expect(merged.candidates.map((c) => c.id)).toEqual(['island-0', 'best', 'shipped'])
    const noTail = mergeFastBest(existingFile([{ ...ISLAND }]), latestBest(120))
    expect(noTail.candidates.map((c) => c.id)).toEqual(['island-0', 'best'])
  })

  it('creates a fresh schlau candidates file when nothing is exported yet (picker works before any full export)', () => {
    const merged = mergeFastBest(null, latestBest(120), new Date('2026-10-23T01:00:00.000Z'))
    expect(merged.schema).toBe('renn.policy-evolution.candidates/1')
    expect(merged.policy).toBe('schlau')
    expect(merged.source).toBe('test-results/policy-evolution/schlau.json')
    expect(merged.gen).toBe(120)
    expect(merged.candidates.map((c) => c.id)).toEqual(['best'])
    expect(merged.candidates[0]!.gen).toBe(120)
  })

  it('never exports a non-schlau best, a broken genome, or into another policy\'s file', () => {
    expect(() => mergeFastBest(null, { ...latestBest(1), policy: 'v3' })).toThrow(/not 'schlau'/)
    expect(() => mergeFastBest(null, { ...latestBest(1), best: { gen: 1, genome: [] } })).toThrow(/best\.genome/)
    expect(() => mergeFastBest(null, { ...latestBest(1), best: { gen: 1, genome: [1, 'x', 3] as unknown as number[] } })).toThrow(/best\.genome/)
    // a 30-number genome fits NEITHER net (1-layer: 29 H + 2; deep: H^2 + 30 H + 2 — the disjoint length sets)
    expect(() => mergeFastBest(null, { ...latestBest(1), best: { gen: 1, genome: Array.from({ length: 30 }, (_, i) => i) } })).toThrow(/fits neither net/)
    expect(() => mergeFastBest({ ...existingFile([]), policy: 'v3' }, latestBest(1))).toThrow(/another policy/)
  })
})

describe('mergeFastBest: net versioning (deep schlau)', () => {
  /** A valid DEEP schlau genome: len = H^2 + 30 H + 2 with H = 2 (66 numbers, disjoint from every 29 H + 2). */
  const deepGenome = (): number[] => Array.from({ length: 2 * 2 + 30 * 2 + 2 }, (_, i) => (i % 7 === 0 ? 0.5 : i / 100))

  it('tags the merged best with its net: schlau (1-layer) or schlau2 (deep) — the disjoint length decides', () => {
    const one = mergeFastBest(existingFile([{ ...ISLAND }]), latestBest(120), new Date('2026-10-23T01:00:00.000Z'))
    expect(one.candidates.find((c) => c.id === 'best')!.net).toBe('schlau')
    const deep = mergeFastBest(existingFile([{ ...ISLAND }]), { ...latestBest(121), best: { gen: 121, genome: deepGenome() } }, new Date('2026-10-23T02:00:00.000Z'))
    const best = deep.candidates.find((c) => c.id === 'best')!
    expect(best.net).toBe('schlau2')
    expect(best.detail).toMatch(/deep schlau2 net/)
  })

  it('REFUSES a deep genome only when it is no schlau net at all — an old 1-layer file keeps loading as the fallback', () => {
    // a v3-length genome is still accepted by the 1-layer check (the policy tag guards, not this merge) — unchanged
    expect(() => mergeFastBest(existingFile([]), latestBest(122))).not.toThrow()
    expect(() => mergeFastBest(existingFile([]), { ...latestBest(123), best: { gen: 123, genome: [1, 2, 3] } })).toThrow(/fits neither net/)
  })
})

describe('runFastExport', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs.length = 0
  })
  const dir = () => {
    const d = mkdtempSync(join(tmpdir(), 'schlau-fast-'))
    dirs.push(d)
    return d
  }

  it('creates the candidates file from the run\'s latest-best, then updates it in place', () => {
    const d = dir()
    const latestBestPath = join(d, 'latest-best.json')
    const outPath = join(d, 'public', 'policy-evolution', 'schlau-candidates.json')
    writeFileSync(latestBestPath, JSON.stringify(latestBest(100)))
    expect(runFastExport({ latestBestPath, outPath })).toMatchObject({ status: 'created', gen: 100 })
    const first = JSON.parse(readFileSync(outPath, 'utf8')) as SchlauCandidatesFile
    expect(first.candidates.map((c) => c.id)).toEqual(['best'])
    writeFileSync(latestBestPath, JSON.stringify(latestBest(200)))
    expect(runFastExport({ latestBestPath, outPath })).toMatchObject({ status: 'updated', gen: 200 })
    const second = JSON.parse(readFileSync(outPath, 'utf8')) as SchlauCandidatesFile
    expect(second.candidates.map((c) => c.id)).toEqual(['best'])
    expect(second.candidates[0]!.gen).toBe(200)
    expect(existsSync(`${outPath}.tmp-${process.pid}`)).toBe(false)
  })

  it('skips (never throws, never writes) when a racing writer leaves either file unparseable — the watcher retries', () => {
    const d = dir()
    const latestBestPath = join(d, 'latest-best.json')
    const outPath = join(d, 'schlau-candidates.json')
    writeFileSync(latestBestPath, JSON.stringify(latestBest(100)))
    writeFileSync(outPath, '{ "schema": "renn.policy-evolution.candidates/1"') // torn write
    expect(runFastExport({ latestBestPath, outPath }).status).toBe('skipped')
    writeFileSync(outPath, JSON.stringify(existingFile([{ ...SHIPPED }])))
    writeFileSync(latestBestPath, '{ "schema": "renn.policy-evolution.latest-b') // torn write
    expect(runFastExport({ latestBestPath, outPath }).status).toBe('skipped')
    expect((JSON.parse(readFileSync(outPath, 'utf8')) as SchlauCandidatesFile).candidates.map((c) => c.id)).toEqual(['shipped'])
    // a missing latest-best is a skip too (a one-shot --fast run reports it instead of crashing)
    expect(runFastExport({ latestBestPath: join(d, 'missing.json'), outPath }).status).toBe('skipped')
  })
})
