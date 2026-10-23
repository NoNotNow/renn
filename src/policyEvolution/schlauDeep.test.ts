import { describe, expect, it } from 'vitest'
import { createRng } from '@/avEvolution/core/rng'
import type { RennWorld } from '@/types/world'
import { GENOME_LENGTH, GENOME_LENGTH_V2, N_RAYS } from './policy'
import { DEFAULT_ES_CONFIG } from './es'
import { DEFAULT_ISLANDS, initialIslands, IslandEs } from './islands'
import { freshGenome } from './islands'
import { buildSchlauTask } from './schlauCourses'
import { buildSchlauWorld } from './schlauEpisode'
import { genomeLengthSchlau, hiddenOfSchlau, N_IN_SCHLAU, POLICY_STAGE_CODE_SCHLAU, policyForwardSchlau } from './schlauPolicy'
import {
  SCHLAU2_NET,
  freezeOldMaskSchlau2,
  freshGenomeSchlau2,
  genomeLengthSchlau2,
  hiddenOfSchlau2,
  policyForwardSchlau2,
  schlauNetOf,
  widenHiddenSchlau2,
} from './schlauDeep'
import { applySchlauCandidate, buildSchlauTrainingWorld, placeholderSchlauGenome, SCHLAU_TRAINING_WORLDS } from './schlauTraining'
import { SCHLAU_MAZE_WORLDS, buildSchlauMazeWorld } from './schlauMaze'

// --- stage harness (the same minimal api as schlauPolicy.test.ts: flat ground, identity heading, every ray hits at 20 m) ---

const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
const api = {
  getUpVector: () => [0, 1, 0],
  getForwardVector: () => [0, 0, 1],
  vec: {
    normalize: (v: number[]) => {
      const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
      return [v[0]! / l, v[1]! / l, v[2]! / l]
    },
    projectOntoPlane: (v: number[], n: number[]) => {
      const d = dot(v, n)
      return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
    },
    cross: (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
    dot,
  },
  raycast: () => ({ hit: true, distance: 20 }),
  visualizeLine: () => {},
}

function runStage(params: Record<string, unknown>, input: () => Record<string, unknown> = () => ({}), frames = 1) {
  const transform = new Function(`${POLICY_STAGE_CODE_SCHLAU}\nreturn transform`)() as (
    i: Record<string, unknown>,
    dt: number,
    p: unknown,
    s: unknown,
    a: unknown,
  ) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: any = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inp: any
  for (let f = 0; f < frames; f++) {
    inp = { position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 6], angularVelocity: [0, 0, 0], actions: {}, ...input() }
    transform(inp, 1 / 60, params, state, api)
  }
  return { inp, state }
}

/** the input vector the stage builds on frame 1 for a car at the origin heading +z, 6 m/s, goal 30 m straight ahead */
const stageInputs = (): number[] => [
  ...new Array(N_RAYS).fill(1 - 20 / 50),
  6 / 30,
  ...new Array(8).fill(0),
  1,
  0,
  Math.min(30 / 60, 1),
]

describe('schlau v2 (deep) genome shape', () => {
  it('has its OWN length formula (H^2 + 30 H + 2, two hidden layers of equal width H) with a round-trip hidden size', () => {
    expect(genomeLengthSchlau2(10)).toBe(10 * 10 + 30 * 10 + 2)
    expect(hiddenOfSchlau2(genomeLengthSchlau2(10))).toBe(10)
    expect(hiddenOfSchlau2(genomeLengthSchlau2(10) + 1)).toBe(0)
    expect(hiddenOfSchlau2(genomeLengthSchlau(10))).toBe(0)
    expect(SCHLAU2_NET).toBe('schlau2')
  })

  it('FORBIDS widths that collide with the 1-layer formula (h % 29 in {0, 28}: len = 29 H + 2 both ways)', () => {
    // h = 28: len 1626 = the 1-layer length of H = 56 — the two nets would be indistinguishable by length
    expect(() => genomeLengthSchlau2(28)).toThrow(/29/)
    expect(() => genomeLengthSchlau2(29)).toThrow(/29/)
    // the 1-layer length of the colliding width is NOT deep (hiddenOfSchlau2 must not claim it)
    expect(hiddenOfSchlau(genomeLengthSchlau(56))).toBe(56)
    expect(hiddenOfSchlau2(genomeLengthSchlau(56))).toBe(0)
  })

  it('deep and 1-layer lengths are DISJOINT: every valid deep length is rejected by hiddenOfSchlau and vice versa (the guard property)', () => {
    for (let h = 1; h <= 64; h++) {
      if (h % 29 === 0 || h % 29 === 28) continue
      const len = genomeLengthSchlau2(h)
      expect(hiddenOfSchlau(len)).toBe(0)
      expect(schlauNetOf(len)).toBe('schlau2')
    }
    for (let H = 1; H <= 200; H++) {
      const len = genomeLengthSchlau(H)
      expect(hiddenOfSchlau2(len)).toBe(0)
      expect(schlauNetOf(len)).toBe('schlau')
    }
    // v1 / v2 / garbage lengths resolve to NO schlau net at all
    expect(schlauNetOf(GENOME_LENGTH)).toBeNull()
    expect(schlauNetOf(GENOME_LENGTH_V2)).toBeNull()
    expect(schlauNetOf(3)).toBeNull()
  })
})

describe('schlau v2 forward pass', () => {
  it('a zero deep genome outputs zero steer / zero gas; a wrong length throws', () => {
    const g = new Array<number>(genomeLengthSchlau2(4)).fill(0)
    const x = new Array<number>(N_IN_SCHLAU).fill(0.3)
    expect(policyForwardSchlau2(g, x)).toEqual([0, 0])
    expect(() => policyForwardSchlau2([1, 2, 3], x)).toThrow()
    // a 1-layer length is not a deep genome
    expect(() => policyForwardSchlau2(new Array<number>(genomeLengthSchlau(4)).fill(0), x)).toThrow()
  })

  it('the worked example: all-zero genome except the LAST bias (the gas bias b3[1]) reads tanh(0.5) on the gas output', () => {
    const g = new Array<number>(genomeLengthSchlau2(3)).fill(0)
    g[g.length - 1] = 0.5
    const [steer, gas] = policyForwardSchlau2(g, new Array<number>(N_IN_SCHLAU).fill(0.2))
    expect(steer).toBe(0)
    expect(gas).toBeCloseTo(Math.tanh(0.5), 12)
  })

  it('equals an independently written 2-layer pass on random genomes and inputs (W1 | b1 | W2 | b2 | W3 | b3 layout)', () => {
    const rng = createRng(31)
    for (const h of [3, 5, 8]) {
      const g = freshGenomeSchlau2(rng, 0.5, h)
      const nIn = N_IN_SCHLAU
      const o1 = h * nIn + h
      const o2 = o1 + h * h
      const o3 = o2 + h
      for (let t = 0; t < 5; t++) {
        const x = Array.from({ length: nIn }, () => rng.next() * 2 - 1)
        const [steer, gas] = policyForwardSchlau2(g, x)
        // layer 1
        const h1: number[] = []
        for (let j = 0; j < h; j++) {
          let s = g[h * nIn + j]!
          for (let i = 0; i < nIn; i++) s += g[j * nIn + i]! * x[i]!
          h1.push(Math.tanh(s))
        }
        // layer 2 (W2 rows = layer-2 units, columns = layer-1 units)
        const h2: number[] = []
        for (let j = 0; j < h; j++) {
          let s = g[o2 + j]!
          for (let i = 0; i < h; i++) s += g[o1 + j * h + i]! * h1[i]!
          h2.push(Math.tanh(s))
        }
        // outputs
        const out = [0, 1].map((k) => {
          let s = g[o3 + 2 * h + k]!
          for (let j = 0; j < h; j++) s += g[o3 + k * h + j]! * h2[j]!
          return Math.tanh(s)
        })
        expect(steer).toBeCloseTo(out[0]!, 12)
        expect(gas).toBeCloseTo(out[1]!, 12)
      }
    }
  })

  it('the dual-mode stage forward equals the reference: a DEEP genome through the new stage code', () => {
    const g = freshGenomeSchlau2(createRng(21), 0.5, 6)
    const { inp, state } = runStage({ w: g, gain: 1200, goal: [0, 30] })
    const [steer, gas] = policyForwardSchlau2(g, stageInputs())
    expect(stageInputs().length).toBe(N_IN_SCHLAU)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
    expect(inp.actions.steering_angle).toBeCloseTo(Math.abs(steer) < 1e-4 ? 1e-4 : steer, 9)
  })

  it('the dual-mode stage stays bit-compatible for 1-LAYER genomes (the fallback head keeps working through the new code)', () => {
    const g = freshGenome(createRng(22), 0.5, N_IN_SCHLAU, 8)
    const { state } = runStage({ w: g, gain: 1200, goal: [0, 30] })
    const [steer, gas] = policyForwardSchlau(g, stageInputs())
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
  })
})

describe('schlau v2 fresh genome / widen / freeze', () => {
  it('a fresh deep genome carries the +0.5 speed-target start prior on the LAST weight (b3[1])', () => {
    const g = freshGenomeSchlau2(createRng(3), 0.3, 6)
    expect(g.length).toBe(genomeLengthSchlau2(6))
    expect(g[g.length - 1]).toBe(0.5)
  })

  it('widenHiddenSchlau2 preserves the function EXACTLY (new units start silent) and throws on shrink / forbidden widths', () => {
    const rng = createRng(5)
    const g = freshGenomeSchlau2(rng, 0.4, 4)
    const g2 = widenHiddenSchlau2(g, 7, rng)
    expect(g2.length).toBe(genomeLengthSchlau2(7))
    expect(hiddenOfSchlau2(g2.length)).toBe(7)
    for (let t = 0; t < 20; t++) {
      const x = Array.from({ length: N_IN_SCHLAU }, () => rng.next() * 2 - 1)
      const before = policyForwardSchlau2(g, x)
      const after = policyForwardSchlau2(g2, x)
      expect(after[0]).toBeCloseTo(before[0], 12)
      expect(after[1]).toBeCloseTo(before[1], 12)
    }
    expect(() => widenHiddenSchlau2(g, 3, rng)).toThrow()
    expect(() => widenHiddenSchlau2(g, 28, rng)).toThrow(/29/)
    // a 1-layer genome is never widened by the deep helper (the shape collision guard)
    expect(() => widenHiddenSchlau2(new Array<number>(genomeLengthSchlau(4)).fill(0), 7, rng)).toThrow()
  })

  it('freezeOldMaskSchlau2 freezes exactly the old function (frozen count = old genome length) and frees the new units\u2019 parameters', () => {
    const oldH = 4
    const newH = 7
    const mask = freezeOldMaskSchlau2(genomeLengthSchlau2(newH), oldH)
    expect(mask.length).toBe(genomeLengthSchlau2(newH))
    // the frozen set has exactly the size of the OLD genome — everything the old function lives in
    expect(mask.filter((f) => f)).toHaveLength(genomeLengthSchlau2(oldH))
    const free = mask.flatMap((f, i) => (f ? [] : [i]))
    const nIn = N_IN_SCHLAU
    const b1 = newH * nIn
    const o1 = b1 + newH
    const o2 = o1 + newH * newH
    const o3 = o2 + newH
    const expected: number[] = []
    for (let j = oldH; j < newH; j++) for (let i = 0; i < nIn; i++) expected.push(j * nIn + i) // new W1 rows
    for (let j = oldH; j < newH; j++) expected.push(b1 + j) // new b1
    for (let j2 = 0; j2 < newH; j2++) for (let i1 = oldH; i1 < newH; i1++) expected.push(o1 + j2 * newH + i1) // W2 new columns (new h1 units, silent)
    for (let j2 = oldH; j2 < newH; j2++) for (let i1 = 0; i1 < oldH; i1++) expected.push(o1 + j2 * newH + i1) // W2 new rows (new h2 units, random incoming)
    for (let j = oldH; j < newH; j++) expected.push(o2 + j) // new b2
    for (let k = 0; k < 2; k++) for (let j = oldH; j < newH; j++) expected.push(o3 + k * newH + j) // new W3 columns (silent)
    expect(free.length).toBe(expected.length)
    expect(new Set(free)).toEqual(new Set(expected))
    // the output biases b3 (the LAST two weights) stay frozen, like freezeOldMask freezes both b2
    expect(mask[genomeLengthSchlau2(newH) - 1]).toBe(true)
    expect(mask[genomeLengthSchlau2(newH) - 2]).toBe(true)
    expect(() => freezeOldMaskSchlau2(genomeLengthSchlau2(7), 7)).toThrow()
    expect(() => freezeOldMaskSchlau2(genomeLengthSchlau(10), 4)).toThrow(/deep/)
  })
})

describe('schlau shape guards accept BOTH nets (the deep candidates must drive the same worlds)', () => {
  it('applySchlauCandidate swaps a deep genome and a 1-layer genome; refuses anything else', () => {
    const world = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    const deep = freshGenomeSchlau2(createRng(41), 0.3, 6)
    const swapped = applySchlauCandidate(world, deep)
    const stage = (swapped as unknown as { transformers: Record<string, { params: { w: number[] } }> }).transformers['schlau_drive']!
    expect(stage.params.w).toEqual(deep)
    const one = placeholderSchlauGenome()
    expect((applySchlauCandidate(world, one) as unknown as { transformers: Record<string, { params: { w: number[] } }> }).transformers['schlau_drive']!.params.w).toEqual(one)
    for (const bad of [new Array<number>(GENOME_LENGTH_V2).fill(0), new Array<number>(GENOME_LENGTH).fill(0), [1, 2, 3]]) {
      expect(() => applySchlauCandidate(world, bad)).toThrow()
    }
  })

  it('applySchlauCandidate REFUSES a deep genome in a world whose baked stage code predates the deep support (old exports: the car would silently stand still)', () => {
    const deep = freshGenomeSchlau2(createRng(42), 0.3, 6)
    const oldStage = { transformers: { schlau_drive: { code: 'function transform(input, dt, params, state, api) { var H = hiddenOf(params.w) }', params: { w: placeholderSchlauGenome() } } } } as unknown as RennWorld
    expect(() => applySchlauCandidate(oldStage, deep)).toThrow(/schlau2/)
    // a 1-layer candidate still loads into the old world (the fallback head)
    expect(() => applySchlauCandidate(oldStage, placeholderSchlauGenome())).not.toThrow()
  })

  it('buildSchlauTrainingWorld / buildSchlauMazeWorld / buildSchlauWorld accept a deep genome (the new stage code is dual-mode)', () => {
    const deep = freshGenomeSchlau2(createRng(43), 0.3, 5)
    const spec = SCHLAU_TRAINING_WORLDS[0]!
    const world = buildSchlauTrainingWorld(spec, deep)
    expect((world as unknown as { transformers: Record<string, { params: { w: number[] } }> }).transformers['schlau_drive']!.params.w).toEqual(deep)
    const mazeWorld = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, deep)
    expect((mazeWorld as unknown as { transformers: Record<string, { params: { w: number[] } }> }).transformers['schlau_drive_0']!.params.w).toEqual(deep)
    const task = buildSchlauTask('goal_open', 1)
    expect(() => buildSchlauWorld(task, deep)).not.toThrow()
    expect(() => buildSchlauWorld(task, [1, 2, 3])).toThrow()
    expect(() => buildSchlauTrainingWorld(spec, [])).toThrow()
  })
})

describe('islands: deep-safe island init and replacement', () => {
  it('initialIslands accepts a per-island fresh factory: deep genomes, one distinct draw per island', () => {
    const hidden = 6
    const cfg = { ...DEFAULT_ES_CONFIG, dim: genomeLengthSchlau2(hidden), pairs: 2 }
    const expected = [0, 1, 2].map((k) => freshGenomeSchlau2(createRng(100 + k), 0.3, hidden))
    const state = initialIslands(cfg, { ...DEFAULT_ISLANDS, islands: 3 }, undefined, (k) => expected[k]!.slice())
    expect(state.islands).toHaveLength(3)
    state.islands.forEach((isl, k) => {
      // the factory's genome is used VERBATIM — without the factory the dim would go through genomeShape, which
      // misreads a deep length as v1/v2/v3 (deep H=6 reads as v2-H-8: a genome of the right LENGTH but the wrong
      // layout, e.g. the +0.5 speed prior sitting in the middle of the vector instead of at the deep b3[1])
      expect(isl.es.theta).toEqual(expected[k])
      expect(schlauNetOf(isl.es.theta.length)).toBe('schlau2')
      expect(isl.es.theta.length).toBe(cfg.dim)
    })
    expect(new Set(state.islands.map((i) => i.es.theta[0])).size).toBe(3)
  })

  it('IslandEs with crossover OFF replaces by a deep-shaped IMMIGRANT (never the 1-layer crossover path, which would corrupt a deep genome)', () => {
    const hidden = 6
    const cfg = { ...DEFAULT_ES_CONFIG, dim: genomeLengthSchlau2(hidden), pairs: 2, seed: 7 }
    const state = initialIslands(cfg, { ...DEFAULT_ISLANDS, islands: 3, pCross: 1 }, undefined, (k) => freshGenomeSchlau2(createRng(200 + k), 0.3, hidden))
    for (const isl of state.islands) isl.age = 100
    const isl = new IslandEs(
      cfg,
      { ...DEFAULT_ISLANDS, islands: 3, pCross: 1 },
      state,
      undefined,
      undefined,
      false,
      { fresh: (rng) => freshGenomeSchlau2(rng, cfg.initStd, hidden), crossover: false },
    )
    const { best, event } = isl.reproduce([
      [1, 1],
      [0.5, 0.5],
      [0.2, 0.2],
    ])
    expect(best).toBe(0)
    expect(event).toBeDefined()
    expect(event!.with).toBe('immigrant')
    const replaced = state.islands[event!.replaced]!
    expect(schlauNetOf(replaced.es.theta.length)).toBe('schlau2')
    // the immigrant drives: the deep forward pass is finite on the zero input
    const [steer, gas] = policyForwardSchlau2(replaced.es.theta, new Array<number>(N_IN_SCHLAU).fill(0))
    expect(Number.isFinite(steer)).toBe(true)
    expect(Number.isFinite(gas)).toBe(true)
  })
})
