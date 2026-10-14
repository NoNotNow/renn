import { describe, expect, it } from 'vitest'
import type { V2 } from '@/avEvolution/eval/geometry'
import {
  acceptedSetupKeys,
  adversarialSetupKeys,
  CHAINS_PER_SETUP,
  chainClearance,
  chainsForSetup,
  CLEARANCE,
  flattenChainKeys,
  generateChains,
  hausdorff,
  holdoutV3Episodes,
  MIN_CHAINS,
  MIN_CLEARANCE,
  MIN_HAUSDORFF_M,
  parseChainEpisodeKey,
  trainV3Episodes,
  v3EpisodeKeys,
} from './chains'
import { warmCruxGate } from './cruxChains'
import { ADVERSARIAL_KINDS, ADV_SEED, ADV_VARIANT, buildSetupCourse, parseCourseKey } from './courses'
import { runPolicyEpisode } from './episode'
import { pursuitV3 } from './handWired'

/**
 * T4 failure-mined adversarial TRAIN setups (maze + grid): the key bands, the bit-identity of the standard bands and the actual
 * geometry of every failure class. All reference values (key lists, chain hashes) were computed with the pre-T4 code and pinned;
 * the adversarial keys are pinned to the deterministic scan result.
 */

// the standard train band (8 / kind) and holdout band (6 / kind) of the v3mg kinds, computed with the pre-T4 code
const TRAIN8 = ['maze:12', 'grid:1', 'maze:19', 'grid:2', 'maze:21', 'grid:3', 'maze:23', 'grid:4', 'maze:25', 'grid:5', 'maze:32', 'grid:6', 'maze:34', 'grid:7', 'maze:40', 'grid:8'] as const
const HOLDOUT6 = ['maze:1017~1', 'grid:1001~1', 'maze:1024~1', 'grid:1002~1', 'maze:1033~1', 'grid:1003~1', 'maze:1038~1', 'grid:1004~1', 'maze:1040~1', 'grid:1005~1', 'maze:1047~1', 'grid:1006~1'] as const
// chain hashes (FNV-1a over the JSON of chainsForSetup) of standard train / holdout / example-world keys, computed with the pre-T4 code
const HASH_PINS: Array<[string, string]> = [
  // the maze pins re-hashed 2026-10-14: the maze courses were loosened per user request (breadcrumb resampling
  // removed, RESAMPLE_KIND_M in chains.ts — route geometry identical, the collinear straight-line waypoints gone).
  // grid keeps its resampling: grid:1 is unchanged.
  ['maze:12', '4442b785'],
  ['maze:25', '34b9a12f'],
  ['maze:1017~1', '2d34a397'],
  ['maze:1038~1', '8d4c890f'],
  ['maze:1009', 'ef1d6b67'],
  ['grid:1', '8c69c139'],
]
// the deterministic adversarial scan result: [maze M1, maze M2, grid G1, grid G2]
const ADV_KEYS = ['maze:4011~2', 'maze:4008~2', 'grid:4001~2', 'grid:4002~2'] as const

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// --- polyline helpers (independent of chains.ts) ------------------------------------------------------------------------------------

function cumLen(pts: V2[]): number[] {
  const c = [0]
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
  return c
}
function at(pts: V2[], c: number[], off: number): V2 {
  for (let i = 1; i < pts.length; i++)
    if (c[i]! >= off) {
      const t = (off - c[i - 1]!) / (c[i]! - c[i - 1]!)
      return [pts[i - 1]![0] + t * (pts[i]![0] - pts[i - 1]![0]), pts[i - 1]![1] + t * (pts[i]![1] - pts[i - 1]![1])]
    }
  return pts[pts.length - 1]!
}
const headingDeg = (a: V2, b: V2) => (Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180) / Math.PI
const angleBetweenDeg = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
/** heading change (deg) between ~30 m and the final direction of the chain (a corner in the last ~26 m shows up here) */
const tailTurn = (pts: V2[]): number => {
  const cum = cumLen(pts)
  const L = cum[cum.length - 1]!
  const hEnd = headingDeg(at(pts, cum, Math.max(0, L - 4)), at(pts, cum, L - 0.5))
  const hFar = headingDeg(at(pts, cum, Math.max(0, L - 34)), at(pts, cum, Math.max(0, L - 28)))
  return angleBetweenDeg(hEnd, hFar)
}
/** angle (deg) between the chain's initial direction and the start heading */
const firstLegVsYaw = (pts: V2[], startYawDeg: number): number => {
  const cum = cumLen(pts)
  return angleBetweenDeg(headingDeg(pts[0]!, at(pts, cum, 3)), startYawDeg)
}

describe('adversarial key bands', () => {
  it('the standard train / holdout enumerations are unchanged (pinned pre-T4 lists)', { timeout: 300_000 }, () => {
    expect(acceptedSetupKeys(8, ['maze', 'grid'], 1)).toEqual([...TRAIN8])
    expect(acceptedSetupKeys(6, ['maze', 'grid'], 1001, 1)).toEqual([...HOLDOUT6])
    // a wider train band is the pinned list plus more of the same seed scan - never an adversarial key
    expect(acceptedSetupKeys(12, ['maze', 'grid'], 1).slice(0, TRAIN8.length)).toEqual([...TRAIN8])
  })

  it('standard setups are bit-identical (pinned pre-T4 chain hashes)', { timeout: 120_000 }, () => {
    for (const [k, h] of HASH_PINS) expect(fnv(JSON.stringify(chainsForSetup(k))), k).toBe(h)
  })

  it('the adversarial keys: pinned scan result, variant 2, seed >= ADV_SEED, collision-free by construction', { timeout: 300_000 }, () => {
    expect(adversarialSetupKeys(['maze', 'grid'])).toEqual([...ADV_KEYS])
    expect(adversarialSetupKeys(['maze'])).toEqual([ADV_KEYS[0], ADV_KEYS[1]])
    for (const k of ADV_KEYS) {
      const { kind, seed, variant } = parseCourseKey(k)
      expect(ADVERSARIAL_KINDS).toContain(kind)
      expect(seed).toBeGreaterThanOrEqual(ADV_SEED)
      expect(variant).toBe(ADV_VARIANT)
    }
    // the variant suffix alone separates the bands for ANY perKind / seed: train is always variant 0, holdout always variant 1
    for (const k of [...TRAIN8]) expect(parseCourseKey(k).variant, k).toBe(0)
    for (const k of [...HOLDOUT6]) expect(parseCourseKey(k).variant, k).toBe(1)
  })

  it('trainV3Episodes appends the adversarial setups; holdoutV3Episodes stays free of them', { timeout: 300_000 }, async () => {
    const train = trainV3Episodes(8, ['maze', 'grid'])
    expect(train.map((g) => g.setupKey)).toEqual([...TRAIN8, ...ADV_KEYS])
    for (const g of train.slice(TRAIN8.length)) {
      expect(g.keys.length).toBeGreaterThanOrEqual(MIN_CHAINS)
      expect(g.keys).toEqual(v3EpisodeKeys(g.setupKey))
      for (const k of g.keys) expect(parseChainEpisodeKey(k).v3, k).toBe(true)
    }
    const hold = holdoutV3Episodes(6, ['maze', 'grid'])
    expect(hold.map((g) => g.setupKey)).toEqual([...HOLDOUT6]) // bit-identical, no adversarial setups
    // the same holds for the full v3 kind set: adversarial setups are train-only (the crux kind's chain enumeration
    // runs the sync pursuit gate, so the physics engine is warmed first)
    await warmCruxGate()
    const trainAll = trainV3Episodes(2)
    const holdAll = holdoutV3Episodes(2)
    expect(trainAll.filter((g) => parseCourseKey(g.setupKey).variant === ADV_VARIANT).map((g) => g.setupKey)).toEqual([...ADV_KEYS])
    expect(holdAll.every((g) => parseCourseKey(g.setupKey).seed < ADV_SEED)).toBe(true)
    expect(flattenChainKeys(trainAll).some((k) => flattenChainKeys(holdAll).includes(k))).toBe(false)
  })

  it('adversarial generation is deterministic', { timeout: 120_000 }, () => {
    for (const k of ADV_KEYS) expect(JSON.stringify(chainsForSetup(k))).toBe(JSON.stringify(chainsForSetup(k)))
    expect(adversarialSetupKeys(['maze', 'grid'])).toEqual(adversarialSetupKeys(['maze', 'grid']))
  })
})

describe('adversarial setup geometry', () => {
  it('G1 (grid, mid-hairpin): pinned laneW 24, strip in 12-16 m (the U-turn corridor is tightened)', { timeout: 120_000 }, () => {
    const course = buildSetupCourse(ADV_KEYS[2])
    expect(course.layout!.laneW).toBe(24)
    expect(course.layout!.strip!).toBeGreaterThanOrEqual(12)
    expect(course.layout!.strip!).toBeLessThanOrEqual(16)
  })

  it('G2 (grid, endgame): every chain ends 15-25 m past the last hairpin, in the NEXT lane interior (not at the mouth)', { timeout: 120_000 }, () => {
    const course = buildSetupCourse(ADV_KEYS[3])
    const { laneW, zFar, zNear, lanes } = course.layout!
    const chains = chainsForSetup(ADV_KEYS[3])
    expect(chains.length).toBeGreaterThanOrEqual(MIN_CHAINS)
    for (const c of chains) {
      const end = c.points[c.points.length - 1]!
      const lane = Math.round(end[0] / laneW) // the lane the end sits in (centres at k * laneW)
      expect(Math.abs(end[0] - lane * laneW), `${ADV_KEYS[3]} end ${end}`).toBeLessThanOrEqual(2)
      const i = lane - 1 // the hairpin the chain completed: divider i opens into this lane
      expect(i).toBeGreaterThanOrEqual(1)
      expect(i).toBeLessThanOrEqual(lanes - 2)
      const past = i % 2 === 0 ? end[1] - zFar : zNear - end[1] // along the new lane's driving direction
      expect(past, `${ADV_KEYS[3]} end ${end}`).toBeGreaterThanOrEqual(15)
      expect(past, `${ADV_KEYS[3]} end ${end}`).toBeLessThanOrEqual(25)
    }
  })

  it('M1 (maze, corner-exit): every chain turns 70-145 deg within its last ~26 m (end one cell past a junction)', { timeout: 120_000 }, () => {
    for (const c of chainsForSetup(ADV_KEYS[0])) {
      const t = tailTurn(c.points)
      expect(t, `${ADV_KEYS[0]} tail turn`).toBeGreaterThanOrEqual(70)
      expect(t, `${ADV_KEYS[0]} tail turn`).toBeLessThanOrEqual(145)
    }
  })

  it('M2 (maze, lateral start): start heading ~90 deg off the first route cell, every chain leaves ~90 deg off the heading', { timeout: 120_000 }, () => {
    const course = buildSetupCourse(ADV_KEYS[1])
    const first = course.waypoints[0]!
    const canonical = headingDeg([0, 0], first)
    const yaw = course.startYawDeg!
    expect(angleBetweenDeg(yaw, canonical), `${ADV_KEYS[1]} start yaw`).toBeGreaterThanOrEqual(85)
    expect(angleBetweenDeg(yaw, canonical), `${ADV_KEYS[1]} start yaw`).toBeLessThanOrEqual(95)
    for (const c of chainsForSetup(ADV_KEYS[1])) {
      const a = firstLegVsYaw(c.points, yaw)
      expect(a, `${ADV_KEYS[1]} first leg`).toBeGreaterThanOrEqual(70)
      expect(a, `${ADV_KEYS[1]} first leg`).toBeLessThanOrEqual(110)
      expect(c.offM, `${ADV_KEYS[1]} offM (the start swing needs the room)`).toBeGreaterThanOrEqual(12)
    }
  })
})

describe('adversarial chains gates', () => {
  it('every adversarial setup: 2-4 chains, clear of the obstacles, pairwise Hausdorff >= 10 m, first accepted margin', { timeout: 300_000 }, () => {
    for (const k of ADV_KEYS) {
      const { kind } = parseCourseKey(k)
      const chains = chainsForSetup(k)
      expect(chains.length, `${k} chain count`).toBeGreaterThanOrEqual(MIN_CHAINS)
      expect(chains.length, `${k} chain count`).toBeLessThanOrEqual(CHAINS_PER_SETUP)
      const course = buildSetupCourse(k)
      chains.forEach((c, i) => {
        expect(c.points[0], `${k}#${i} start`).toEqual(course.startAt ?? [0, 0])
        expect(chainClearance(course.boxes, c.points), `${k}#${i} clearance`).toBeGreaterThanOrEqual(CLEARANCE[kind].min - 1e-6)
        for (let j = 0; j < i; j++) expect(hausdorff(chains[j]!.points, c.points), `${k} ${j}/${i}`).toBeGreaterThanOrEqual(MIN_HAUSDORFF_M)
      })
      // the grid band standardly accepts at its first margin (2.5) - so must the adversarial grid setups; the maze band standardly
      // accepts through its 1.0 fallback (the standard setups do too, e.g. maze:12), so the maze setups are checked via chainsForSetup
      if (kind === 'grid') expect(generateChains(k, CLEARANCE[kind].margins[0]!).length, `${k} first margin`).toBeGreaterThanOrEqual(MIN_CHAINS)
      expect(generateChains(k, CLEARANCE[kind].margins[0]!).length + generateChains(k, CLEARANCE[kind].margins[1]!).length, `${k} margins sane`).toBeGreaterThan(0)
      expect(chainClearance(course.boxes, chains[0]!.points), `${k} accepted chain clear`).toBeGreaterThanOrEqual(MIN_CLEARANCE - 1e-6)
    }
  })

  it('pure pursuit (v3 mode, as training drives the setups) finishes >= 70 % of the adversarial chains', { timeout: 300_000 }, async () => {
    const keys = ADV_KEYS.flatMap((k) => v3EpisodeKeys(k))
    expect(keys.length).toBeGreaterThanOrEqual(4 * MIN_CHAINS)
    const res = await Promise.all(keys.map((k) => runPolicyEpisode(pursuitV3(0.35), k)))
    const fin = res.filter((m) => m.outcome === 'finish').length
    console.log(`SOLVABILITY adversarial: ${fin}/${keys.length} = ${((100 * fin) / keys.length).toFixed(0)} %  outcomes ${res.map((m) => m.outcome[0]).join('')}`)
    expect(fin / keys.length).toBeGreaterThanOrEqual(0.7)
  })
})
