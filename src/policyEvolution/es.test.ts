import { describe, expect, it } from 'vitest'
import {
  aggregateFitness,
  aggregateKindMin,
  beatsBest,
  centredRanks,
  DEFAULT_ES_CONFIG,
  episodeValues,
  lexCentredRanks,
  lexCompare,
  lexGreater,
  lexTieFraction,
  PolicyEs,
  touchPenaltyNorm,
  V3_FAIL_FACTOR,
  V3_OBJECT_TOUCH_PENALTY,
  V3_WALL_TOUCH_PENALTY,
  type EvaluateGenome,
  type FitnessFn,
  type FitnessVecFn,
} from './es'

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

describe('v3 lexicographic weakest link (candidates compared as ascending episode-value vectors)', () => {
  it('episodeValues: ascending per-episode values, the first is aggregateKindMin', () => {
    const ms = [{ key: 'free:1#0v3', norm: 0.9, peakNorm: 0.9, outcome: 'finish' as const }, { key: 'maze:1#0v3', norm: 0, peakNorm: 0.02, outcome: 'stall' as const }, { key: 'bay:1#0v3', norm: 0.4 }]
    const v = episodeValues(ms)
    expect(v).toEqual([...v].sort((a, b) => a - b))
    expect(v[0]).toBeCloseTo(V3_FAIL_FACTOR * 0.02, 12)
    expect(aggregateKindMin(ms)).toBeCloseTo(v[0]!, 12)
    expect(episodeValues([])).toEqual([])
  })

  it('breaks min-0 deadlocks: an equal worst run, a better second-worst wins ranks and the best-update', () => {
    const a = [0, 0.05, 0.9]
    const b = [0, 0.4, 0.5]
    expect(lexGreater(b, a)).toBe(true)
    expect(lexGreater(a, b)).toBe(false)
    // ES ranks from the lex order although every scalar min is 0; identical vectors share their rank (tie)
    expect(lexCentredRanks([a, b])).toEqual([-0.5, 0.5])
    expect(lexCentredRanks([a, b, a])).toEqual([-0.25, 0.5, -0.25])
    // best-update: the stored best is replaced only by the lexicographically better train vector
    expect(beatsBest(b, { train: 0, trainVec: a })).toBe(true)
    expect(beatsBest(a, { train: 0, trainVec: b })).toBe(false)
  })

  it('pads the shorter vector with 0: a missing episode counts as the worst case', () => {
    expect(lexCompare([0.2], [0.2, 0.5])).toBe(-1)
    expect(lexCompare([0.2], [0.2, 0.0])).toBe(0)
    expect(lexGreater([0.2, 0.1], [0.2])).toBe(true)
    expect(lexGreater([0.2], [0.2, 0.1])).toBe(false)
  })

  it('the worst run still dominates: a worse min loses despite better remaining values', () => {
    expect(lexCompare([0.1, 0.9, 0.99], [0.2, 0.2, 0.2])).toBe(-1)
    expect(lexGreater([0.1, 0.9, 0.99], [0.2, 0.2, 0.2])).toBe(false)
    expect(lexCentredRanks([[0.1, 0.9, 0.99], [0.2, 0.2, 0.2]])).toEqual([-0.5, 0.5])
  })

  it('a pre-vector best (scalar only) becomes [train]: beatable at an equal min, kept on a worse min', () => {
    expect(beatsBest([0, 0.05], { train: 0 })).toBe(true) // the old `0 > 0 = false` deadlock: the second-worst breaks the tie
    expect(beatsBest([0], { train: 0 })).toBe(false) // no information beyond the min: the tie stays
    expect(beatsBest([0.3, 0.4], { train: 0.35 })).toBe(false) // a worse min loses whatever the rest does
    expect(beatsBest([0.36], { train: 0.35 })).toBe(true)
    expect(beatsBest([0], undefined)).toBe(true) // no best yet
  })

  it('PolicyEs with fitnessVec: a min-0 tie moves theta where the scalar min could not', async () => {
    const fitness: FitnessFn = (m) => Math.min(...m.map((x) => x.norm))
    const fitnessVec: FitnessVecFn = (m) => m.map((x) => x.norm).sort((a, b) => a - b)
    // every candidate stalls one episode (value 0: all scalar mins saturate to 0) but the second-worst tracks genome[0]
    const evaluate: EvaluateGenome = async (g) => [{ norm: 0 }, { norm: 1 + g[0]! }, { norm: 2 }] as never
    const es = new PolicyEs({ ...DEFAULT_ES_CONFIG, dim: 3, pairs: 4, seed: 7, lr: 0.1 }, undefined, fitness, fitnessVec)
    const before = es.state.theta[0]!
    const rep = await es.step(evaluate, ['k'])
    expect(rep.best).toBe(0) // scalar mins are all 0 ...
    expect(es.state.theta[0]!).toBeGreaterThan(before) // ... yet the lex ranks pull theta toward the better second-worst
  })
})

describe('v3 lex eps (near-identical vectors share their rank; eps = 0 stays strict)', () => {
  it('lexCentredRanks without eps: only exactly-identical vectors tie (the old behavior, bit-identical)', () => {
    const a = [0, 0.3, 0.9]
    expect(lexCentredRanks([a, [0, 0.31, 0.9]])).toEqual([-0.5, 0.5]) // any difference decides, however small
    expect(lexCentredRanks([a, [...a]])).toEqual([0, 0]) // identical vectors still share their average rank
    expect(lexCentredRanks([a, [0, 0.31, 0.9]], 0)).toEqual([-0.5, 0.5]) // explicit eps: 0 = the strict default
  })

  it('near-ties share their average rank at eps and stay distinct at eps = 0', () => {
    const a = [0, 0.3, 0.9]
    const b = [0, 0.32, 0.9]
    expect(lexCentredRanks([a, b, [0.5, 0.5, 0.5]], 0.05)).toEqual([-0.25, -0.25, 0.5]) // a and b share one average rank
    expect(lexCentredRanks([a, b, [0.5, 0.5, 0.5]])).toEqual([-0.5, 0, 0.5]) // strict: every difference decides
    expect(lexCentredRanks([a, b], 0.01)).toEqual([-0.5, 0.5]) // below the threshold: no tie
    // the grouping is over ADJACENT sorted candidates: a chain of eps-links forms one shared rank even when the
    // ends differ by more than eps
    expect(lexCentredRanks([[0, 0.3], [0, 0.35], [0, 0.4]], 0.06)).toEqual([0, 0, 0])
  })

  it('eps decides only above the threshold: the first position differing by more than eps decides', () => {
    const a = [0.1, 0.2, 0.3]
    const b = [0.12, 0.9, 0.99]
    // the first positions differ within eps, so the later position beyond eps decides the improvement
    expect(lexGreater(b, a, 0.05)).toBe(true)
    expect(lexGreater(a, b, 0.05)).toBe(false)
    // and a beyond-eps difference does not merge into a shared rank
    expect(lexCentredRanks([a, b], 0.05)).toEqual([-0.5, 0.5])
    expect(lexCentredRanks([b, a], 0.05)).toEqual([0.5, -0.5])
    // a worse min beyond eps loses whatever the remaining values do
    expect(lexCentredRanks([[0.1, 0.9, 0.99], [0.2, 0.2, 0.2]], 0.05)).toEqual([-0.5, 0.5])
  })

  it('lexTieFraction: 0 for all-distinct, 1 for all-equal, the exact share for a mix; respects eps', () => {
    const x = [0, 0.1]
    const y = [0, 0.12]
    const z = [0.5, 0.5]
    expect(lexTieFraction([x, y, z])).toBe(0)
    expect(lexTieFraction([x, x, x])).toBe(1)
    expect(lexTieFraction([x, x, y])).toBeCloseTo(1 / 3, 12) // 1 tied pair out of 3
    expect(lexTieFraction([x, y, z], 0.05)).toBeCloseTo(1 / 3, 12) // x and y become eps-equal
    expect(lexTieFraction([x, y, z], 0.01)).toBe(0) // ... but only above the threshold
    expect(lexTieFraction([x])).toBe(0) // N < 2: no pairs
    expect(lexTieFraction([])).toBe(0)
  })

  it('EsConfig without lexEps is bit-identical to explicit lexEps: 0 (the whole trajectory, not just the direction)', async () => {
    const fitness: FitnessFn = (m) => Math.min(...m.map((x) => x.norm))
    const fitnessVec: FitnessVecFn = (m) => m.map((x) => x.norm).sort((a, b) => a - b)
    // one stall (value 0) plus values tracking the genome: ranks come from the lex order, not the saturated min
    const evaluate: EvaluateGenome = async (g) => [{ norm: 0 }, { norm: 1 + g[0]! }, { norm: 0.05 * g[1]! }] as never
    const run = async (lexEps?: number) => {
      const es = new PolicyEs({ ...DEFAULT_ES_CONFIG, dim: 2, pairs: 6, seed: 11, lexEps }, undefined, fitness, fitnessVec)
      const reports = []
      for (let i = 0; i < 5; i++) reports.push(await es.step(evaluate, ['k']))
      return { theta: es.state.theta, reports }
    }
    const implicit = await run()
    const explicit = await run(0)
    expect(explicit.theta).toEqual(implicit.theta)
    expect(explicit.reports).toEqual(implicit.reports)
    // the report carries the tie share in the fitnessVec branch, computed with the same eps
    expect(typeof implicit.reports[0]!.lexTieFrac).toBe('number')
  })
})

describe('v3 touch penalties (episodes survive touches, the fitness pays per frame)', () => {
  const base = { key: 'free:1#0v3', norm: 0.9, outcome: 'finish' as const }

  it('wall contact costs more than object contact; both are per-frame subtractions from the norm', () => {
    expect(touchPenaltyNorm(60, 0)).toBeCloseTo(60 * V3_WALL_TOUCH_PENALTY, 12)
    expect(touchPenaltyNorm(0, 60)).toBeCloseTo(60 * V3_OBJECT_TOUCH_PENALTY, 12)
    expect(touchPenaltyNorm(undefined, undefined)).toBe(0)
    expect(aggregateKindMin([{ ...base, touchWallFrames: 60 }])).toBeCloseTo(aggregateKindMin([base]) - 60 * V3_WALL_TOUCH_PENALTY, 12)
    expect(aggregateKindMin([{ ...base, touchObjectFrames: 60 }])).toBeCloseTo(aggregateKindMin([base]) - 60 * V3_OBJECT_TOUCH_PENALTY, 12)
    // same contact time, wall vs object: the wall hurts more
    expect(aggregateKindMin([{ ...base, touchWallFrames: 60 }])).toBeLessThan(aggregateKindMin([{ ...base, touchObjectFrames: 60 }]))
  })

  it('scaled so ~1 s of wall contact (60 frames) is clearly felt but a short brush is not', () => {
    expect(V3_WALL_TOUCH_PENALTY).toBeGreaterThan(V3_OBJECT_TOUCH_PENALTY)
    expect(V3_WALL_TOUCH_PENALTY * 60).toBeGreaterThan(0.1)
    expect(V3_WALL_TOUCH_PENALTY * 6).toBeLessThan(0.05)
    // a long grind cannot push the norm below zero
    expect(aggregateKindMin([{ ...base, norm: 0.05, touchWallFrames: 900 }])).toBe(0)
  })
})

describe('v3 peak semantics (the fitness ranks the high-water of the score curve, not the drained end value)', () => {
  it('a 60 %-then-stall run ranks above an immediate stall: no more 0-saturation between bad runs', () => {
    // both runs end drained: 3 s of standing at a wall = 180 touch frames, the end value saturates to exactly 0
    const stall60 = { key: 'maze:1#0v3', norm: 0, peakNorm: 0.12, outcome: 'stall' as const, touchWallFrames: 180 }
    const stallNow = { key: 'maze:1#0v3', norm: 0, peakNorm: 0.001, outcome: 'stall' as const, touchWallFrames: 180 }
    // the old end-value formula (metrics without peakNorm) erases the difference: both are 0
    expect(aggregateKindMin([{ key: 'maze:1#0v3', norm: 0, outcome: 'stall' as const, touchWallFrames: 180 }])).toBe(0)
    // the peak keeps the gradient: 60 % progress before the stall beats stalling at the start
    expect(aggregateKindMin([stall60])).toBeGreaterThan(0)
    expect(aggregateKindMin([stall60])).toBeGreaterThan(aggregateKindMin([stallNow]))
  })

  it('a strong-touch run stays below a clean drive: the penalties up to the peak frame are inside peakNorm, never subtracted twice', () => {
    const clean = { key: 'free:1#0v3', norm: 0.9, peakNorm: 0.9, outcome: 'finish' as const }
    // 1 s of wall scraping before the peak moment is paid inside peakNorm
    const touched = { key: 'free:1#0v3', norm: 0.9, peakNorm: 0.9 - 60 * V3_WALL_TOUCH_PENALTY, outcome: 'finish' as const, touchWallFrames: 60 }
    expect(aggregateKindMin([touched])).toBeCloseTo(aggregateKindMin([clean]) - 60 * V3_WALL_TOUCH_PENALTY, 12)
    expect(aggregateKindMin([touched])).toBeLessThan(aggregateKindMin([clean]))
    // peakNorm is final for the fitness: whole-episode touch frames on top of it change nothing (no double subtraction)
    expect(aggregateKindMin([{ ...touched, touchWallFrames: 900 }])).toBeCloseTo(aggregateKindMin([touched]), 12)
  })

  it('the fail factor still applies to the peak: a crashed run keeps only V3_FAIL_FACTOR of its best moment', () => {
    const stalled = { key: 'bay:1#0v3', norm: 0, peakNorm: 0.4, outcome: 'stall' as const }
    expect(aggregateKindMin([{ ...stalled, outcome: 'crash' as const }])).toBeCloseTo(V3_FAIL_FACTOR * 0.4, 12)
    expect(aggregateKindMin([stalled])).toBeCloseTo(V3_FAIL_FACTOR * 0.4, 12)
    // a finished run with the same peak beats the failed one
    expect(aggregateKindMin([{ ...stalled, outcome: 'finish' as const }])).toBeCloseTo(0.4, 12)
  })
})
