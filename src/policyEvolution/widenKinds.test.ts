import { describe, expect, it } from 'vitest'
import { acceptedSetupKeys, chainClearance, chainsForSetup, CLEARANCE, flattenChainKeys, holdoutV3Episodes, trainV3Episodes } from './chains'
import { buildSetupCourse, deadendWorld, parseCourseKey, rslalomWorld, V3_KINDS } from './courses'
import { runPolicyEpisode } from './episode'
import { genomeLengthV3 } from './policy'
import { reverserV3 } from './handWired'
import { initRapier } from '@/physics/rapierPhysics'

/**
 * The widen-freeze kinds (2026-10-13, see agent-context/feature-policy-evolution.md): two reversal-heavy kinds
 * (`rslalom` full-length reverse slalom, `deadend` two-bay dead-end hall) and two forward obstacle-avoidance kinds
 * (`gates` tight alternating gates, `dense` jittered obstacle lattice). Pinned here:
 *  - registry + TRAIN / HOLDOUT enumeration (the kinds train and validate like every other kind),
 *  - the geometry invariants that make each kind ITS task (too narrow to turn / facing back / one tight gap / dense),
 *  - the per-VARIANT geometry noise (a fresh obstacle world every generation, not one memorized course),
 *  - the chain gates the hand-laid kinds have no planner for (exact clearance, offM, leg shapes),
 *  - the reversal / progress demand (no credit without driving the task) and a hand-wired drivability spot check.
 */

const NEW_KINDS = ['rslalom', 'deadend', 'gates', 'dense'] as const

describe('widen-freeze kinds registry', () => {
  it('all four kinds are v3 kinds and parse', () => {
    for (const kind of NEW_KINDS) {
      expect(V3_KINDS).toContain(kind)
      expect(parseCourseKey(`${kind}:7~2@1`).kind).toBe(kind)
    }
    expect(() => parseCourseKey('nope:1')).toThrow()
  })

  it('TRAIN / HOLDOUT enumerate them (accepted setups, v3-flagged keys, disjoint splits)', () => {
    const train = trainV3Episodes(1, NEW_KINDS)
    const hold = holdoutV3Episodes(1, NEW_KINDS)
    expect(new Set(train.map((g) => parseCourseKey(g.setupKey).kind))).toEqual(new Set(NEW_KINDS))
    expect(new Set(hold.map((g) => parseCourseKey(g.setupKey).kind))).toEqual(new Set(NEW_KINDS))
    for (const g of [...train, ...hold]) for (const k of g.keys) expect(k.endsWith('v3')).toBe(true)
    expect(flattenChainKeys(train).some((k) => flattenChainKeys(hold).includes(k))).toBe(false)
  })
})

describe('rslalom (full-length reverse chains)', () => {
  it('corridor too narrow to turn, facing the rear wall, one gap per pillar', () => {
    for (const seed of [1, 2, 3]) {
      const w = rslalomWorld(seed, 0)
      expect(w.layout.cw).toBeLessThan(20) // the ~20 m minimum turning diameter: no U-turn possible
      expect(w.layout.cw).toBeGreaterThanOrEqual(13.5)
      expect(w.startYawDeg).toBe(180) // the car faces the rear wall: the chains lie behind it
      expect(w.pillars.length).toBeGreaterThanOrEqual(3)
      for (const p of w.pillars) {
        expect(p.gap).toBeGreaterThanOrEqual(7.5)
        expect(p.gap).toBeLessThanOrEqual(9.5)
      }
    }
  })

  it('chains thread the gaps with legs away from the facing (a forward-only policy banks nothing)', () => {
    const key = 'rslalom:1'
    const chains = chainsForSetup(key)
    expect(chains.length).toBe(3)
    const course = buildSetupCourse(key)
    for (const c of chains) {
      expect(chainClearance(course.boxes, c.points)).toBeGreaterThanOrEqual(CLEARANCE.rslalom.min)
      expect(c.offM).toBe(8)
      expect(c.legEnds!.length).toBeGreaterThanOrEqual(3)
      // the start heading is +Z (180 deg); every weave leg runs -Z: reaching the end means REVERSING the whole way
      const leg0 = c.points[c.legEnds![0]!]!
      expect(leg0[1]).toBeLessThan(0)
      expect(c.points[c.points.length - 1]![1]).toBeLessThan(-80)
    }
    // B: the stop-and-go warmup has two short (< 6 m) first legs; C: the mid-chain spike pulls back toward the start
    const b = chains[1]!
    expect(Math.hypot(b.points[1]![0] - b.points[0]![0], b.points[1]![1] - b.points[0]![1])).toBeLessThan(6)
    const c = chains[2]!
    const dirs = c.legEnds!.map((e, i) => c.points[e]![1] - c.points[i === 0 ? 0 : c.legEnds![i - 1]!]![1])
    expect(dirs.some((d) => d > 0)).toBe(true) // the spike leg points back (+Z)
  })

  it('the hand-wired reverser DRIVES it (physically solvable), the geometry is per-variant', async () => {
    await initRapier()
    const m = await runPolicyEpisode(reverserV3(), 'rslalom:1#0v3')
    expect(m.outcome).toBe('finish')
    // per-variant geometry noise: canonical vs variant 2 vs variant 3 differ, same key twice is identical
    const at = (v: number) => JSON.stringify(rslalomWorld(2, v).boxes.map((b) => b.at))
    expect(at(0)).not.toBe(at(2))
    expect(at(2)).not.toBe(at(3))
    expect(at(2)).toBe(at(2))
  }, 60_000)
})

describe('deadend (two-bay dead-end hall)', () => {
  it('two bays too narrow to turn, seeded independently', () => {
    for (const seed of [1, 2, 3]) {
      const w = deadendWorld(seed, 0)
      for (const bay of w.bays) {
        expect(bay.aw).toBeLessThan(20) // no U-turn inside a bay: driving out means reversing
        expect(bay.aw).toBeGreaterThanOrEqual(12.5)
        expect(bay.ad).toBeGreaterThanOrEqual(16)
        expect(bay.ad).toBeLessThanOrEqual(26)
      }
      expect(w.bays[0]!.ax).toBeLessThan(w.bays[1]!.ax) // A left, B right
    }
  })

  it('chains: into a bay, BACK OUT, on — with the exact clearance the planner kinds get', () => {
    const key = 'deadend:1'
    const course = buildSetupCourse(key)
    const chains = chainsForSetup(key)
    expect(chains.length).toBe(3)
    for (const c of chains) {
      expect(chainClearance(course.boxes, c.points)).toBeGreaterThanOrEqual(CLEARANCE.deadend.min)
      expect(c.offM).toBe(8)
      // leg 0 runs INTO the bay (-Z, tip), leg 1 BACK OUT (+Z, retreat): the reversal is structural
      const tip = c.points[c.legEnds![0]!]!
      const retreat = c.points[c.legEnds![1]!]!
      expect(tip[1]).toBeLessThan(retreat[1])
    }
    // chain C crosses the hall: bay A tip -> bay B tip (two reversals with a forward arc between)
    const cc = chains[2]!
    expect(cc.legEnds!.length).toBe(5)
    expect(cc.length).toBeGreaterThan(200)
  })

  it('the hand-wired reverser DRIVES it, the geometry is per-variant', async () => {
    await initRapier()
    const m = await runPolicyEpisode(reverserV3(), 'deadend:1#0v3')
    expect(m.outcome).toBe('finish')
    const at = (v: number) => JSON.stringify(deadendWorld(2, v).boxes.map((b) => b.at))
    expect(at(0)).not.toBe(at(2))
    expect(at(2)).toBe(at(2))
  }, 60_000)
})

describe('gates / dense (forward obstacle avoidance, planner chains)', () => {
  it('enumerate accepted setups with gated chains to the far end', () => {
    for (const kind of ['gates', 'dense'] as const) {
      const setups = acceptedSetupKeys(2, [kind], 1)
      expect(setups.length).toBe(2)
      for (const key of setups) {
        const chains = chainsForSetup(key)
        expect(chains.length).toBeGreaterThanOrEqual(2)
        const course = buildSetupCourse(key)
        for (const c of chains) {
          expect(chainClearance(course.boxes, c.points)).toBeGreaterThanOrEqual(CLEARANCE[kind].min)
          expect(c.length).toBeGreaterThan(350) // the far end is ~400 m away: progress demands forward driving
        }
      }
    }
  })

  it('gates: one tight opening per gate (9.5-12 m), alternating sides; the geometry is per-variant', () => {
    for (const seed of [1, 2]) {
      const course = buildSetupCourse(`gates:${seed}`)
      const stubs = course.boxes.filter((b) => b.size[0] > 8 && b.size[1] === 2 && b.at[1] < 20 && b.at[1] > -400)
      expect(stubs.length).toBeGreaterThan(10)
      const hw = Math.max(...stubs.map((b) => Math.abs(b.at[0]) + b.size[0] / 2))
      for (const s of stubs) {
        const gap = 2 * hw - s.size[0]
        expect(gap).toBeGreaterThanOrEqual(9.5)
        expect(gap).toBeLessThanOrEqual(12)
      }
      const sides = stubs.map((b) => Math.sign(b.at[0]))
      expect(sides.some((s, i) => i > 0 && s === sides[i - 1])).toBe(false) // strictly alternating: the weave is forced
    }
    const at = (v: number) => JSON.stringify(buildSetupCourse(`gates:2~${v}`).boxes.map((b) => b.at))
    expect(at(0)).not.toBe(at(2))
    expect(at(2)).toBe(at(2))
  })

  it('dense: many rows of small boxes with wide gaps; the geometry is per-variant', () => {
    const course = buildSetupCourse('dense:2')
    const small = course.boxes.filter((b) => b.size[0] < 6 && b.at[1] < 0)
    expect(small.length).toBeGreaterThan(40) // a DENSE lattice down the whole corridor
    const at = (v: number) => JSON.stringify(buildSetupCourse(`dense:2~${v}`).boxes.map((b) => b.at))
    expect(at(0)).not.toBe(at(2))
    expect(at(2)).toBe(at(2))
  })
})

describe('the new kinds demand progress (goal-directed, not stand-still)', () => {
  it('a zero policy banks nothing on the new kinds (stall at ~0 progress)', async () => {
    await initRapier()
    const zero = new Array<number>(genomeLengthV3(24)).fill(0)
    // the first ACCEPTED train setup of every kind (the scan skips rejected seeds — never pin a raw seed of a
    // planner kind, its geometry draws move with the design)
    const keys = NEW_KINDS.map((kind) => `${acceptedSetupKeys(1, [kind], 1)[0]}#0v3`)
    for (const key of keys) {
      const m = await runPolicyEpisode(zero, key)
      expect(['stall', 'timeout', 'crash']).toContain(m.outcome)
      expect(m.progress).toBeLessThan(5)
    }
  }, 120_000)
})

describe('planner grids are variant-safe (the grid cache key carries the variant)', () => {
  it('a variant computation cannot poison another variant\'s grid — canonical chains survive any computation order', () => {
    // fresh seeds (nothing else in this file touches them, the caches are per process): compute the VARIANT first,
    // then the canonical setup — before the gridKey fix the canonical reused the variant's grid (different obstacle
    // geometry per variant), its chains failed the exact clearance check against its OWN boxes and it cached []
    const variantFirst = chainsForSetup('gates:6~3')
    const canonical = chainsForSetup('gates:6')
    expect(variantFirst.length).toBeGreaterThanOrEqual(2)
    expect(canonical.length).toBeGreaterThanOrEqual(2)
    // and the reverse order, plus dense (seeds no other test in this file touches: the caches are per process)
    const canonical2 = chainsForSetup('dense:3')
    const variant2 = chainsForSetup('dense:3~1')
    expect(canonical2.length).toBeGreaterThanOrEqual(2)
    expect(variant2.length).toBeGreaterThanOrEqual(2)
  })
})
