import { describe, expect, it } from 'vitest'
import { runLab, versionReport } from '@/test/avLab/lab'
import { fleetCarId } from '@/test/fixtures/avFleet'
import { listAgentDevExampleWorldIds, resetAgentDevExampleWorldIdCacheForTests } from '@/agent/agentDevExampleWorlds'

/** Shipped many-AV-cars example world: discoverable, in sync with the global library, runs headless without errors. */
const EXAMPLE_ID = 'av_fleet_eco'
const CARS = 7

describe('example world av_fleet_eco', () => {
  it('is discoverable and carries the current global library code', async () => {
    resetAgentDevExampleWorldIdCacheForTests()
    expect(await listAgentDevExampleWorldIds()).toContain(EXAMPLE_ID)
    const v = versionReport({ exampleId: EXAMPLE_ID })
    expect(v.stale).toEqual([])
    expect(v.diverged).toEqual([])
  })

  it(
    'runs a few hundred frames headless: all cars drive, no NaN poses',
    async () => {
      const ids = Array.from({ length: CARS }, (_, i) => fleetCarId(i))
      const start: Record<string, number[]> = {}
      const end: Record<string, number[]> = {}
      let frame = 0
      await runLab({
        world: { exampleId: EXAMPLE_ID },
        focus: ids[0]!,
        seed: 1,
        frames: 400,
        maxScenes: 0,
        onFrame: ({ sim }) => {
          frame++
          for (const id of ids) {
            const p = sim.getPosition(id)
            expect(p.every(Number.isFinite)).toBe(true)
            if (frame === 1) start[id] = [...p]
            end[id] = [...p]
          }
        },
      })
      expect(frame).toBe(400)
      for (const id of ids) {
        const moved = Math.hypot(end[id]![0]! - start[id]![0]!, end[id]![2]! - start[id]![2]!)
        expect(moved, id).toBeGreaterThan(5)
      }
    },
    300_000,
  )
})
