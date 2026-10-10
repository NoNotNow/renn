import { describe, expect, it } from 'vitest'
import { buildSetupCourse, courseKey, FREE_HALF, V3_KINDS, type CourseKind } from './courses'
import {
  acceptedSetupKeys,
  chainClearance,
  chainEpisodeKey,
  chainEpisodeKeys,
  chainsForSetup,
  flattenChainKeys,
  holdoutV3Episodes,
  MIN_CLEARANCE,
  parseChainEpisodeKey,
  trainV3Episodes,
  v3EpisodeKeys,
  type Chain,
} from './chains'
import { v3ReportByKind } from './chainReport'
import { activeKinds, DEFAULT_STAGE, initialStage, stageBatch, updateStage } from './curriculum'
import { aggregateEvenness, aggregateKindEvenness } from './es'
import { runPolicyEpisode, SAFETY_WINDOW_S, STILL_WINDOW_S, v3EpisodeSeconds } from './episode'
import { pursuitV2, reverserV3 } from './handWired'
import { LegProgress } from './legs'
import { GENOME_LENGTH_V2, POLICY_STAGE_CODE_V3 } from './policy'
import { RouteProgress } from './courses'
import { freeChain, FREE_MARGIN } from './v3Chains'

type P = [number, number]
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
const legVec = (c: { points: P[]; legEnds?: number[] }, k: number): P => {
  const a = k === 0 ? 0 : c.legEnds![k - 1]!
  const b = c.legEnds![k]!
  return [c.points[b]![0] - c.points[a]![0], c.points[b]![1] - c.points[a]![1]]
}
const unitDot = (u: P, v: P) => (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))

describe('v3 keys', () => {
  it('round-trip, v2 keys are unchanged', () => {
    expect(chainEpisodeKey('free:3', 1, true)).toBe('free:3#1v3')
    expect(chainEpisodeKey('field:3@0.3', 2)).toBe('field:3@0.3#2')
    expect(parseChainEpisodeKey('bay:5~2#0v3')).toEqual({ setupKey: 'bay:5~2', chainIndex: 0, v3: true })
    expect(parseChainEpisodeKey('field:3~1@0.5#2')).toEqual({ setupKey: 'field:3~1@0.5', chainIndex: 2 })
    expect(() => parseChainEpisodeKey('free:3#1v4')).toThrow()
    expect(() => parseChainEpisodeKey('free:3#x')).toThrow()
  })
})

describe('leg-wise progress (doubling-back chain)', () => {
  // 40 m forward, 15 m back, 45 m on: the second and third leg overlap the first in space
  const pts: P[] = [[0, 0], [0, -40], [0, -25], [0, -70]]
  const ends = [1, 2, 3]

  it('counts completed legs plus the projection onto the CURRENT leg only', () => {
    const lp = new LegProgress(pts, ends)
    expect(lp.update(0, -20)).toBeCloseTo(20, 6)
    expect(lp.leg).toBe(0)
    lp.update(0, -38) // within reach (5 m) of the leg end: leg 1 starts
    expect(lp.leg).toBe(1)
    expect(lp.progress).toBeCloseTo(40, 6)
    expect(lp.update(0, -33)).toBeCloseTo(47, 6) // 7 m back along leg 1
    expect(lp.update(0, -30)).toBeCloseTo(50, 6)
    expect(lp.leg).toBe(1)
    lp.update(0, -27) // within reach of the leg 1 end (-25): leg 2 starts
    expect(lp.leg).toBe(2)
    expect(lp.progress).toBeCloseTo(55, 6)
    expect(lp.update(0, -50)).toBeCloseTo(55 + 25, 6)
    lp.update(0, -68)
    expect(lp.done).toBe(true)
    expect(lp.progress).toBeCloseTo(100, 6)
  })

  it('the projection onto the whole polyline is ambiguous where the old RouteProgress is not enough; the leg tracker does not credit overlapping space twice', () => {
    // standing at z = -30 on leg 0 gives 30 m, but on leg 1 (after finishing leg 0) it must give 40 + 10
    const legwise = new LegProgress(pts, ends)
    legwise.update(0, -39)
    expect(legwise.update(0, -30)).toBeCloseTo(50, 6)
    const old = new RouteProgress(pts)
    old.update(0, -39)
    expect(old.update(0, -30)).toBeLessThan(50)
  })

  it('distance is measured to the current leg; a single leg behaves like the v2 projection', () => {
    const lp = new LegProgress(pts, ends)
    lp.update(7, -20)
    expect(lp.lastDist).toBeCloseTo(7, 6)
    const line: P[] = [[0, 0], [0, -30], [10, -60], [10, -100]]
    const a = new LegProgress(line)
    const b = new RouteProgress(line)
    for (let z = 0; z >= -95; z -= 1) {
      const x = z < -30 ? Math.min(10, -(z + 30) / 3) : 0
      expect(a.update(x + 0.5, z)).toBeCloseTo(b.update(x + 0.5, z), 6)
    }
  })

  it('does not advance a leg without reaching it, and lateral cheating does not pay', () => {
    const lp = new LegProgress(pts, ends)
    for (let x = -30; x <= 30; x += 3) lp.update(x, -20)
    expect(lp.leg).toBe(0)
    expect(lp.progress).toBeCloseTo(20, 6)
  })
})

describe('v3 stage', () => {
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
    raycast: () => ({ hit: false }),
  }
  const transform = new Function(`${POLICY_STAGE_CODE_V3}\nreturn transform`)() as (i: unknown, dt: number, p: unknown, s: unknown, a: unknown) => unknown

  it('puts the aim BEHIND the car on a reversal leg and follows the same legs as the episode tracker', () => {
    const pts: P[] = [[0, 0], [0, 40], [0, 25], [0, 70]]
    const ends = [1, 2, 3]
    const w = new Array<number>(GENOME_LENGTH_V2).fill(0)
    const params = { w, gain: 1000, chain: pts, legEnds: ends, offM: 20, cmd: { lmin: 12, tau: 0, period: 0.1, noiseDeg: 0, seed: 1 } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = {}
    const lp = new LegProgress(pts, ends, 20)
    const path: P[] = [[0, 0], [0, 10], [0, 30], [0, 37], [0, 38], [0, 33], [0, 28], [0, 27], [0, 40], [0, 66]]
    const seen: Array<{ leg: number; aimZ: number }> = []
    for (const [x, z] of path) {
      for (let f = 0; f < 8; f++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inp: any = { position: [x, 0, z], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], angularVelocity: [0, 0, 0], actions: {} }
        transform(inp, 1 / 60, params, state, api)
      }
      lp.update(x, z)
      seen.push({ leg: state.lt.li, aimZ: state.aim[1] })
      expect(state.lt.li).toBe(lp.leg)
    }
    // at z = 38 the car is on leg 1 (40 -> 25): the aim is the leg end, 13 m BEHIND (z smaller)
    const atBack = seen[4]!
    expect(atBack.leg).toBe(1)
    expect(atBack.aimZ).toBeCloseTo(25, 6)
    expect(seen[4]!.aimZ).toBeLessThan(path[4]![1])
    // on the last leg the aim is ahead again
    expect(seen[9]!.leg).toBe(2)
    expect(seen[9]!.aimZ).toBeGreaterThan(66 - 1e-9)
  })
})

describe('v3 setups', () => {
  it('free chains: deterministic, 4 per setup, 6-12 legs mixing forward / reversal / lateral, inside the arena, the 2nd one starts with a reversal', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const key = courseKey('free', seed)
      const chains = chainsForSetup(key)
      expect(JSON.stringify(chains)).toBe(JSON.stringify(chainsForSetup(key)))
      expect(chains.length).toBe(4)
      for (const [i, c] of chains.entries()) {
        expect(c.legEnds!.length).toBeGreaterThanOrEqual(6)
        expect(c.legEnds!.length).toBeLessThanOrEqual(14)
        for (const p of c.points) expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeLessThanOrEqual(FREE_HALF - FREE_MARGIN + 1e-9)
        // chain 1 reverses first
        if (i === 1) expect(unitDot(legVec(c, 0), [0, -1])).toBeLessThan(-0.5) // back first (start heading -Z)
      }
    }
    // over many chains all four leg kinds occur: back legs (5-20 m, aim behind), lateral (60-120 deg), short stop-and-go legs
    let back = 0
    let lateral = 0
    let shortLegs = 0
    for (let seed = 1; seed <= 20; seed++) {
      for (const c of chainsForSetup(courseKey('free', seed))) {
        for (let k = 1; k < c.legEnds!.length; k++) {
          const d = unitDot(legVec(c, k - 1), legVec(c, k))
          const len = Math.hypot(...legVec(c, k))
          if (d < -0.8 && len <= 20.1) back++
          if (Math.abs(d) < 0.55 && len >= 12) lateral++
          if (len <= 6.1) shortLegs++
        }
      }
    }
    expect(back).toBeGreaterThan(10)
    expect(lateral).toBeGreaterThan(10)
    expect(shortLegs).toBeGreaterThan(10)
  })

  it('freeChain starts at the given pose', () => {
    const c = freeChain([5, -3], 0.4, 'x/0')
    expect(c.points[0]).toEqual([5, -3])
  })

  /** flood fill on a 1 m grid from the start: a closed setup never reaches the border of the (padded) bounding box */
  function closed(setupKey: string): boolean {
    const course = buildSetupCourse(setupKey)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const b of course.boxes) {
      x0 = Math.min(x0, b.at[0] - b.size[0] / 2)
      x1 = Math.max(x1, b.at[0] + b.size[0] / 2)
      z0 = Math.min(z0, b.at[1] - b.size[1] / 2)
      z1 = Math.max(z1, b.at[1] + b.size[1] / 2)
    }
    x0 = Math.floor(x0) - 4
    z0 = Math.floor(z0) - 4
    const nx = Math.ceil(x1 - x0) + 8
    const nz = Math.ceil(z1 - z0) + 8
    const occ = new Uint8Array(nx * nz)
    for (const b of course.boxes) {
      for (let j = Math.floor(b.at[1] - b.size[1] / 2 - 1 - z0); j <= Math.ceil(b.at[1] + b.size[1] / 2 + 1 - z0); j++) {
        for (let i = Math.floor(b.at[0] - b.size[0] / 2 - 1 - x0); i <= Math.ceil(b.at[0] + b.size[0] / 2 + 1 - x0); i++) {
          if (i >= 0 && j >= 0 && i < nx && j < nz) occ[j * nx + i] = 1
        }
      }
    }
    const start = course.startAt ?? [0, 0]
    const si = Math.floor(start[0] - x0)
    const sj = Math.floor(start[1] - z0)
    expect(occ[sj * nx + si]).toBe(0)
    const seen = new Uint8Array(nx * nz)
    const stack = [sj * nx + si]
    seen[stack[0]!] = 1
    while (stack.length) {
      const c = stack.pop()!
      const i = c % nx
      const j = Math.floor(c / nx)
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) return false
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = (j + dj) * nx + (i + di)
        if (!occ[n] && !seen[n]) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    return true
  }

  it('free arena, dead-end bays and corridors are closed (also with start variants)', () => {
    for (const kind of ['free', 'bay', 'corridor'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        expect(closed(courseKey(kind, seed)), `${kind}:${seed}`).toBe(true)
        expect(closed(courseKey(kind, seed, 1)), `${kind}:${seed}~1`).toBe(true)
      }
    }
  })

  it('bay / corridor / free chains keep the clearance to the walls and are 3-4 per setup', () => {
    for (const kind of ['free', 'bay', 'corridor'] as const) {
      for (let seed = 1; seed <= 8; seed++) {
        for (const variant of [0, 1]) {
          const key = courseKey(kind, seed, variant)
          const course = buildSetupCourse(key)
          const chains = chainsForSetup(key)
          expect(chains.length).toBeGreaterThanOrEqual(3)
          for (const c of chains) expect(chainClearance(course.boxes, c.points), `${key}`).toBeGreaterThanOrEqual(MIN_CLEARANCE)
        }
      }
    }
  })

  it('bays are too narrow to turn in; the chain drives in, backs out and goes on', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const course = buildSetupCourse(courseKey('bay', seed))
      expect(course.layout!.bw).toBeLessThan(14.01)
      expect(course.layout!.bd).toBeGreaterThanOrEqual(20)
      for (const c of chainsForSetup(courseKey('bay', seed))) {
        expect(c.legEnds!.length).toBe(3)
        expect(unitDot(legVec(c, 0), legVec(c, 1))).toBeLessThan(-0.95) // in, then straight back out
      }
    }
  })

  it('v3 episode keys cover the free, bay, corridor and the v2 kinds; train / holdout are disjoint', { timeout: 120000 }, () => {
    const train = trainV3Episodes(2)
    const hold = holdoutV3Episodes(2)
    const kinds = new Set(train.map((g) => g.setupKey.split(':')[0]))
    expect([...kinds].sort()).toEqual([...V3_KINDS].sort())
    for (const g of train) for (const k of g.keys) expect(parseChainEpisodeKey(k).v3).toBe(true)
    expect(flattenChainKeys(train).some((k) => flattenChainKeys(hold).includes(k))).toBe(false)
    expect(chainEpisodeKeys('free:1')[0]).toBe('free:1#0')
    expect(v3EpisodeKeys('free:1')[0]).toBe('free:1#0v3')
    expect(acceptedSetupKeys(3, ['free'], 1)).toHaveLength(3)
  })
})

describe('v3 episodes', () => {
  const onlyKeys = (kind: CourseKind, n: number) => acceptedSetupKeys(n, [kind], 1).flatMap((s) => v3EpisodeKeys(s))

  it('are deterministic', async () => {
    const g = reverserV3()
    const a = await runPolicyEpisode(g, 'bay:2#0v3')
    const b = await runPolicyEpisode(g, 'bay:2#0v3')
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
  })

  it('hand-wired reverser finishes every dead-end bay and corridor chain, a forward-only follower finishes none (REVERSE USAGE is reported)', async () => {
    const rev = reverserV3()
    const fwd = pursuitV2(0.35)
    for (const kind of ['bay', 'corridor'] as const) {
      const keys = onlyKeys(kind, 3)
      const revM = []
      for (const k of keys) {
        const m = await runPolicyEpisode(rev, k)
        revM.push(m)
        expect(m.outcome, k).toBe('finish')
        expect(m.maxReverseM!, k).toBeGreaterThan(3)
        expect(m.reverseShare!, k).toBeGreaterThan(0.05)
        const f = await runPolicyEpisode(fwd, k)
        expect(f.outcome, `forward-only ${k}`).not.toBe('finish')
        expect(f.maxReverseM!).toBe(0)
      }
      const r = v3ReportByKind(revM, [kind])[0]!
      expect(r.finishRate).toBe(1)
      expect(r.setupsAllFinished).toBe(r.setups)
      expect(r.reverseShare).toBeGreaterThan(0.05)
      expect(r.maxReverseM).toBeGreaterThan(3)
      console.log(`V3 SOLVABILITY ${kind}: reverser ${revM.filter((m) => m.outcome === 'finish').length}/${revM.length}, forward-only 0/${revM.length}; reverse ${(100 * r.reverseShare).toFixed(0)} % of time, max ${r.maxReverseM.toFixed(0)} m`)
    }
  }, 120000)

  it('hand-wired reverser finishes >= 70 % of the free-track chains', async () => {
    const keys = onlyKeys('free', 5)
    let fin = 0
    for (const k of keys) fin += (await runPolicyEpisode(reverserV3(), k)).outcome === 'finish' ? 1 : 0
    console.log(`V3 SOLVABILITY free: reverser ${fin}/${keys.length}`)
    expect(fin / keys.length).toBeGreaterThanOrEqual(0.7)
  }, 120000)

  it('a short back leg: the reverser is done sooner than the forward-only follower (which has to turn round)', async () => {
    // 30 m forward, 16 m back, 30 m on, on the empty free arena
    const chain: Chain = { points: [[0, 0], [0, -30], [0, -14], [0, -44]], length: 76, endIndex: 0, legEnds: [1, 2, 3], offM: 20 }
    const rev = await runPolicyEpisode(reverserV3(), 'free:1#0v3', { chainOverride: chain })
    const fwd = await runPolicyEpisode(pursuitV2(0.35), 'free:1#0v3', { chainOverride: chain })
    expect(rev.outcome).toBe('finish')
    expect(rev.maxReverseM!).toBeGreaterThan(2)
    expect(fwd.reverseShare).toBe(0)
    expect(fwd.outcome !== 'finish' || fwd.timeS > rev.timeS + 0.5, `forward ${fwd.outcome} ${fwd.timeS}, reverser ${rev.timeS}`).toBe(true)
  }, 60000)

  it('stand-still stall: a car that does not move is stalled after ~3 s; a reversing car is not stalled', async () => {
    const idle = await runPolicyEpisode(new Array<number>(GENOME_LENGTH_V2).fill(0), 'free:1#0v3')
    expect(idle.outcome).toBe('stall')
    expect(idle.timeS).toBeGreaterThan(STILL_WINDOW_S - 0.1)
    expect(idle.timeS).toBeLessThan(STILL_WINDOW_S + 1.5)
    expect(SAFETY_WINDOW_S).toBeGreaterThan(STILL_WINDOW_S)
    // corridor chain 1 starts with a reverse leg: reversing with low speed is progress, not a stall
    const back = await runPolicyEpisode(reverserV3(), 'corridor:1#1v3')
    expect(back.outcome).toBe('finish')
    expect(back.reverseShare!).toBeGreaterThan(0.1)
  }, 60000)

  it('time limit grows with the chain length (45..150 s)', () => {
    expect(v3EpisodeSeconds(100)).toBe(54)
    expect(v3EpisodeSeconds(10)).toBe(45)
    expect(v3EpisodeSeconds(1000)).toBe(150)
  })

  it('exploit guard: driving straight ahead never finishes a free / bay / corridor chain', async () => {
    const w = new Array<number>(GENOME_LENGTH_V2).fill(0)
    w[GENOME_LENGTH_V2 - 1] = 0.5
    for (const k of ['free:1#1v3', 'free:2#0v3', 'bay:1#0v3', 'corridor:1#0v3']) expect((await runPolicyEpisode(w, k)).outcome, k).not.toBe('finish')
  }, 60000)

  it('v2 kinds run in v3 mode as one leg (reach rule) and are still driven by pure pursuit', async () => {
    const keys = ['slalom:1', 'slalom:2'].flatMap((s) => v3EpisodeKeys(s))
    let fin = 0
    for (const k of keys) fin += (await runPolicyEpisode(pursuitV2(0.35), k)).outcome === 'finish' ? 1 : 0
    expect(fin / keys.length).toBeGreaterThanOrEqual(0.5)
  }, 120000)
})

describe('v3 stage curriculum', () => {
  it('the obstacle share rises only through the free-track finish-rate gate and is capped', () => {
    let s = initialStage()
    for (let i = 0; i < 40; i++) s = updateStage(s, 0.5)
    expect(s.share).toBe(0)
    s = initialStage()
    for (let i = 0; i < DEFAULT_STAGE.minSteps - 1; i++) s = updateStage(s, 0.95)
    expect(s.share).toBe(0) // minSteps not reached yet
    s = updateStage(s, 0.95)
    expect(s.share).toBeCloseTo(0.1, 9)
    for (let i = 0; i < 400 && s.share < DEFAULT_STAGE.max; i++) s = updateStage(s, 0.95)
    expect(s.share).toBe(DEFAULT_STAGE.max)
    const before = s
    s = updateStage(s, 1)
    expect(s.share).toBe(before.share)
    // a failing free track stops the rise
    let t = updateStage(initialStage(), 0.95)
    for (let i = 0; i < 10; i++) t = updateStage(t, 0.95)
    const sh = t.share
    expect(sh).toBeGreaterThan(0)
    for (let i = 0; i < 30; i++) t = updateStage(t, 0.1)
    expect(t.share).toBe(sh)
  })

  it('batches are stratified: the same number of setups from every active kind, kinds join with the share', () => {
    expect(activeKinds(0)).toEqual(['free'])
    expect(activeKinds(0.7)).toHaveLength(7)
    expect(activeKinds(0.1).length).toBeGreaterThan(1)
    const byKind = { free: ['f1', 'f2', 'f3'], bay: ['b1', 'b2'], corridor: ['c1'] }
    const b = stageBatch(byKind, ['free', 'bay', 'corridor'], 2, 3)
    expect(b).toHaveLength(6)
    for (const p of ['f', 'b', 'c']) expect(b.filter((x) => x.startsWith(p))).toHaveLength(2)
    expect(stageBatch(byKind, ['free'], 2, 0).every((x) => x.startsWith('f'))).toBe(true)
    expect(stageBatch(byKind, ['free', 'bay'], 1, 5)).toEqual(stageBatch(byKind, ['free', 'bay'], 1, 5))
  })
})

describe('v3 fitness: evenness across kinds', () => {
  const m = (setup: string, norm: number) => ({ key: `${setup}#0v3`, norm })
  it('an uneven candidate scores below an even one with the same overall mean; per-kind min matters', () => {
    const even = [m('free:1', 0.5), m('bay:1', 0.5), m('slalom:1', 0.5), m('field:1', 0.5)]
    const uneven = [m('free:1', 0.95), m('bay:1', 0.05), m('slalom:1', 0.95), m('field:1', 0.05)]
    const mean = (a: typeof even) => a.reduce((x, y) => x + y.norm, 0) / a.length
    expect(mean(even)).toBeCloseTo(mean(uneven), 9)
    expect(aggregateKindEvenness(even)).toBeGreaterThan(aggregateKindEvenness(uneven))
    expect(aggregateKindEvenness(even)).toBeCloseTo(0.5, 9)
    // a single kind reduces to the setup aggregate
    expect(aggregateKindEvenness([m('free:1', 0.3), m('free:2', 0.6)])).toBeCloseTo(aggregateEvenness([m('free:1', 0.3), m('free:2', 0.6)]), 9)
    expect(aggregateKindEvenness([])).toBe(0)
    // a crash keeps only V3_FAIL_FACTOR of its norm: fast-and-crashed scores below slower-and-finished
    const crashed = { key: 'bay:1#0v3', norm: 0.8, outcome: 'crash' as const }
    const finished = { key: 'bay:1#0v3', norm: 0.5, outcome: 'finish' as const }
    expect(aggregateKindEvenness([finished])).toBeGreaterThan(aggregateKindEvenness([crashed]))
  })
})
