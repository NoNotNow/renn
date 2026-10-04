import { it } from 'vitest'
import { oracle } from '@/test/fixtures/avEvasionOracle'
import { buildSweepCases } from '@/test/fixtures/avEvasionSweepCases'

// Regenerates the sweep's winnability table: AV_ORACLE=1 npx vitest run src/test/scenarios/av-sweep-oracle.diagnostic.test.ts (paste the ids into ORACLE_UNWINNABLE)
it.runIf(!!process.env.AV_ORACLE)('winnability oracle over the sweep cases', () => {
  const unwinnable: string[] = []
  for (const c of buildSweepCases()) {
    const r = oracle(c.spec, c.seconds)
    console.log(`${r.winnable ? 'WIN ' : 'LOSS'} ${c.id.padEnd(34)} bestGap ${r.best.minGap.toFixed(1)} plan k1 ${r.best.k1} T1 ${r.best.t1} k2 ${r.best.k2} T2 ${r.best.t2} vt ${r.best.vt}`)
    if (!r.winnable) unwinnable.push(c.id)
  }
  console.log(`UNWINNABLE = ${JSON.stringify(unwinnable)}`)
}, 1_800_000)
