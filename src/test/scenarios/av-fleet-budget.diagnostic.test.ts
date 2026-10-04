import { it } from 'vitest'
import { formatFleet, runFleet } from '@/test/fixtures/avFleet'

// CPU per car with many AV cars: AV_FLEET=1 [AV_FLEET_N=8 AV_FLEET_SEC=20 AV_FLEET_BUDGETS=full,normal,eco] npx vitest run src/test/scenarios/av-fleet-budget.diagnostic.test.ts
it.runIf(!!process.env.AV_FLEET)(
  'fleet CPU budget report',
  async () => {
    const n = +(process.env.AV_FLEET_N ?? 8)
    const sec = +(process.env.AV_FLEET_SEC ?? 20)
    for (const b of (process.env.AV_FLEET_BUDGETS ?? 'full').split(',')) {
      const layout = (process.env.AV_FLEET_LAYOUT ?? 'ring') as 'ring' | 'spread'
      const r = await runFleet({ n, layout, params: b === 'none' ? {} : { budget: b } }, sec)
      console.log(formatFleet(b, r))
    }
  },
  1_800_000,
)
