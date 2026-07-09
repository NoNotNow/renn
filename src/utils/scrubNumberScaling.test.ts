import { describe, expect, it } from 'vitest'
import {
  advanceScrubVelocity,
  createScrubVelocityState,
  scrubScaleFromVelocity,
  scrubValueDelta,
} from './scrubNumberScaling'

describe('scrubNumberScaling', () => {
  it('keeps scale near min at low velocity', () => {
    const scale = scrubScaleFromVelocity(0, 1, { baseSensitivity: 0.01 })
    expect(scale).toBeCloseTo(1, 2)
  })

  it('ramps scale quadratically with velocity', () => {
    const halfRef = scrubScaleFromVelocity(300, 1, {
      baseSensitivity: 0.01,
      referenceVelocityPxPerSec: 600,
      scaleSmoothing: 1,
    })
    const fullRef = scrubScaleFromVelocity(600, 1, {
      baseSensitivity: 0.01,
      referenceVelocityPxPerSec: 600,
      scaleSmoothing: 1,
    })
    expect(halfRef).toBeCloseTo(1 + (24 - 1) * 0.25, 1)
    expect(fullRef).toBeCloseTo(24, 1)
  })

  it('smooths scale transitions over successive samples', () => {
    const first = scrubScaleFromVelocity(600, 1, {
      baseSensitivity: 0.01,
      scaleSmoothing: 0.5,
    })
    const second = scrubScaleFromVelocity(600, first, {
      baseSensitivity: 0.01,
      scaleSmoothing: 0.5,
    })
    expect(first).toBeLessThan(24)
    expect(second).toBeGreaterThan(first)
    expect(second).toBeLessThanOrEqual(24)
  })

  it('advances smoothed velocity from pointer samples', () => {
    let state = createScrubVelocityState(100, 0)
    state = advanceScrubVelocity(state, 110, 100, 1)
    expect(state.smoothedVelocityPxPerSec).toBeCloseTo(100, 0)
  })

  it('applies scaled delta to value changes', () => {
    const delta = scrubValueDelta(10, 0, 2, 0.05)
    expect(delta).toBeCloseTo(1, 5)
  })
})
