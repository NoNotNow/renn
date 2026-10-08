import { describe, expect, it } from 'vitest'
import { aggregateFitness, centredRanks, DEFAULT_ES_CONFIG, PolicyEs, type EvaluateGenome } from './es'

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
