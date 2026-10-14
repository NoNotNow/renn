import { describe, expect, it } from 'vitest'
import { acceptedSetupKeys, chainClearance, chainsForSetup, CLEARANCE, flattenChainKeys, holdoutV3Episodes, trainV3Episodes } from './chains'
import { buildSetupCourse, parseCourseKey, V3_KINDS } from './courses'
import { runPolicyEpisode } from './episode'
import { genomeLengthV3 } from './policy'
import { pointPolyGap, rectPoly } from '@/avEvolution/eval/geometry'
import { initRapier } from '@/physics/rapierPhysics'

/**
 * The obstacle-fluency detour kinds (2026-10-14, see agent-context/feature-policy-evolution.md): `blockade`
 * (transverse wall segments crossing the direct start -> target line, the opening alternating sides) and
 * `blocks` (big jittered blocks with one ON the line) — the target vector points THROUGH an obstacle, forward
 * progress demands a committed detour around its end. Pinned here:
 *  - registry + TRAIN / HOLDOUT enumeration (the kinds train and validate like every other kind),
 *  - the geometry invariant that makes each kind ITS task: the DIRECT start -> target line crosses obstacle(s),
 *    the detour exists and is wide enough (openings 12-18 m / >= 12 m corridors, by construction),
 *  - the per-VARIANT geometry noise (a fresh obstacle world every generation, not one memorized course),
 *  - the planner chain gates (exact clearance, progress demand) and the grid-cache variant safety,
 *  - the progress demand (a zero policy banks nothing).
 */
const NEW_KINDS = ['blockade', 'blocks'] as const

/** boxes the direct start -> target line passes through (sampled against the true rotated polygons) */
function lineCrossedBoxes(course: ReturnType<typeof buildSetupCourse>): number {
  const target = course.waypoints[0]!
  const polys = course.boxes.map((b) => ({ b, poly: rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]) }))
  let crossed = 0
  const N = 240
  for (const { b, poly } of polys) {
    for (let i = 1; i <= N && !((b as { hit?: boolean }).hit); i++) {
      if (pointPolyGap((target[0] * i) / N, (target[1] * i) / N, poly) <= 0.05) {
        ;(b as { hit?: boolean }).hit = true
        crossed++
      }
    }
  }
  return crossed
}

describe('obstacle-fluency kinds registry', () => {
  it('both kinds are v3 kinds and parse', () => {
    for (const kind of NEW_KINDS) {
      expect(V3_KINDS).toContain(kind)
      expect(parseCourseKey(`${kind}:7~2@1`).kind).toBe(kind)
    }
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

describe('blockade (transverse walls crossing the target line)', () => {
  it('the direct line passes THROUGH every wall; one 12-18 m opening per wall, alternating sides', () => {
    for (const seed of [1, 2, 3]) {
      const course = buildSetupCourse(`blockade:${seed}`)
      const hw = course.layout!.hw!
      const walls = course.boxes.filter((b) => b.size[1] === 2 && b.size[0] > 20 && b.at[1] < -20 && b.at[1] > course.layout!.tz! + 20)
      expect(walls.length).toBeGreaterThanOrEqual(2)
      for (const w of walls) {
        const opening = 2 * hw - w.size[0]
        expect(opening).toBeGreaterThanOrEqual(12)
        expect(opening).toBeLessThanOrEqual(18)
        // the wall hugs one side: its span reaches across x = 0 (the line the target sits on)
        expect(w.size[0]).toBeGreaterThan(hw)
      }
      const sides = walls.map((w) => Math.sign(w.at[0]))
      expect(sides.some((s, i) => i > 0 && s === sides[i - 1])).toBe(false) // strictly alternating: the detour weaves
      // the direct line crosses EVERY wall — the target vector points through the whole blockade
      expect(lineCrossedBoxes(course)).toBeGreaterThanOrEqual(walls.length)
    }
  })

  it('the geometry is per-variant (fresh worlds every generation)', () => {
    const at = (v: number) => JSON.stringify(buildSetupCourse(`blockade:2~${v}`).boxes.map((b) => b.at))
    expect(at(0)).not.toBe(at(2))
    expect(at(2)).not.toBe(at(3))
    expect(at(2)).toBe(at(2))
  })
})

describe('blocks (big blocks, one ON the target line)', () => {
  it('the direct line passes THROUGH at least one block; the world holds 3-5 fat blocks', () => {
    for (const seed of [1, 2, 3]) {
      const course = buildSetupCourse(`blocks:${seed}`)
      const blocks = course.boxes.filter((b) => b.size[0] >= 12 && b.size[1] >= 10)
      expect(blocks.length).toBeGreaterThanOrEqual(3)
      expect(blocks.length).toBeLessThanOrEqual(5)
      expect(lineCrossedBoxes(course)).toBeGreaterThanOrEqual(1)
    }
  })

  it('the geometry is per-variant (fresh worlds every generation)', () => {
    const at = (v: number) => JSON.stringify(buildSetupCourse(`blocks:2~${v}`).boxes.map((b) => b.at))
    expect(at(0)).not.toBe(at(2))
    expect(at(2)).toBe(at(2))
  })
})

describe('the detour kinds have gated chains and demand progress', () => {
  it('accepted setups enumerate with planner chains of exact clearance and real length', () => {
    for (const kind of NEW_KINDS) {
      const setups = acceptedSetupKeys(2, [kind], 1)
      expect(setups.length).toBe(2)
      for (const key of setups) {
        const chains = chainsForSetup(key)
        expect(chains.length).toBeGreaterThanOrEqual(2)
        const course = buildSetupCourse(key)
        for (const c of chains) {
          expect(chainClearance(course.boxes, c.points)).toBeGreaterThanOrEqual(CLEARANCE[kind].min)
          expect(c.length).toBeGreaterThan(100) // the target sits 140+ m away: progress demands the detour
        }
      }
    }
  })

  it('planner grids are variant-safe (the variant first cannot poison the canonical chains)', () => {
    for (const kind of NEW_KINDS) {
      const variantFirst = chainsForSetup(`${kind}:5~3`)
      const canonical = chainsForSetup(`${kind}:5`)
      expect(variantFirst.length).toBeGreaterThanOrEqual(2)
      expect(canonical.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('a zero policy banks nothing on the detour kinds (stall at ~0 progress)', async () => {
    await initRapier()
    const zero = new Array<number>(genomeLengthV3(24)).fill(0)
    for (const kind of NEW_KINDS) {
      const key = `${acceptedSetupKeys(1, [kind], 1)[0]}#0v3`
      const m = await runPolicyEpisode(zero, key)
      expect(['stall', 'timeout', 'crash']).toContain(m.outcome)
      expect(m.progress).toBeLessThan(5)
    }
  }, 120_000)
})
