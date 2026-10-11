import { describe, expect, it } from 'vitest'
import { createRng } from '@/avEvolution/core/rng'
import { aggregateFitness, DEFAULT_ES_CONFIG, type EvaluateGenome } from './es'
import { alignNeurons, crossoverNeurons, DEFAULT_ISLANDS, FOCUS_MAX_EPOCHS, freshGenome, initialIslands, IslandEs, neuronBlock, sampleInputs, setNeuronBlock, SIGMA_BOOST_MAX, SIGMA_BOOST_STEP, sigmaBoost, STAGNATION_EPOCHS } from './islands'
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
    const { event } = isl.reproduce([[3], [2], [1]])
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
        const { event } = isl.reproduce(scores.map((s) => [s]))
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

describe('stagnation-driven sigma boost', () => {
  // mature = 1000: no island is ever replaced here, so the boost logic is observed in isolation
  const esCfg = { ...DEFAULT_ES_CONFIG, dim: GENOME_LENGTH, pairs: 2, seed: 3 }
  const cfg = { ...DEFAULT_ISLANDS, epoch: 5, mature: 1000, pCross: 0 }
  const evaluate: EvaluateGenome = async () => [{ norm: 0 } as never]
  /** scalar epoch scores as one-element score vectors (the shape reproduce expects) */
  const vecs = (...s: number[]) => s.map((x) => [x])

  it('sigmaBoost stays 1 up to STAGNATION_EPOCHS, then grows by SIGMA_BOOST_STEP per stagnant epoch, capped at SIGMA_BOOST_MAX', () => {
    expect(sigmaBoost(undefined)).toBe(1)
    expect(sigmaBoost(0)).toBe(1)
    expect(sigmaBoost(STAGNATION_EPOCHS)).toBe(1)
    expect(sigmaBoost(STAGNATION_EPOCHS + 1)).toBeCloseTo(SIGMA_BOOST_STEP, 12)
    expect(sigmaBoost(STAGNATION_EPOCHS + 2)).toBeCloseTo(SIGMA_BOOST_STEP ** 2, 12)
    expect(sigmaBoost(50)).toBe(SIGMA_BOOST_MAX)
  })

  it('no boost while every island improves: counters stay 0, step applies the base sigma', async () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    for (let e = 0; e < STAGNATION_EPOCHS + 2; e++) {
      isl.reproduce(vecs(1 + e, 0.9 + e, 0.8 + e))
      expect(isl.state.islands.every((x) => x.stagn === 0)).toBe(true)
      expect(isl.state.islands.map((_, k) => isl.boost(k))).toEqual([1, 1, 1])
    }
    await isl.step(evaluate, ['k'])
    isl.engines.forEach((e) => expect(e.cfg.sigma).toBe(esCfg.sigma))
  })

  it('a stagnating island boosts its sigma; the first improvement resets it to the base level', async () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.reproduce(vecs(1, 0.5, 0.4))
    for (let e = 0; e < STAGNATION_EPOCHS; e++) isl.reproduce(vecs(1 + 0.1 * (e + 1), 0.5, 0.4))
    expect(isl.boost(1)).toBe(1) // exactly at the threshold: not yet
    isl.reproduce(vecs(2, 0.5, 0.4))
    expect(isl.boost(1)).toBeCloseTo(SIGMA_BOOST_STEP, 12)
    expect(isl.boost(2)).toBeCloseTo(SIGMA_BOOST_STEP, 12)
    expect(isl.boost(0)).toBe(1)
    await isl.step(evaluate, ['k'])
    expect(isl.engines[1]!.cfg.sigma).toBeCloseTo(esCfg.sigma * SIGMA_BOOST_STEP, 12)
    expect(isl.engines[0]!.cfg.sigma).toBe(esCfg.sigma)
    // island 1 finds an improvement: boost immediately back to normal (no slow decay that could stay stuck high)
    isl.reproduce(vecs(2, 0.9, 0.4))
    expect(isl.state.islands[1]!.stagn).toBe(0)
    expect(isl.boost(1)).toBe(1)
    await isl.step(evaluate, ['k'])
    expect(isl.engines[1]!.cfg.sigma).toBe(esCfg.sigma)
  })

  it('the boost is capped at SIGMA_BOOST_MAX during long stagnation', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.reproduce(vecs(1, 0.5, 0.4))
    for (let e = 0; e < 20; e++) isl.reproduce(vecs(1, 0.5, 0.4))
    expect(isl.boost(1)).toBe(SIGMA_BOOST_MAX)
    expect(isl.boost(2)).toBe(SIGMA_BOOST_MAX)
  })

  it('global stagnation boosts even improving islands while the global best stalls', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.reproduce(vecs(1, 0.5, 0.4))
    for (let e = 0; e < STAGNATION_EPOCHS + 1; e++) isl.reproduce(vecs(0.9, 0.6 + 0.1 * e, 0.3))
    // island 1 improves every epoch, but the GLOBAL best (1.0) never moves: every island gets the boost
    expect(isl.state.islands[1]!.stagn).toBe(0)
    expect(isl.state.globalStagn).toBe(STAGNATION_EPOCHS + 1)
    isl.state.islands.forEach((_, k) => expect(isl.boost(k)).toBeCloseTo(SIGMA_BOOST_STEP, 12))
  })

  it('state files from before the boost (no stagn fields) behave as never stagnant', () => {
    const state = initialIslands(esCfg, cfg)
    state.islands.forEach((x) => delete x.stagn)
    delete state.globalStagn
    const isl = new IslandEs(esCfg, cfg, state)
    isl.state.islands.forEach((_, k) => expect(isl.boost(k)).toBe(1))
  })

  it('ranks islands lexicographically: an equal min is decided by the second-worst, a better min dominates', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.state.islands.forEach((x) => (x.age = 1000))
    const { best, event } = isl.reproduce([[0, 0.9], [0, 0.8], [0.5, 0.1]])
    expect(best).toBe(2) // the better MIN wins whatever the second values are
    expect(event!.replaced).toBe(1) // equal mins: the weaker second-worst is the worst mature island
    expect(event!.scores).toEqual([0, 0, 0.5]) // the event log keeps the scalar mins
  })

  it('stagnation resets only on a lexicographic improvement beyond STAGNATION_EPSILON (task iv)', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    // islands 1+2 move in step with island 0 (improve when it improves): otherwise the focus mode below would enter
    // (they stagnate while 0 improves) and freeze island 0's bookkeeping — this test is about island 0's epsilon bound
    isl.reproduce([[0, 0.5], [0.1], [0.05]])
    expect(isl.state.islands[0]!.bestScoreVec).toEqual([0, 0.5])
    isl.reproduce([[0, 0.5005], [0.1], [0.05]]) // second-worst +0.0005 <= STAGNATION_EPSILON: not an improvement
    expect(isl.state.islands[0]!.stagn).toBe(1)
    isl.reproduce([[0, 0.51], [0.11], [0.06]]) // second-worst +0.01 > STAGNATION_EPSILON: improvement -> reset
    expect(isl.state.islands[0]!.stagn).toBe(0)
    isl.reproduce([[0, 0.51], [0.11], [0.06]]) // identical vectors: stagnant again
    expect(isl.state.islands[0]!.stagn).toBe(1)
    isl.reproduce([[0.02, 0.01], [0.12], [0.07]]) // a better MIN (worse rest) is still a lex improvement
    expect(isl.state.islands[0]!.stagn).toBe(0)
    expect(isl.state.islands[0]!.bestScoreVec).toEqual([0.02, 0.01])
  })

  it('state files from before the lex vectors (bestScore/globalBest only) anchor on the first epoch and behave as never stagnant', () => {
    const state = initialIslands(esCfg, cfg)
    state.islands.forEach((x) => {
      x.bestScore = 5
      delete x.stagn
    })
    state.globalBest = 5
    const isl = new IslandEs(esCfg, cfg, state)
    isl.reproduce(vecs(1, 1, 1))
    expect(isl.state.islands.every((x) => x.stagn === 0)).toBe(true)
    expect(isl.state.islands.every((x) => x.bestScoreVec?.[0] === 1)).toBe(true)
    expect(isl.state.globalBestVec).toEqual([1])
    expect(isl.state.islands.every((x) => x.bestScore === 5)).toBe(true) // the scalar fields are left untouched
  })
})

describe('focus mode', () => {
  // mature = 1000: no island is ever replaced here, so the focus logic is observed in isolation
  const esCfg = { ...DEFAULT_ES_CONFIG, dim: GENOME_LENGTH, pairs: 2, seed: 3 }
  const cfg = { ...DEFAULT_ISLANDS, epoch: 5, mature: 1000, pCross: 0 }
  const evaluate: EvaluateGenome = async () => [{ norm: 0 } as never]
  const vecs = (...s: number[]) => s.map((x) => [x])

  it('focuses the stagnant islands, the others pause with their state untouched (i)', async () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.reproduce(vecs(1, 0.5, 0.4)) // anchor epoch: nothing stagnates
    expect(isl.state.focus).toBeUndefined()
    await isl.step(evaluate, ['k']) // one NORMAL-mode step: sets every island's lastCenter
    isl.reproduce(vecs(2, 0.5, 0.4)) // island 0 improves, islands 1+2 stagnate
    expect(isl.state.focus).toEqual({ set: [1, 2], epochs: 0, sinceGen: 1 })
    const before = JSON.parse(JSON.stringify(isl.state.islands[0]))
    const age1 = isl.state.islands[1]!.age
    const r1 = await isl.step(evaluate, ['k'])
    expect(r1.paused).toEqual([0])
    expect(isl.state.islands[0]).toEqual(before) // frozen: es, age, stagn, lastCenter all untouched
    expect(r1.reports[0]!.center).toBe(before.lastCenter) // the frozen center repeats in the report
    expect(r1.reports[0]!.centerMetrics).toBeUndefined()
    expect(r1.reports[0]!.episodes).toBe(0)
    expect(isl.state.islands[1]!.age).toBe(age1 + 1) // the focused island steps
    expect(r1.reports[1]!.episodes).toBeGreaterThan(0)
  })

  it('a focused island leaves on a lexicographic improvement; all over the hump -> normal (ii)', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.reproduce(vecs(1, 0.5, 0.4))
    isl.reproduce(vecs(2, 0.5, 0.4))
    expect(isl.state.focus?.set).toEqual([1, 2])
    isl.reproduce(vecs(3, 0.9, 0.4)) // island 1 improves, island 2 does not
    expect(isl.state.focus?.set).toEqual([2])
    expect(isl.state.islands[1]!.stagn).toBe(0)
    expect(isl.state.islands[2]!.stagn).toBe(2)
    isl.reproduce(vecs(4, 0.9, 0.8)) // island 2 improves too: the focus ends completely
    expect(isl.state.focus).toBeUndefined()
    expect(isl.state.islands[2]!.stagn).toBe(0)
  })

  it('FOCUS_MAX_EPOCHS ends the focus and resets the stagn counters (iii)', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    isl.reproduce(vecs(1, 0.5, 0.4))
    isl.reproduce(vecs(2, 0.5, 0.4))
    expect(isl.state.focus?.set).toEqual([1, 2])
    for (let e = 0; e < FOCUS_MAX_EPOCHS - 1; e++) isl.reproduce(vecs(3 + e, 0.5, 0.4))
    expect(isl.state.focus).toBeDefined() // still inside the cap
    expect(isl.state.islands[2]!.stagn).toBe(FOCUS_MAX_EPOCHS)
    isl.reproduce(vecs(10, 0.5, 0.4)) // the cap epoch: back to normal, counters reset
    expect(isl.state.focus).toBeUndefined()
    expect(isl.state.islands[1]!.stagn).toBe(0)
    expect(isl.state.islands[2]!.stagn).toBe(0)
    isl.reproduce(vecs(11, 0.5, 0.4)) // hysteresis: fresh stagnation re-enters focus from zero
    expect(isl.state.focus?.set).toEqual([1, 2])
    expect(isl.state.focus?.epochs).toBe(0)
  })

  it('no focus while everything improves (iv)', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    for (let e = 0; e < STAGNATION_EPOCHS + 2; e++) isl.reproduce(vecs(1 + e, 0.9 + e, 0.8 + e))
    expect(isl.state.islands.every((x) => x.stagn === 0)).toBe(true)
    expect(isl.state.focus).toBeUndefined()
    // all islands stagnant = nobody to pause = normal operation (the global boost covers it)
    isl.reproduce(vecs(1, 1, 1))
    expect(isl.state.focus).toBeUndefined()
  })

  it('pre-focus state files run in normal mode; a saved focus resumes paused (v)', async () => {
    const state = initialIslands(esCfg, cfg)
    delete state.focus // pre-focus state files have no focus field
    const isl = new IslandEs(esCfg, cfg, state)
    const r = await isl.step(evaluate, ['k'])
    expect(r.paused).toEqual([]) // no focus in the file: every island steps
    expect(isl.state.islands.every((x) => x.age === 1)).toBe(true)
    const state2 = initialIslands(esCfg, cfg)
    state2.focus = { set: [1], epochs: 1, sinceGen: 5 }
    const isl2 = new IslandEs(esCfg, cfg, state2)
    const r2 = await isl2.step(evaluate, ['k'])
    expect(r2.paused).toEqual([0, 2])
    expect(isl2.state.islands[0]!.age).toBe(0) // paused islands do not age
    expect(isl2.state.islands[1]!.age).toBe(1)
  })

  it('global stagnation without individual stagnation focuses the worst-ranked island; paused bookkeeping is frozen', () => {
    const isl = new IslandEs(esCfg, cfg, initialIslands(esCfg, cfg))
    // a historical global best from a dead lineage: no island ever beats it, but each improves on its OWN best
    isl.state.globalBestVec = [10]
    isl.reproduce(vecs(1, 0.9, 0.8)) // anchor: all islands individually fresh, global best stale
    expect(isl.state.globalStagn).toBe(1)
    expect(isl.state.focus?.set).toEqual([2]) // the worst-ranked island is focused
    isl.reproduce(vecs(0.5, 0.4, 0.5)) // paused 0+1 score worse: FROZEN (a frozen center cannot "improve" or "stagnate")
    expect(isl.state.islands[0]!.stagn).toBe(0)
    expect(isl.state.islands[0]!.bestScoreVec).toEqual([1])
    expect(isl.state.islands[2]!.stagn).toBe(1) // the focused island keeps its bookkeeping
    expect(isl.state.focus?.set).toEqual([2])
    isl.reproduce(vecs(0.5, 0.4, 1.8)) // the focused island improves over its pre-focus best: over the hump
    expect(isl.state.focus).toBeUndefined()
    expect(isl.state.islands[2]!.stagn).toBe(0)
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
