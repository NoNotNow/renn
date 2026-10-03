import { describe, expect, it } from 'vitest'
import { AV_EDGE_CASES, runEdgeCase } from '@/test/fixtures/avEdgeWorld'

/**
 * Edge-case regression set for the AV stack (small headless world, see avEdgeWorld.ts).
 * A case passes when the car reaches the goal without a long stall and without leaving the floor.
 */
describe('AV stack edge cases (elongated obstacles, awkward angles)', () => {
  it.each(AV_EDGE_CASES.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const r = await runEdgeCase(c)
    // eslint-disable-next-line no-console
    console.log('EDGE', c.name, JSON.stringify({ arrived: r.arrived, at: r.framesToArrive, d: Math.round(r.finalDistance), stall: r.longestStall, path: Math.round(r.path) }))
    expect(r.minY).toBeGreaterThan(-0.5)
    expect(r.arrived).toBe(true)
    expect(r.longestStall).toBeLessThan(300) // < 5 s without moving
  }, 120_000)
})
