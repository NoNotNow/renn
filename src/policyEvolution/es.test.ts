import { describe, expect, it } from 'vitest'
import { aggregateFitness, aggregateKindEvenness, centredRanks, DEFAULT_ES_CONFIG, PolicyEs, touchPenaltyNorm, V3_OBJECT_TOUCH_PENALTY, V3_WALL_TOUCH_PENALTY, type EvaluateGenome } from './es'

describe('centredRanks', () => {
  it('maps to [-0.5, 0.5], ties share a rank', () => {
    expect(centredRanks([3, 1, 2])).toEqual([0.5, -0.5, 0])
    expect(centredRanks([1, 1, 1])).toEqual([0, 0, 0])
  })
})

describe('aggregateFitness', () => {
  it('blends mean and worst quarter', () => {
    expect(aggregateFitness([{ norm: 1 }, { norm: 1 }, { norm: 1 }, { norm: 0 }])).toBeCloseTo(0.5 * 0.75 + 0.5 * 0)
  })
})

describe('PolicyEs', () => {
  it('climbs a quadratic and is reproducible', async () => {
    const target = Array.from({ length: 12 }, (_, i) => (i % 3) - 1)
    const evaluate: EvaluateGenome = async (g) => [{ norm: -g.reduce((a, x, i) => a + (x - target[i]!) ** 2, 0) } as never]
    const run = async () => {
      const es = new PolicyEs({ ...DEFAULT_ES_CONFIG, dim: 12, pairs: 16, seed: 5 })
      let last = 0
      for (let g = 0; g < 80; g++) last = (await es.step(evaluate, ['k'])).center
      return { last, theta: es.state.theta }
    }
    const a = await run()
    expect(a.last).toBeGreaterThan(-0.5)
    expect(await run()).toEqual(a)
  })
})

describe('v3 touch penalties (episodes survive touches, the fitness pays per frame)', () => {
  const base = { key: 'free:1#0v3', norm: 0.9, outcome: 'finish' as const }

  it('wall contact costs more than object contact; both are per-frame subtractions from the norm', () => {
    expect(touchPenaltyNorm(60, 0)).toBeCloseTo(60 * V3_WALL_TOUCH_PENALTY, 12)
    expect(touchPenaltyNorm(0, 60)).toBeCloseTo(60 * V3_OBJECT_TOUCH_PENALTY, 12)
    expect(touchPenaltyNorm(undefined, undefined)).toBe(0)
    expect(aggregateKindEvenness([{ ...base, touchWallFrames: 60 }])).toBeCloseTo(aggregateKindEvenness([base]) - 60 * V3_WALL_TOUCH_PENALTY, 12)
    expect(aggregateKindEvenness([{ ...base, touchObjectFrames: 60 }])).toBeCloseTo(aggregateKindEvenness([base]) - 60 * V3_OBJECT_TOUCH_PENALTY, 12)
    // same contact time, wall vs object: the wall hurts more
    expect(aggregateKindEvenness([{ ...base, touchWallFrames: 60 }])).toBeLessThan(aggregateKindEvenness([{ ...base, touchObjectFrames: 60 }]))
  })

  it('scaled so ~1 s of wall contact (60 frames) is clearly felt but a short brush is not', () => {
    expect(V3_WALL_TOUCH_PENALTY).toBeGreaterThan(V3_OBJECT_TOUCH_PENALTY)
    expect(V3_WALL_TOUCH_PENALTY * 60).toBeGreaterThan(0.1)
    expect(V3_WALL_TOUCH_PENALTY * 6).toBeLessThan(0.05)
    // a long grind cannot push the norm below zero
    expect(aggregateKindEvenness([{ ...base, norm: 0.05, touchWallFrames: 900 }])).toBe(0)
  })
})
