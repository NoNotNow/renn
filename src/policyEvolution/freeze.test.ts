import { describe, expect, it } from 'vitest'
import { createRng } from '@/avEvolution/core/rng'
import { DEFAULT_ES_CONFIG, PolicyEs, type EsConfig, type EvaluateGenome } from './es'
import { freezeOldMask, genomeLengthV3, genomeShape, N_IN_V3, N_OUT, policyForwardV3, widenHidden } from './policy'
import { DEFAULT_ISLANDS, initialIslands, IslandEs, type IslandsConfig } from './islands'

/**
 * Widen-freeze phase 1 (see agent-context/feature-policy-evolution.md): a warm genome widened by `widenHidden` keeps
 * its function because the new units start with zero OUTGOING weights — the old behavior lives in FOUR sets (old W1
 * rows, old b1, old W2 columns, both b2), so the freeze mask must cover exactly those. The tests here pin:
 *  (a) frozen dims stay BIT-IDENTICAL over ES steps (eps zeroed AND weightDecay suspended), free dims move;
 *  (b) the mask layout covers exactly the four old sets — and freezing only the old INCOMING weights is NOT enough
 *      (the counter-test: the wrong mask moves the old behavior, the right mask keeps it recoverable);
 *  (c) the mask persists with the EsConfig (JSON round trip = the run file), so a resume keeps it.
 */

const oldH = 2
const newH = 5
const rng = createRng(11)
const warm = Array.from({ length: genomeLengthV3(oldH) }, () => rng.next() * 2 - 1)
const widened = widenHidden(warm, newH, createRng(7))
const len = widened.length

/** the four sets the old function lives in (layout: W1 | b1 | W2 | b2 of the WIDENED genome) */
function expectedFrozen(): Set<number> {
  const { nIn, hidden: H } = genomeShape(len)
  const frozen = new Set<number>()
  for (let j = 0; j < oldH; j++) {
    for (let i = 0; i < nIn; i++) frozen.add(j * nIn + i) // old W1 row
    frozen.add(H * nIn + j) // old b1
    for (let k = 0; k < N_OUT; k++) frozen.add(H * nIn + H + k * H + j) // old W2 column (stride newH)
  }
  frozen.add(len - 2)
  frozen.add(len - 1) // both b2
  return frozen
}

const maskOf = (frozen: Set<number>) => Array.from({ length: len }, (_, d) => frozen.has(d))
/** the WRONG mask of the counter-test: only the old INCOMING weights (old W1 rows + old b1) are frozen */
function wrongIncomingOnlyMask(): boolean[] {
  const { nIn, hidden: H } = genomeShape(len)
  const frozen = new Set<number>()
  for (let j = 0; j < oldH; j++) {
    for (let i = 0; i < nIn; i++) frozen.add(j * nIn + i)
    frozen.add(H * nIn + j)
  }
  return maskOf(frozen)
}

/** an ES state holding the widened warm genome (the runner's warm start) */
const widenedState = () => ({
  gen: 0,
  theta: widened.slice(),
  m: new Array<number>(len).fill(0),
  v: new Array<number>(len).fill(0),
  adamT: 0,
  rngState: createRng(0).getState(),
})

/** evaluator that rewards GROWING weights: every free dim gets a nonzero gradient immediately */
const grow: EvaluateGenome = async (g) => [{ norm: g.reduce((a, x) => a + x, 0) } as never]

const sampleInputs = () =>
  Array.from({ length: 24 }, () => Array.from({ length: N_IN_V3 }, () => rng.next() * 2 - 1))

/** the genome with the NEW units' outgoing weights zeroed: what the old function is recoverable with */
function zeroNewOutgoing(g: number[]): number[] {
  const { nIn, hidden: H } = genomeShape(g.length)
  const out = g.slice()
  for (let j = oldH; j < H; j++) for (let k = 0; k < N_OUT; k++) out[H * nIn + H + k * H + j] = 0
  return out
}

describe('freezeOldMask layout', () => {
  it('freezes exactly the four old sets: old W1 rows, old b1, old W2 columns, both b2 — everything else is free', () => {
    const mask = freezeOldMask(len, oldH)
    const frozen = expectedFrozen()
    expect(mask).toEqual(Array.from({ length: len }, (_, d) => frozen.has(d)))
    // free = exactly the new units' parameters: (newH - oldH) x (nIn + 1 + N_OUT)
    const { nIn } = genomeShape(len)
    expect(mask.filter((f) => !f).length).toBe((newH - oldH) * (nIn + 1 + N_OUT))
  })

  it('refuses a mask without a widening (oldH >= newH) or a non-positive oldH', () => {
    expect(() => freezeOldMask(len, newH)).toThrow()
    expect(() => freezeOldMask(len, 0)).toThrow()
  })
})

describe('PolicyEs with a freeze mask (phase 1)', () => {
  const cfg = (freeze?: boolean[]): EsConfig => ({ ...DEFAULT_ES_CONFIG, dim: len, pairs: 8, seed: 3, ...(freeze ? { freeze } : {}) })

  it('frozen dims stay BIT-IDENTICAL over steps, free dims move (both eps and weightDecay are suspended there)', async () => {
    const mask = freezeOldMask(len, oldH)
    const es = new PolicyEs(cfg(mask), widenedState())
    const before = es.state.theta.slice()
    for (let g = 0; g < 5; g++) await es.step(grow, ['k'])
    for (let d = 0; d < len; d++) {
      if (mask[d]) expect(es.state.theta[d]).toBe(before[d]!) // exactly equal, not close
      else expect(es.state.theta[d]).not.toBe(before[d]!) // the grow evaluator moves every free dim
    }
  })

  it('weightDecay is suspended on frozen dims: a constant evaluator still moves every dim without the mask', async () => {
    const flat: EvaluateGenome = async () => [{ norm: 1 } as never]
    const mask = freezeOldMask(len, oldH)
    const frozen = new PolicyEs(cfg(mask), widenedState())
    for (let g = 0; g < 5; g++) await frozen.step(flat, ['k'])
    // control: the same run WITHOUT the mask — the tiny weightDecay gradient is all the ranking (all candidates tie)
    // leaves, and Adam normalizes it into an ~lr oscillation, so every initialized dim MOVES (the old behavior)
    const control = new PolicyEs(cfg(), widenedState())
    for (let g = 0; g < 5; g++) await control.step(flat, ['k'])
    for (let d = 0; d < len; d++) {
      if (mask[d]) expect(frozen.state.theta[d]).toBe(widened[d]!) // exactly equal: decay suspended, eps zeroed
      if (widened[d] !== 0) expect(control.state.theta[d]).not.toBe(widened[d]!) // moved (oscillated around 0)
    }
  })

  it('the mask persists through the run file (EsConfig JSON round trip) and keeps freezing after it', async () => {
    const mask = freezeOldMask(len, oldH)
    const persisted = JSON.parse(JSON.stringify(cfg(mask))) as EsConfig
    expect(persisted.freeze).toEqual(mask)
    const es = new PolicyEs(persisted, widenedState())
    const before = es.state.theta.slice()
    for (let g = 0; g < 2; g++) await es.step(grow, ['k'])
    for (let d = 0; d < len; d++) if (mask[d]) expect(es.state.theta[d]).toBe(before[d]!)
  })

  it('the CORRECT mask keeps the old function recoverable: zeroing the new units restores the original forward exactly', async () => {
    const mask = freezeOldMask(len, oldH)
    const es = new PolicyEs(cfg(mask), widenedState())
    for (let g = 0; g < 4; g++) await es.step(grow, ['k'])
    const restored = zeroNewOutgoing(es.state.theta)
    for (const x of sampleInputs()) expect(policyForwardV3(restored, x)).toEqual(policyForwardV3(warm, x))
  })

  it('COUNTER-TEST: an "only old incoming weights" mask DOES change the forward output (old W2 / b2 must be frozen too)', async () => {
    const wrong = wrongIncomingOnlyMask()
    const es = new PolicyEs(cfg(wrong), widenedState())
    for (let g = 0; g < 4; g++) await es.step(grow, ['k'])
    const restored = zeroNewOutgoing(es.state.theta)
    const xs = sampleInputs()
    expect(xs.some((x) => policyForwardV3(restored, x)[0] !== policyForwardV3(warm, x)[0])).toBe(true)
  })
})

describe('IslandEs replacement is blocked while the freeze mask is active', () => {
  const esCfg = (freeze?: boolean[]): EsConfig => ({ ...DEFAULT_ES_CONFIG, dim: 31, pairs: 4, seed: 2, ...(freeze ? { freeze } : {}) })
  const islCfg: IslandsConfig = { ...DEFAULT_ISLANDS, islands: 3, epoch: 5, mature: 0 }

  const scores = [
    [1, 0],
    [2, 0],
    [0.5, 0],
  ]

  it('no crossover / immigrant event while config.freeze is set; the bookkeeping still runs', () => {
    const state = initialIslands(esCfg(new Array<boolean>(31).fill(true)), islCfg)
    const isl = new IslandEs(esCfg(new Array<boolean>(31).fill(true)), islCfg, state)
    const before = state.islands.map((i) => ({ theta: i.es.theta.slice(), age: i.age }))
    const { best, event } = isl.reproduce(scores)
    expect(event).toBeUndefined()
    expect(best).toBe(1)
    expect(state.events).toHaveLength(0)
    expect(state.islands.map((i) => i.es.theta)).toEqual(before.map((b) => b.theta))
    // stagnation / global bookkeeping keeps running: the first epoch anchors the baselines (never stagnant), the
    // second makes the worst island stagnate and the global best sticks at the best score
    isl.reproduce(scores)
    expect(state.islands[2]!.stagn).toBe(1)
    expect(state.globalBest).toBe(2)
  })

  it('without a mask the same ranking DOES replace the mature worst island (the old behavior)', () => {
    const state = initialIslands(esCfg(), islCfg)
    const isl = new IslandEs(esCfg(), islCfg, state)
    const { event } = isl.reproduce(scores)
    expect(event).toBeDefined()
    expect(state.events).toHaveLength(1)
  })
})
