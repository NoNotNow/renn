import { describe, expect, it } from 'vitest'
import { buildDirectionBackoffWorld } from '@/test/fixtures/directionBackoffWorld'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
} from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

function watchLabelValue(label: string): string | undefined {
  for (const entry of getTransformerWatchEntries().values()) {
    if (entry.label === label) return entry.value
  }
  return undefined
}

describe('direction back-off (integration)', () => {
  it('triggers dir.backoff and nudges backward when close to a wall', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(buildDirectionBackoffWorld(), 15)
    try {
      const startZ = sim.getPosition('car')[2]
      let sawBackoff = false
      let maxZDuringBackoff = startZ
      for (let frame = 0; frame < 60; frame++) {
        sim.runFrames(1)
        if (watchLabelValue('dir.backoff') === '1') {
          sawBackoff = true
          const z = sim.getPosition('car')[2]
          if (z > maxZDuringBackoff) maxZDuringBackoff = z
        }
      }
      expect(sawBackoff).toBe(true)
      expect(maxZDuringBackoff).toBeGreaterThan(startZ + 0.06)
      expect(maxZDuringBackoff - startZ).toBeLessThan(1.2)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })
})
