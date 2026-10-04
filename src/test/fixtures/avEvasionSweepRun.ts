import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, afterAll } from 'vitest'
import { SCENARIO_TIMEOUT, f1, runScenario, surviveCriteria, type ScenarioMetrics } from '@/test/fixtures/avEvasionRunner'
import { SWEEP_BASELINE_PASS } from '@/test/fixtures/avEvasionSweepBaseline'
import { SWEEP_SHARDS, selectedCases, type SweepCase } from '@/test/fixtures/avEvasionSweepCases'

export interface SweepResult {
  id: string
  family: string
  params: Record<string, string>
  unwinnable: string
  pass: boolean
  failed: string[]
  minChaserGap: number
  firstContact: string
  launchMaxDv: number
}

const OUT_DIR = join(process.cwd(), 'test-results', 'av-sweep')

/** Runs the cases of one shard (`index % SWEEP_SHARDS === shard`). Cases in SWEEP_BASELINE_PASS must pass (regression guard); the rest is reported only. */
export function runSweepShard(shard: number): void {
  const cases = selectedCases().filter((_, i) => i % SWEEP_SHARDS === shard)
  const results: SweepResult[] = []
  describe(`AV evasion sweep shard ${shard + 1}/${SWEEP_SHARDS} (${process.env.AV_SWEEP === 'full' ? 'full' : 'core'})`, () => {
    afterAll(() => {
      mkdirSync(OUT_DIR, { recursive: true })
      writeFileSync(join(OUT_DIR, `${process.env.AV_SWEEP === 'full' ? 'full' : 'core'}-${shard}.json`), JSON.stringify(results, null, 1))
      for (const r of results) {
        console.log(`${r.pass ? 'PASS' : r.unwinnable ? 'UNWN' : 'FAIL'} ${r.id.padEnd(34)} gap ${f1(r.minChaserGap).padStart(5)} ${r.failed.join('; ')}${r.unwinnable ? ` [${r.unwinnable}]` : ''}`)
      }
    })
    for (const c of cases) {
      it(
        c.id,
        async () => {
          const m: ScenarioMetrics = await runScenario(c.spec, c.seconds)
          const failed = surviveCriteria({ minChaserGap: 0 })(m)
          results.push(resultOf(c, m, failed))
          if (c.unwinnable || !SWEEP_BASELINE_PASS.has(c.id)) return
          expect(failed, `${c.id} passed at the recorded baseline`).toEqual([])
        },
        SCENARIO_TIMEOUT,
      )
    }
  })
}

function resultOf(c: SweepCase, m: ScenarioMetrics, failed: string[]): SweepResult {
  return { id: c.id, family: c.family, params: c.params, unwinnable: c.unwinnable, pass: failed.length === 0, failed, minChaserGap: m.minChaserGap, firstContact: m.firstContact, launchMaxDv: m.launchMaxDv }
}
