import { describe, expect, it } from 'vitest'
import { formatFleet, runFleet, weightedWork } from '@/test/fixtures/avFleet'

/**
 * Many-cars CPU budget: 6 AV cars on an open map (`layout: 'spread'`), run with budget 'full' and 'eco'.
 * Eco must cost clearly less CPU per car and drive as well (same goals reached, same progress).
 * The CPU bar is DETERMINISTIC: weighted work counters of the stages (rays, freeLength sweeps, A* expansions, field cells; weights in avFleet.ts WORK_WEIGHTS),
 * not wall-clock (the profiler time is noisy on a shared machine and only printed as info). Measured work ratio eco / full: WORK_RATIO_MEASURED, bar below with margin.
 * Detailed report: av-fleet-budget.diagnostic.test.ts.
 */
const WORK_RATIO_MAX = 0.6
describe('AV fleet: economy budget', () => {
  it(
    "6 cars: budget 'eco' needs much less CPU per car and drives as well as 'full'",
    async () => {
      const full = await runFleet({ n: 6, layout: 'spread', params: { budget: 'full' } }, 16)
      const eco = await runFleet({ n: 6, layout: 'spread', params: { budget: 'eco' } }, 16)
      const workRatio = weightedWork(eco.work) / weightedWork(full.work)
      console.log(`AV FLEET\n${formatFleet('full', full)}\n${formatFleet('eco', eco)}\nwork ratio eco / full ${workRatio.toFixed(3)} (info: wall-clock ratio ${(eco.perCarMs / full.perCarMs).toFixed(2)})`)
      expect(eco.fixShare).toBeGreaterThan(0.5)
      expect(eco.reached).toBeGreaterThanOrEqual(full.reached)
      expect(eco.meanProgress).toBeGreaterThan(0.95 * full.meanProgress)
      expect(workRatio).toBeLessThan(WORK_RATIO_MAX)
    },
    600_000,
  )
})
