import { describe, expect, it } from 'vitest'
import { chainReportByKind, parseKinds, v2GenomeFromFile } from './chainReport'
import { CHAIN_KINDS } from './courses'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import { aggregateEvenness } from './es'
import { genomeLengthV2, GENOME_LENGTH, GENOME_LENGTH_V2, hiddenOfV2, N_HIDDEN, N_IN, N_IN_V2, N_RAYS, padV1Genome, POLICY_STAGE_CODE, POLICY_STAGE_CODE_V2, policyForward, policyForwardV2, widenHidden } from './policy'
import { freshGenome } from './islands'

const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!

/** minimal api for the stage: flat ground, identity heading (forward = +z, left = +x), every ray hits at 20 m */
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
}

function runStage(code: string, params: Record<string, unknown>, input: (frame: number) => Record<string, unknown> = () => ({}), frames = 1) {
  const transform = new Function(`${code}\nreturn transform`)() as (i: unknown, dt: number, p: unknown, s: unknown, a: unknown) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: any = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inp: any
  for (let f = 0; f < frames; f++) {
    inp = { position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity: [0.3, 0, 6], angularVelocity: [0, 0.4, 0], actions: {}, ...input(f) }
    transform(inp, 1 / 60, params, state, api)
  }
  return { inp, state }
}

describe('policy v2', () => {
  it('warm start: a v1 genome padded to v2 gives identical outputs (the new inputs carry zero weight)', () => {
    const rng = createRng(5)
    const g = Array.from({ length: GENOME_LENGTH }, () => gaussian(rng) * 0.6)
    const p = padV1Genome(g)
    expect(p.length).toBe(GENOME_LENGTH_V2)
    expect(GENOME_LENGTH_V2).toBe(272)
    for (let s = 0; s < 20; s++) {
      const x = Array.from({ length: N_IN }, () => rng.next() * 2 - 1)
      // v2 inputs: rays | speeds | aim (3) | next cos, sin | prev steer, gas
      const x2 = [...x.slice(0, N_RAYS + 6), rng.next() * 2 - 1, rng.next() * 2 - 1, ...x.slice(N_RAYS + 6)]
      expect(x2.length).toBe(N_IN_V2)
      const a = policyForward(g, x)
      const b = policyForwardV2(p, x2)
      expect(b[0]).toBeCloseTo(a[0], 12)
      expect(b[1]).toBeCloseTo(a[1], 12)
    }
    expect(() => padV1Genome([1, 2, 3])).toThrow()
  })

  it('the v1 stage code is unchanged in layout (16 inputs) and v2 uses 24', () => {
    expect(POLICY_STAGE_CODE).toContain(`N_IN = ${N_IN},`)
    expect(POLICY_STAGE_CODE).not.toContain('deriveCmd')
    expect(POLICY_STAGE_CODE_V2).toContain(`N_IN = ${N_IN_V2},`)
  })

  it('the v2 stage forward pass equals policyForwardV2 on the inputs it builds (command from input.av.cmd)', () => {
    const g = freshGenome(createRng(11), 0.5, N_IN_V2)
    // car at the origin heading +z (left = +x): the aim point is 20 m ahead and 6 m to the right, the next segment goes straight on
    const cmd = { aim: [-6, 20], next: [-6, 30] }
    const { inp, state } = runStage(POLICY_STAGE_CODE_V2, { w: g, gain: 1000 }, () => ({ av: { cmd } }))
    const gd = Math.hypot(6, 20)
    const x = [...new Array(N_RAYS).fill(1 - 20 / 50), 6 / 30, 0.3 / 10, 0.4 / 2, 20 / gd, -6 / gd, gd / 60, 1, 0, 0, 0]
    expect(x.length).toBe(N_IN_V2)
    const [steer, gas] = policyForwardV2(g, x)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
    expect(inp.actions.steering_angle).toBeCloseTo(Math.abs(steer) < 1e-4 ? 1e-4 : steer, 9)
    expect(inp.actions.throttle + inp.actions.brake).toBeGreaterThanOrEqual(0)
  })

  it('the v1 stage forward pass equals policyForward', () => {
    const g = freshGenome(createRng(12), 0.5)
    const { state } = runStage(POLICY_STAGE_CODE, { w: g, goals: [[0, 30]], reachR: 8, gain: 1000 })
    const x = [...new Array(N_RAYS).fill(1 - 20 / 50), 6 / 30, 0.3 / 10, 0.4 / 2, 1, 0, 30 / 60, 0, 0]
    const [steer, gas] = policyForward(g, x)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
  })

  it('the stage derives the command from params.chain: aim lies ahead on the chain, is held between refreshes', () => {
    const g = freshGenome(createRng(13), 0.5, N_IN_V2)
    const chain = [[0, 0], [0, 40], [30, 80]]
    const cmd = { lmin: 12, tau: 0, period: 0.5, noiseDeg: 0, seed: 1 }
    const a = runStage(POLICY_STAGE_CODE_V2, { w: g, gain: 1000, chain, cmd }, () => ({}), 1)
    expect(a.state.aim).toEqual([0, 12])
    expect(a.state.nxt[1]).toBeGreaterThan(12)
    // 1 frame later (1/60 s < period) the aim is held although the car moved; after the period it follows
    const held = runStage(POLICY_STAGE_CODE_V2, { w: g, gain: 1000, chain, cmd }, (f) => ({ position: [0, 0, f === 0 ? 0 : 5] }), 2)
    expect(held.state.aim).toEqual([0, 12])
    const later = runStage(POLICY_STAGE_CODE_V2, { w: g, gain: 1000, chain, cmd }, (f) => ({ position: [0, 0, f === 0 ? 0 : 5] }), 40)
    expect(later.state.aim).toEqual([0, 17])
    // input.av.cmd wins over the chain
    const av = runStage(POLICY_STAGE_CODE_V2, { w: g, gain: 1000, chain, cmd }, () => ({ av: { cmd: { aim: [3, 9], next: [3, 19] } } }), 1)
    expect(av.state.aim).toBeUndefined()
  })
})

describe('evenness fitness', () => {
  const m = (setup: string, i: number, norm: number) => ({ key: `${setup}#${i}`, norm })
  it('an uneven candidate scores below an even one with the same mean', () => {
    const even = ['a', 'b', 'c', 'd'].flatMap((s) => [m(s, 0, 0.5), m(s, 1, 0.5)])
    // same mean 0.5: setups a, b perfect on both chains, setups c, d dead; and one chain per setup good, the other dead
    const unevenSetups = [m('a', 0, 1), m('a', 1, 1), m('b', 0, 1), m('b', 1, 1), m('c', 0, 0), m('c', 1, 0), m('d', 0, 0), m('d', 1, 0)]
    const unevenChains = ['a', 'b', 'c', 'd'].flatMap((s) => [m(s, 0, 1), m(s, 1, 0)])
    const f = aggregateEvenness(even)
    expect(f).toBeCloseTo(0.5)
    expect(aggregateEvenness(unevenSetups)).toBeLessThan(f)
    expect(aggregateEvenness(unevenChains)).toBeLessThan(f)
    expect(aggregateEvenness(unevenChains)).toBeCloseTo(0.5 * 0.25 + 0.5 * 0.25)
    expect(aggregateEvenness([])).toBe(0)
  })
})

describe('chain reports', () => {
  it('per kind: chain finish rate, setups with all chains finished, offcourse, crashes', () => {
    const m = [
      { key: 'slalom:1#0', outcome: 'finish' as const },
      { key: 'slalom:1#1', outcome: 'offcourse' as const },
      { key: 'slalom:2#0', outcome: 'finish' as const },
      { key: 'slalom:2#1', outcome: 'finish' as const },
      { key: 'crowd:1#0', outcome: 'crash' as const },
    ]
    const r = chainReportByKind(m)
    expect(r.map((x) => x.kind)).toEqual(['slalom', 'crowd'])
    expect(r[0]).toMatchObject({ chains: 4, finished: 3, setups: 2, setupsAllFinished: 1, offcourse: 1, crashes: 0 })
    expect(r[1]).toMatchObject({ chains: 1, finished: 0, crashes: 1, allFinishedShare: 0 })
  })

  it('genome files: v1 is padded, v2 kept, other lengths rejected; --kinds is validated', () => {
    const v1 = new Array<number>(GENOME_LENGTH).fill(0.1)
    expect(v2GenomeFromFile({ genome: v1 }).length).toBe(GENOME_LENGTH_V2)
    expect(v2GenomeFromFile({ best: { genome: new Array<number>(GENOME_LENGTH_V2).fill(0) } }).length).toBe(GENOME_LENGTH_V2)
    expect(() => v2GenomeFromFile({ genome: [1, 2] })).toThrow()
    expect(parseKinds('field,crowd', CHAIN_KINDS)).toEqual(['field', 'crowd'])
    expect(() => parseKinds('nope', CHAIN_KINDS)).toThrow()
  })
})

describe('v2 hidden size H (len = 27 H + 2)', () => {
  const inputs = (rng: ReturnType<typeof createRng>) => Array.from({ length: N_IN_V2 }, () => rng.next() * 2 - 1)

  it('H is inferred from the genome length; non-integer H is refused', () => {
    expect(hiddenOfV2(GENOME_LENGTH_V2)).toBe(N_HIDDEN)
    expect(hiddenOfV2(genomeLengthV2(24))).toBe(24)
    expect(genomeLengthV2(24)).toBe(24 * 27 + 2)
    expect(() => hiddenOfV2(273)).toThrow()
    expect(() => policyForwardV2(new Array<number>(273).fill(0), new Array<number>(N_IN_V2).fill(0))).toThrow()
  })

  it('widenHidden keeps the function EXACTLY: old units copied, new units have zero outgoing weights and small random incoming ones', () => {
    const rng = createRng(21)
    const g = freshGenome(createRng(22), 0.5, N_IN_V2)
    const w = widenHidden(g, 24, createRng(23))
    expect(w.length).toBe(genomeLengthV2(24))
    for (let s = 0; s < 30; s++) {
      const x = inputs(rng)
      expect(policyForwardV2(w, x)).toEqual(policyForwardV2(g, x))
    }
    const H = 24
    const o2 = H * N_IN_V2 + H
    for (let k = 0; k < 2; k++) for (let j = N_HIDDEN; j < H; j++) expect(w[o2 + k * H + j]).toBe(0)
    const incoming = w.slice(N_HIDDEN * N_IN_V2, H * N_IN_V2)
    expect(incoming.some((v) => v !== 0)).toBe(true)
    const std = Math.sqrt(incoming.reduce((a, v) => a + v * v, 0) / incoming.length)
    expect(std).toBeGreaterThan(0.05)
    expect(std).toBeLessThan(0.2)
    expect(widenHidden(g, N_HIDDEN, createRng(1))).toEqual(g)
    expect(() => widenHidden(w, 10, createRng(1))).toThrow()
  })

  it('the H = 24 stage forward pass equals policyForwardV2; an invalid length leaves the actions untouched', () => {
    const g = widenHidden(freshGenome(createRng(31), 0.5, N_IN_V2), 24, createRng(32))
    // make the new units matter: non-zero outgoing weights
    const o2 = 24 * N_IN_V2 + 24
    for (let j = N_HIDDEN; j < 24; j++) g[o2 + j] = 0.3 - 0.02 * j
    const cmd = { aim: [-6, 20], next: [-6, 30] }
    const { inp, state } = runStage(POLICY_STAGE_CODE_V2, { w: g, gain: 1000 }, () => ({ av: { cmd } }))
    const gd = Math.hypot(6, 20)
    const x = [...new Array(N_RAYS).fill(1 - 20 / 50), 6 / 30, 0.3 / 10, 0.4 / 2, 20 / gd, -6 / gd, gd / 60, 1, 0, 0, 0]
    const [steer, gas] = policyForwardV2(g, x)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
    expect(inp.actions.steering_angle).toBeCloseTo(Math.abs(steer) < 1e-4 ? 1e-4 : steer, 9)
    const bad = runStage(POLICY_STAGE_CODE_V2, { w: g.slice(0, g.length - 1), gain: 1000 }, () => ({ av: { cmd } }))
    expect(bad.inp.actions).toEqual({})
  })

  it('genome files of any H load as v2', () => {
    expect(v2GenomeFromFile({ genome: new Array<number>(genomeLengthV2(24)).fill(0) }).length).toBe(genomeLengthV2(24))
  })
})
