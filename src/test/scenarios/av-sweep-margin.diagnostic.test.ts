import { it } from 'vitest'
import { oracleMargin } from '@/test/fixtures/avEvasionOracle'
import { buildSweepCases } from '@/test/fixtures/avEvasionSweepCases'

// Prints the best achievable minimum gap (m, cap 8) per sweep case: AV_MARGIN=<shard 0-3> npx vitest run src/test/scenarios/av-sweep-margin.diagnostic.test.ts
const shard = process.env.AV_MARGIN
it.runIf(shard !== undefined)('oracle margin per sweep case', () => {
  buildSweepCases().forEach((c, i) => {
    if (i % 4 !== Number(shard)) return
    console.log(`MARGIN ${c.id} ${oracleMargin(c.spec, c.seconds).toFixed(2)}`)
  })
}, 3_000_000)
