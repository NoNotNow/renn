import { describe, expect, it } from 'vitest'
import { formatFleet, runFleet } from '@/test/fixtures/avFleet'

/**
 * Many-cars CPU budget: 6 AV cars on an open map (`layout: 'spread'`), run with budget 'full' and 'eco'.
 * Eco must cost clearly less CPU per car (profiler chain time) and drive as well (same goals reached, same progress).
 * The time ratio bar is loose (wall-clock profiler on a shared machine); the measured ratio is ~0.35. Detailed report: av-fleet-budget.diagnostic.test.ts.
 */
describe('AV fleet: economy budget', () => {
  it(
    "6 cars: budget 'eco' needs much less CPU per car and drives as well as 'full'",
    async () => {
      const full = await runFleet({ n: 6, layout: 'spread' }, 16)
      const eco = await runFleet({ n: 6, layout: 'spread', params: { budget: 'eco' } }, 16)
      console.log(`AV FLEET\n${formatFleet('full', full)}\n${formatFleet('eco', eco)}\nratio eco / full ${(eco.perCarMs / full.perCarMs).toFixed(2)}`)
      expect(eco.fixShare).toBeGreaterThan(0.5)
      expect(eco.reached).toBeGreaterThanOrEqual(full.reached)
      expect(eco.meanProgress).toBeGreaterThan(0.95 * full.meanProgress)
      expect(eco.perCarMs).toBeLessThan(0.8 * full.perCarMs)
    },
    600_000,
  )
})
