import { describe, expect, it } from 'vitest'
import { createRng } from '@/avEvolution/core/rng'
import { aggregateFitness, DEFAULT_ES_CONFIG, type EvaluateGenome } from './es'
import { alignNeurons, crossoverNeurons, DEFAULT_ISLANDS, freshGenome, initialIslands, IslandEs, neuronBlock, sampleInputs, setNeuronBlock } from './islands'
import { applyCurriculum, DEFAULT_CURRICULUM, initialCurriculum, updateCurriculum } from './curriculum'
import { buildCourse, courseKey, parseCourseKey } from './courses'
import { GENOME_LENGTH, N_HIDDEN, policyForward } from './policy'

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
  it('field difficulty scales box count and size; difficulty 1 is the unchanged course', () => {
    const easy = buildCourse('field', 3, 0, 0.2)
    const full = buildCourse('field', 3)
    expect(easy.boxes.length).toBeLessThan(full.boxes.length)
    expect(buildCourse('field', 3, 0, 1)).toEqual(full)
    expect(parseCourseKey('field:3~2@0.4')).toEqual({ kind: 'field', seed: 3, variant: 2, difficulty: 0.4 })
    expect(courseKey('field', 3, 2, 0.4)).toBe('field:3~2@0.4')
    expect(() => parseCourseKey('field:3@2')).toThrow()
  })

  it('steps up only after enough successful generations, never past 1', () => {
    let s = initialCurriculum()
    for (let i = 0; i < DEFAULT_CURRICULUM.minSteps - 1; i++) s = updateCurriculum(s, 1)
    expect(s.difficulty).toBe(0.2)
    s = updateCurriculum(s, 1)
    expect(s.difficulty).toBeCloseTo(0.3)
    for (let i = 0; i < 400; i++) s = updateCurriculum(s, 1)
    expect(s.difficulty).toBe(1)
    let low = initialCurriculum()
    for (let i = 0; i < 50; i++) low = updateCurriculum(low, 0.1)
    expect(low.difficulty).toBe(0.2)
  })

  it('applyCurriculum only touches field keys', () => {
    const s = { difficulty: 0.5, ema: 0, sinceStep: 0 }
    const keys = applyCurriculum(['field:1~3', 'slalom:1~3', 'maze:1~3'], s, 7)
    expect(keys[1]).toBe('slalom:1~3')
    expect(keys[2]).toBe('maze:1~3')
    expect(parseCourseKey(keys[0]!).difficulty).toBeLessThanOrEqual(0.5)
    expect(applyCurriculum(['field:1~3'], { difficulty: 1, ema: 0, sinceStep: 0 }, 7)).toEqual(['field:1~3'])
  })
})
