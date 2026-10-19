import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { KTURN_KINDS, buildSetupCourse, hallWorld, kturnWorld, parseCourseKey, pocketWorld, teeWorld, V3_KINDS, type CourseBox } from './courses'
import { chainClearance, chainsForSetup, holdoutV3Episodes, MIN_CHAINS, MIN_CLEARANCE, trainV3Episodes } from './chains'
import { generateKturnChains, hullClearAt, maneuverSearch } from './kturnChains'
import type { V2 } from '@/avEvolution/eval/geometry'

const hashOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

/**
 * chunk R2 of the Rangieren plan (/tmp/handoff-rangieren-20261018.md): the kturn kind family (`pocket` / `tee` / `hall`)
 * and the maneuver-chain generator (`kturnChains.ts`). Design + critic record:
 * test-results/policy-evolution/rangieren/DESIGN-R2.md + CRITIC-R2.md.
 */

describe('kturn worlds', () => {
  it('each world is deterministic and its layout stays in the designed ranges', () => {
    expect(pocketWorld(3, 0)).toEqual(pocketWorld(3, 0))
    expect(teeWorld(3, 0)).toEqual(teeWorld(3, 0))
    expect(hallWorld(3, 0)).toEqual(hallWorld(3, 0))
    // pocket: 14-17 m wide, 22-28 m deep pocket carved into a bounded room
    const p = pocketWorld(1, 0)
    expect(p.layout.pw).toBeGreaterThanOrEqual(14)
    expect(p.layout.pw).toBeLessThanOrEqual(17)
    expect(p.layout.pd).toBeGreaterThanOrEqual(22)
    expect(p.layout.pd).toBeLessThanOrEqual(28)
    // the world offers exactly 3 target ends (one chain per end; >= MIN_CHAINS setups)
    expect(p.ends).toHaveLength(3)
    expect(teeWorld(1, 0).ends).toHaveLength(3)
    expect(hallWorld(1, 0).ends).toHaveLength(3)
    // the canonical start sits at the origin facing the back wall (-Z), every world variant keeps it deep inside
    for (const w of [pocketWorld(1, 0), teeWorld(1, 0), hallWorld(1, 0)]) {
      expect(w.start).toEqual([0, 0])
      expect(w.startYawDeg).toBe(0)
    }
  })

  it('variant >= 1 re-jitters the geometry (holdout variety, same family)', () => {
    const a = pocketWorld(7, 0)
    const b = pocketWorld(7, 1)
    expect(a.layout).not.toEqual(b.layout)
  })
})

describe('hull clearance (the true 4x8 footprint)', () => {
  // a 60x60 open room: the walls' inner faces sit 30 m out on every side
  const openBoxes: CourseBox[] = [
    { at: [0, -31], size: [62, 2], yawDeg: 0 },
    { at: [0, 31], size: [62, 2], yawDeg: 0 },
    { at: [-31, 0], size: [2, 62], yawDeg: 0 },
    { at: [31, 0], size: [2, 62], yawDeg: 0 },
  ]
  it('clear in the open; blocked when the nose closes within the 0.5 m margin, free again when rotated', () => {
    expect(hullClearAt(openBoxes, 0, 0, 0)).toBe(true)
    // facing -Z: the nose reaches z = centre - 4; a 0.6 m gap to the wall face keeps the margin, 0.4 m does not
    expect(hullClearAt(openBoxes, 0, -25.4, 0)).toBe(true)
    expect(hullClearAt(openBoxes, 0, -25.6, 0)).toBe(false)
    // rotated 90 deg (nose along +/-x): the same z-distance is fine again
    expect(hullClearAt(openBoxes, 0, -25.6, Math.PI / 2)).toBe(true)
  })
})

describe('maneuver search', () => {
  it('finds a straight-forward 1-move solution on an empty plane', () => {
    const none: CourseBox[] = []
    const path = maneuverSearch(none, 0, 0, 0, [0, -20], 40)
    expect(path).not.toBeNull()
    expect(path!.flips).toBe(0)
    expect(path!.points.length).toBeGreaterThanOrEqual(2)
    expect(path!.points[path!.points.length - 1]![1]).toBeLessThanOrEqual(-17.5)
  })

  it('fails when the target needs a swing the walls forbid (8 m corridor, 6 m lateral goal)', () => {
    // an 8 m wide closed corridor: every hull-clear pose keeps |x| <= 1.5, so a target 6 m off the centre
    // line is unreachable — all curving arcs clip a wall, the search exhausts and reports null
    const boxes: CourseBox[] = [
      { at: [5, -20], size: [2, 60], yawDeg: 0 },
      { at: [-5, -20], size: [2, 60], yawDeg: 0 },
      { at: [0, -51], size: [12, 2], yawDeg: 0 },
    ]
    expect(maneuverSearch(boxes, 0, -20, 0, [6, -44], 80)).toBeNull()
  })
})

describe('kturn chains', () => {
  const kinds = ['pocket', 'tee', 'hall'] as const

  it('every pinned setup lays >= MIN_CHAINS chains: from the (jittered) start, ending on each target end', () => {
    for (const kind of kinds) {
      for (const key of [`${kind}:1`, `${kind}:2~1`]) {
        const chains = generateKturnChains(key)
        expect(chains.length).toBeGreaterThanOrEqual(MIN_CHAINS)
        const { seed, variant } = parseCourseKey(key)
        const world = kturnWorld(kind, seed, variant)
        const course = buildSetupCourse(key)
        const start: V2 = course.startAt ?? [0, 0]
        for (const chain of chains) {
          // starts at the car, ends within the goal reach of one of the world's ends
          expect(chain.points[0]![0]).toBeCloseTo(start[0], 1)
          expect(chain.points[0]![1]).toBeCloseTo(start[1], 1)
          const end = chain.points[chain.points.length - 1]!
          expect(world.ends.some((t) => Math.hypot(t[0] - end[0], t[1] - end[1]) <= 3)).toBe(true)
          // legEnds: strictly increasing, last one is the last point, at most 6 moves, no zero-length legs
          expect(chain.legEnds!.length).toBeLessThanOrEqual(6)
          expect(chain.legEnds!.length).toBeGreaterThanOrEqual(1)
          expect([...chain.legEnds!]).toEqual([...chain.legEnds!].sort((a, b) => a - b))
          expect(chain.legEnds![chain.legEnds!.length - 1]).toBe(chain.points.length - 1)
          let prev = 0
          for (const le of chain.legEnds!) {
            const legLen = Math.hypot(chain.points[le]![0] - chain.points[prev]![0], chain.points[le]![1] - chain.points[prev]![1])
            expect(legLen).toBeGreaterThan(2)
            prev = le
          }
          // the centreline keeps the repo-wide exact clearance every accepted chain must hold
          expect(chainClearance(course.boxes, chain.points)).toBeGreaterThanOrEqual(MIN_CLEARANCE)
          expect(chain.length).toBeGreaterThan(10)
        }
      }
    }
  })

  it('tee: the straight-ahead junction end is a pure 1-move forward chain (no direction flip)', () => {
    const chains = generateKturnChains('tee:1')
    // the straight end sits on the arm centre line dead ahead of the start: a flip-free solution is strictly cheapest
    const straight = chains.find((c) => {
      const e = c.points[c.points.length - 1]!
      return Math.abs(e[0]) < 1.5
    })
    expect(straight).toBeDefined()
    expect(straight!.legEnds).toHaveLength(1)
  })

  it('pocket forces the real K (3-Zug back-corner chains + the 1-Zug reverse out); hall bay tips are multi-move', () => {
    // pocket:1 pinned (deterministic search): the two back-corner goals are exactly 3-Zug K-turns,
    // the straight-out goal is the 1-Zug pure reverse — the bearing-varied move counts the family exists for
    const pocket = generateKturnChains('pocket:1')
    expect(pocket.map((c) => c.legEnds!.length).sort()).toEqual([1, 3, 3])
    for (const key of ['hall:1', 'hall:2~1']) {
      const chains = generateKturnChains(key)
      expect(chains.some((c) => c.legEnds!.length >= 2)).toBe(true)
    }
  })

  it('is deterministic: the same key lays the identical chains', () => {
    for (const kind of kinds) expect(generateKturnChains(`${kind}:1`)).toEqual(generateKturnChains(`${kind}:1`))
  })

  it('flows through the v3 band: chainsForSetup dispatches kturn, holdout + train enumerate 8 / 6 accepted setups per kind', () => {
    expect(KTURN_KINDS.every((k) => V3_KINDS.includes(k))).toBe(true)
    for (const key of ['pocket:1', 'tee:1', 'hall:1']) expect(chainsForSetup(key)).toEqual(generateKturnChains(key))
    const hold = holdoutV3Episodes(8, KTURN_KINDS)
    expect(hold.filter((s) => s.setupKey.startsWith('pocket'))).toHaveLength(8)
    expect(hold.filter((s) => s.setupKey.startsWith('tee'))).toHaveLength(8)
    expect(hold.filter((s) => s.setupKey.startsWith('hall'))).toHaveLength(8)
    for (const s of hold) expect(s.keys.length).toBeGreaterThanOrEqual(MIN_CHAINS)
    const train = trainV3Episodes(6, KTURN_KINDS)
    expect(train).toHaveLength(18)
  })
})

describe('kturn is additive — existing kinds are untouched', () => {
  it('pinned setups of every existing hand-laid + planner kind hash identically (pre-kturn regression hashes)', () => {
    const pins: Array<[string, number, string]> = [
      // captured 2026-10-19 against 6cb9b399, before the kturn kinds existed
      ['maze:1', 0, '4f53cda18c2baa0c'],
      ['deadend:1', 3, '2a866d129f458507'],
      ['bay:1', 3, '4ace32d7834f37c0'],
      ['gates:1', 3, '22317ea5fbc30ca5'],
      ['rslalom:1', 3, 'fa5c77d8f76aa37f'],
      ['corridor:1', 3, 'c0749341f3c4bc81'],
      ['field:1', 0, '4f53cda18c2baa0c'],
      ['maze:1001~1', 0, '4f53cda18c2baa0c'],
      ['deadend:1001~1', 3, 'f23cb622b34ec4b3'],
      ['dense:1', 2, 'ba694f6f41e90c3b'],
      ['grid:1', 2, '3a0c3164a593a1d6'],
    ]
    for (const [key, n, h] of pins) {
      const chains = chainsForSetup(key)
      expect(chains, key).toHaveLength(n)
      expect(hashOf(chains), key).toBe(h)
    }
  })
})
