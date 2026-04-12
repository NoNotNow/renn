import { describe, it, expect } from 'vitest'
import { advanceSemiFixedAccumulator } from '@/runtime/sceneFrameLoop'

describe('advanceSemiFixedAccumulator', () => {
  const fixedDt = 1 / 60
  const maxSteps = 4

  it('runs no steps when elapsed is below one fixed tick and carries remainder', () => {
    const { stepsToRun, accumulator } = advanceSemiFixedAccumulator({
      accumulator: 0,
      elapsedSec: fixedDt * 0.5,
      fixedDt,
      maxStepsPerFrame: maxSteps,
    })
    expect(stepsToRun).toBe(0)
    expect(accumulator).toBeCloseTo(fixedDt * 0.5)
  })

  it('runs one step when accumulator + elapsed reaches one tick', () => {
    const { stepsToRun, accumulator } = advanceSemiFixedAccumulator({
      accumulator: fixedDt * 0.6,
      elapsedSec: fixedDt * 0.5,
      fixedDt,
      maxStepsPerFrame: maxSteps,
    })
    expect(stepsToRun).toBe(1)
    expect(accumulator).toBeCloseTo(0.1 * fixedDt)
  })

  it('caps steps at maxStepsPerFrame when wall time exceeds one tick budget', () => {
    const { stepsToRun, accumulator } = advanceSemiFixedAccumulator({
      accumulator: 0,
      elapsedSec: 10,
      fixedDt,
      maxStepsPerFrame: maxSteps,
    })
    expect(stepsToRun).toBe(maxSteps)
    // Wall time clamped to maxSteps * fixedDt → exactly maxSteps ticks, no remainder.
    expect(accumulator).toBeCloseTo(0)
  })

  it('clamps a single huge elapsed to maxSteps * fixedDt worth of simulation budget', () => {
    const maxElapsed = maxSteps * fixedDt
    const { stepsToRun, accumulator } = advanceSemiFixedAccumulator({
      accumulator: 0,
      elapsedSec: maxElapsed + 0.2,
      fixedDt,
      maxStepsPerFrame: maxSteps,
    })
    expect(stepsToRun).toBe(maxSteps)
    // Elapsed beyond the cap is not added to the accumulator for this tick.
    expect(accumulator).toBeCloseTo(0)
  })
})
