import { describe, expect, it } from 'vitest'
import { createRng } from '@/avEvolution/core/rng'
import { aggregateFitness, DEFAULT_ES_CONFIG, type EvaluateGenome } from './es'
import { alignNeurons, crossoverNeurons, DEFAULT_ISLANDS, freshGenome, initialIslands, IslandEs, neuronBlock, sampleInputs, setNeuronBlock } from './islands'
import { applyCurriculum, DEFAULT_CURRICULUM, initialCurriculum, updateCurriculum } from './curriculum'
import { buildCourse, courseKey, parseCourseKey } from './courses'
import { genomeLengthV2, GENOME_LENGTH, N_HIDDEN, N_IN_V2, policyForward, policyForwardV2 } from './policy'

/** the same function with the hidden neurons shuffled and some of them sign-flipped */
function scrambled(g: number[], rng: ReturnType<typeof createRng>): { genome: number[]; perm: number[] } {
  const perm = Array.from({ length: N_HIDDEN }, (_, i) => i)
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j]!, perm[i]!]
  }
  const out = g.slice()
  perm.forEach((src, dst) => setNeuronBlock(out, dst, neuronBlock(g, src), rng.next() < 0.5 ? -1 : 1))
  return { genome: out, perm }
}

describe('neuron alignment and crossover', () => {
  it('scrambling hidden neurons (order + sign) does not change the function', () => {
    const rng = createRng(3)
    const g = freshGenome(rng, 0.5)
    const { genome } = scrambled(g, rng)
    for (const x of sampleInputs(20, createRng(9))) {
      const a = policyForward(g, x)
      const b = policyForward(genome, x)
      expect(b[0]).toBeCloseTo(a[0], 9)
      expect(b[1]).toBeCloseTo(a[1], 9)
    }
  })

  it('alignNeurons recovers the permutation and the signs', () => {
    const rng = createRng(4)
    const g = freshGenome(rng, 0.5)
    const { genome, perm } = scrambled(g, rng)
    const { match } = alignNeurons(g, genome)
    // neuron i of g sits at position dst of the scrambled copy where perm[dst] = i
    match.forEach((m, i) => expect(perm[m]).toBe(i))
  })

  it('crossing a net with its scrambled copy gives back the same function (naive crossover would not)', () => {
    const rng = createRng(5)
    const g = freshGenome(rng, 0.5)
    const { genome } = scrambled(g, rng)
    const child = crossoverNeurons(g, genome, createRng(1))
    const xs = sampleInputs(30, createRng(11))
    const err = (c: number[]) => Math.max(...xs.map((x) => Math.abs(policyForward(c, x)[0] - policyForward(g, x)[0])))
    expect(err(child)).toBeLessThan(1e-9)
    // naive uniform crossover of the raw vectors is clearly broken
    const naive = g.map((v, i) => (i % 2 ? genome[i]! : v))
    expect(err(naive)).toBeGreaterThan(1e-3)
  })

  it('crossover of two unrelated nets mixes both (child differs from each parent)', () => {
    const a = freshGenome(createRng(1), 0.5)
    const b = freshGenome(createRng(2), 0.5)
    const c = crossoverNeurons(a, b, createRng(3))
    expect(c).not.toEqual(a)
    expect(c).not.toEqual(b)
    expect(c.length).toBe(GENOME_LENGTH)
  })
})

describe('any hidden size (H = 24, v2)', () => {
  const H = 24
  it('freshGenome / neuron blocks / alignment / crossover work for H = 24', () => {
    const rng = createRng(8)
    const g = freshGenome(rng, 0.5, N_IN_V2, H)
    expect(g.length).toBe(genomeLengthV2(H))
    const perm = Array.from({ length: H }, (_, i) => (i * 7 + 3) % H)
    const sc = g.slice()
    perm.forEach((src, dst) => setNeuronBlock(sc, dst, neuronBlock(g, src), dst % 3 === 0 ? -1 : 1))
    const xs = sampleInputs(20, createRng(9), N_IN_V2)
    for (const x of xs) expect(policyForwardV2(sc, x)[0]).toBeCloseTo(policyForwardV2(g, x)[0], 9)
    const { match } = alignNeurons(g, sc)
    match.forEach((m, i) => expect(perm[m]).toBe(i))
    const child = crossoverNeurons(g, sc, createRng(1))
    expect(child.length).toBe(g.length)
    for (const x of xs) expect(policyForwardV2(child, x)[0]).toBeCloseTo(policyForwardV2(g, x)[0], 9)
    const other = crossoverNeurons(g, freshGenome(createRng(2), 0.5, N_IN_V2, H), createRng(3))
    expect(other).not.toEqual(g)
    expect(() => crossoverNeurons(g, freshGenome(createRng(2), 0.5, N_IN_V2, 10), createRng(3))).toThrow()
  })

  it('immigrants use the run H', () => {
    const esCfg = { ...DEFAULT_ES_CONFIG, dim: genomeLengthV2(H), pairs: 2, seed: 4 }
    const cfg = { ...DEFAULT_ISLANDS, pCross: 0 }
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.state.islands.forEach((i) => expect(i.es.theta.length).toBe(genomeLengthV2(H)))
    isl.state.islands.forEach((i) => (i.age = 100))
    const { event } = isl.reproduce([3, 2, 1])
    expect(event!.with).toBe('immigrant')
    expect(isl.state.islands[2]!.es.theta.length).toBe(genomeLengthV2(H))
  })
})

describe('IslandEs', () => {
  it('islands improve, the worst mature island is replaced every epoch, young islands are protected', async () => {
    const target = freshGenome(createRng(77), 0.4)
    const evaluate: EvaluateGenome = async (g) => [{ norm: -g.reduce((a, x, i) => a + (x - target[i]!) ** 2, 0) / 50 } as never]
    const esCfg = { ...DEFAULT_ES_CONFIG, dim: GENOME_LENGTH, pairs: 6, seed: 3 }
    const cfg = { ...DEFAULT_ISLANDS, epoch: 10, mature: 20 }
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    let bestScore = -Infinity
    for (let g = 0; g < 60; g++) {
      await isl.step(evaluate, ['k'])
      if (isl.isEpochEnd()) {
        const scores = await Promise.all(isl.engines.map(async (e) => aggregateFitness(await evaluate(e.state.theta, ['k']))))
        const { event } = isl.reproduce(scores)
        bestScore = Math.max(bestScore, ...scores)
        if (event) expect(isl.state.islands[event.replaced]!.age).toBe(0)
      }
    }
    expect(isl.state.events.length).toBeGreaterThan(0)
    expect(isl.state.events.every((e) => ['crossover', 'immigrant'].includes(e.with))).toBe(true)
    // no replacement before the islands are mature (age >= 20 at the first epoch end where gen = 20)
    expect(isl.state.events[0]!.gen).toBeGreaterThanOrEqual(20)
    expect(bestScore).toBeGreaterThan(-5)
  })
})

describe('curriculum', () => {
  it('field difficulty scales box count and size; 1 is the unchanged course, 0 an empty track', () => {
    const empty = buildCourse('field', 3, 0, 0)
    const easy = buildCourse('field', 3, 0, 0.3)
    const full = buildCourse('field', 3)
    const obstacles = (c: typeof full) => c.boxes.filter((b) => b.size[1] < 39 && b.size[0] < 38).length
    expect(obstacles(empty)).toBe(0)
    expect(obstacles(easy)).toBeGreaterThan(0)
    expect(obstacles(easy)).toBeLessThan(obstacles(full))
    expect(buildCourse('field', 3, 0, 1)).toEqual(full)
    expect(parseCourseKey('field:3~2@0.4')).toEqual({ kind: 'field', seed: 3, variant: 2, difficulty: 0.4 })
    expect(courseKey('field', 3, 2, 0.4)).toBe('field:3~2@0.4')
    expect(() => parseCourseKey('field:3@2')).toThrow()
  })

  it('steps up only after enough good generations, never past 1', () => {
    let s = initialCurriculum()
    expect(s.difficulty).toBe(0)
    for (let i = 0; i < DEFAULT_CURRICULUM.minSteps - 1; i++) s = updateCurriculum(s, 0.9)
    expect(s.difficulty).toBe(0)
    s = updateCurriculum(s, 0.9)
    expect(s.difficulty).toBeCloseTo(0.05)
    for (let i = 0; i < 600; i++) s = updateCurriculum(s, 1)
    expect(s.difficulty).toBe(1)
    let low = initialCurriculum()
    for (let i = 0; i < 50; i++) low = updateCurriculum(low, 0.3)
    expect(low.difficulty).toBe(0)
  })

  it('applyCurriculum only touches field keys and stays inside the window', () => {
    const s = { difficulty: 0.5, ema: 0, sinceStep: 0 }
    const keys = applyCurriculum(['field:1~3', 'slalom:1~3', 'maze:1~3'], s, 7)
    expect(keys[1]).toBe('slalom:1~3')
    expect(keys[2]).toBe('maze:1~3')
    const d = parseCourseKey(keys[0]!).difficulty
    expect(d).toBeLessThanOrEqual(0.5)
    expect(d).toBeGreaterThanOrEqual(0.25)
    expect(applyCurriculum(['field:1~3'], { difficulty: 1, ema: 0, sinceStep: 0 }, 7)).toEqual(['field:1~3'])
  })
})
