import { beforeAll, describe, expect, it } from 'vitest'
import { polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import {
  acceptedSetupKeys,
  chainClearance,
  chainEpisodeKey,
  chainsForSetup,
  CLEARANCE,
  flattenChainKeys,
  hausdorff,
  holdoutV3Episodes,
  MAX_DETOUR,
  MIN_CHAINS,
  parseChainEpisodeKey,
  trainV3Episodes,
  v3EpisodeKeys,
  type Chain,
} from './chains'
import { buildSetupCourse, CRUX_CLASSES, cruxClass, CRUX_GATE_M, parseCourseKey } from './courses'
import { CRUX_CHAINS_PER_SETUP, CRUX_JITTER_M, CRUX_LATERAL_OFF_M, CRUX_PURSUIT_SPEED, CRUX_VARIANT_GAP_M, cruxPursuitOutcomeSync, generateCruxChains, warmCruxGate } from './cruxChains'
import { runPolicyEpisode } from './episode'
import { pursuitV3 } from './handWired'
import { WallLos } from './wallLos'

/**
 * The crux curriculum (2026-10-12 decision): MANY TINY worlds, one crux class each (C1..C5 of the stall analysis), and
 * MANY MORE-OR-LESS GOOD ROUTES (jittered chain variants) through each crux. The tests pin the class band, the
 * signature geometry of every class, the chain gates (clearance / detour / distinctness) and the core invariant:
 * NO DEAD ZEROS - the pure-pursuit baseline finishes EVERY accepted chain, because the acceptance gate ran it.
 */

// the deterministic enumeration results: train seeds 1..15 (3 per class, C1..C5), holdout seeds 1002..1011 with the
// random start variant (2 per class; crux:1001~1 is rejected by the pursuit gate - the jittered start swings wide)
const TRAIN15: string[] = Array.from({ length: 15 }, (_, i) => `crux:${i + 1}`)
const HOLDOUT10: string[] = Array.from({ length: 10 }, (_, i) => `crux:${1002 + i}~1`)

// --- helpers (independent of cruxChains.ts) -----------------------------------------------------------------------------------------

function cumLen(pts: V2[]): number[] {
  const c = [0]
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
  return c
}
/** the point `arcOff` further along the polyline (clamped to the end - the carrot of the policy input stage) */
function pointAt(pts: V2[], cum: number[], arc: number): V2 {
  const total = cum[cum.length - 1]!
  const target = Math.min(arc, total)
  for (let i = 1; i < pts.length; i++)
    if (cum[i]! >= target) {
      const t = (target - cum[i - 1]!) / (cum[i]! - cum[i - 1]!)
      return [pts[i - 1]![0] + t * (pts[i]![0] - pts[i - 1]![0]), pts[i - 1]![1] + t * (pts[i]![1] - pts[i - 1]![1])]
    }
  return pts[pts.length - 1]!
}
const headingDeg = (a: V2, b: V2) => (Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180) / Math.PI
const angleBetweenDeg = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
/** signed heading change a -> b (deg, +left / -right in the course yaw convention) */
const signedTurnDeg = (a: number, b: number) => {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}
const wallLosOf = (course: ReturnType<typeof buildSetupCourse>) => new WallLos(course.boxes.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])))

// the chain enumeration runs the SYNC pursuit gate, which builds simulators through WorldSimulator.createSync: the
// physics engine must be warm before any crux chain is generated (Rapier wasm cannot load synchronously)
beforeAll(() => warmCruxGate())

describe('crux class band', () => {
  it('the class of a seed is (seed - 1) % CRUX_CLASSES; train and holdout cover every class evenly', { timeout: 120_000 }, () => {
    for (let i = 0; i < 3 * CRUX_CLASSES; i++) expect(cruxClass(i + 1)).toBe(i % CRUX_CLASSES)
    expect(acceptedSetupKeys(15, ['crux'], 1)).toEqual([...TRAIN15])
    expect(acceptedSetupKeys(10, ['crux'], 1001, 1)).toEqual([...HOLDOUT10])
    const classes = (keys: readonly string[]) => keys.map((k) => cruxClass(parseCourseKey(k).seed)).sort((a, b) => a - b).join('')
    expect(classes(TRAIN15)).toBe('000111222333444')
    expect(classes(HOLDOUT10)).toBe('0011223344')
  })

  it('train / holdout episodes are disjoint, v3-flagged and grouped by setup', { timeout: 120_000 }, () => {
    const train = trainV3Episodes(15, ['crux'])
    const hold = holdoutV3Episodes(10, ['crux'])
    expect(train.map((g) => g.setupKey)).toEqual([...TRAIN15])
    expect(hold.map((g) => g.setupKey)).toEqual([...HOLDOUT10])
    expect(flattenChainKeys(train).some((k) => flattenChainKeys(hold).includes(k))).toBe(false)
    for (const g of [...train, ...hold]) {
      expect(g.keys).toEqual(v3EpisodeKeys(g.setupKey))
      for (const k of g.keys) expect(parseChainEpisodeKey(k).v3, k).toBe(true)
    }
  })
})

describe('crux chain gates', () => {
  it('is deterministic (every class)', { timeout: 300_000 }, () => {
    for (const seed of [1, 2, 3, 4, 5, 11]) {
      const k = `crux:${seed}`
      expect(JSON.stringify(chainsForSetup(k)), k).toBe(JSON.stringify(chainsForSetup(k)))
    }
  })

  it('every setup: 2-6 chains (mostly 6), clear of the walls, detour-bounded, distinct but near the base path', { timeout: 300_000 }, () => {
    const counts: number[] = []
    for (const k of [...TRAIN15, ...HOLDOUT10]) {
      const chains = chainsForSetup(k)
      counts.push(chains.length)
      expect(chains.length, `${k}`).toBeGreaterThanOrEqual(MIN_CHAINS)
      expect(chains.length, `${k}`).toBeLessThanOrEqual(CRUX_CHAINS_PER_SETUP)
      const course = buildSetupCourse(k)
      const base = [course.startAt ?? [0, 0], ...course.waypoints] as V2[]
      const baseLen = (() => {
        const c = cumLen(base)
        return c[c.length - 1]!
      })()
      chains.forEach((c, i) => {
        expect(c.points[0], `${k}#${i} start`).toEqual(course.startAt ?? [0, 0])
        expect(chainClearance(course.boxes, c.points), `${k}#${i}`).toBeGreaterThanOrEqual(CLEARANCE.crux.min - 1e-6)
        expect(c.length, `${k}#${i} detour`).toBeLessThanOrEqual(MAX_DETOUR * baseLen)
        // the variants jitter the waypoints of the same base route (<= CRUX_JITTER_M per axis): they stay NEAR the
        // base path - the polyline distance is a bit above the raw offsets where adjacent fillets compound (C3's S)
        const d = hausdorff(c.points, base)
        expect(d, `${k}#${i} jitter bound`).toBeLessThanOrEqual(CRUX_JITTER_M + 4)
        if (i > 0) expect(d, `${k}#${i} distinct`).toBeGreaterThanOrEqual(CRUX_VARIANT_GAP_M)
        for (let j = 0; j < i; j++) expect(hausdorff(chains[j]!.points, c.points), `${k} ${j}/${i}`).toBeGreaterThanOrEqual(CRUX_VARIANT_GAP_M)
      })
    }
    console.log(`chains/setup crux (train 15 + holdout 10): ${counts.join(',')}  mean ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2)}`)
    expect(counts.reduce((a, b) => a + b, 0) / counts.length).toBeGreaterThan(4)
  })

  it('NO DEAD ZEROS: the pure-pursuit baseline finishes EVERY chain of every enumerated setup (the acceptance gate ran it)', { timeout: 300_000 }, async () => {
    const keys = [...TRAIN15, ...HOLDOUT10].flatMap((k) => v3EpisodeKeys(k))
    expect(keys.length).toBeGreaterThanOrEqual(MIN_CHAINS * 25)
    // sequential (one episode at a time, like the gate): concurrent episodes share the global determinism patch
    let fin = 0
    const outcomes: string[] = []
    for (const k of keys) {
      const m = await runPolicyEpisode(pursuitV3(CRUX_PURSUIT_SPEED), k)
      outcomes.push(m.outcome[0]!)
      if (m.outcome === 'finish') fin++
    }
    console.log(`SOLVABILITY crux: ${fin}/${keys.length} = ${((100 * fin) / keys.length).toFixed(0)} %  outcomes ${outcomes.join('')}`)
    expect(fin).toBe(keys.length)
  })

  it('sync gate == async machinery: the same chain, same episode key, same baseline - same verdict (incl. chains the gate must reject)', { timeout: 300_000 }, async () => {
    // one setup per class, every accepted chain of it: the sync driver and runPolicyEpisode must agree
    for (const setup of ['crux:1', 'crux:2', 'crux:3', 'crux:4', 'crux:5']) {
      for (const [i] of chainsForSetup(setup).entries()) {
        const sync = cruxPursuitOutcomeSync(setup, i)
        const async = await runPolicyEpisode(pursuitV3(CRUX_PURSUIT_SPEED), chainEpisodeKey(setup, i, true))
        expect(sync, `${setup}#${i} sync vs async`).toBe(async.outcome)
      }
    }
    // negative cases the gate must reject identically: the goal moved into the end wall (the baseline cannot finish)
    for (const [setup, chain] of [
      ['crux:1', chainsForSetup('crux:1')[0]!],
      ['crux:5', chainsForSetup('crux:5')[0]!],
    ] as Array<[string, Chain]>) {
      const broken: Chain = { ...chain, points: chain.points.map((p, i) => (i === chain.points.length - 1 ? [p[0] * 2.5, p[1]] : p)) }
      const sync = cruxPursuitOutcomeSync(setup, 0, broken)
      const async = await runPolicyEpisode(pursuitV3(CRUX_PURSUIT_SPEED), chainEpisodeKey(setup, 0, true), { chainOverride: broken })
      expect(sync, `${setup} broken goal sync vs async`).toBe(async.outcome)
      expect(sync, `${setup} broken goal must not finish`).not.toBe('finish')
    }
  })
})

describe('crux class signatures', () => {
  it('C1 occluded fast corner: long narrow approach, and the carrot of a fast approach is occluded by the corner wall', { timeout: 120_000 }, () => {
    for (const k of ['crux:1', 'crux:6', 'crux:11']) {
      const course = buildSetupCourse(k)
      const L = course.layout!
      expect(L.cls).toBe(0)
      expect(L.approach).toBeGreaterThanOrEqual(32)
      expect(L.approach).toBeLessThanOrEqual(50)
      expect(L.w).toBeGreaterThanOrEqual(10)
      expect(L.w).toBeLessThanOrEqual(11)
      const los = wallLosOf(course)
      const base = [course.startAt ?? [0, 0], ...course.waypoints] as V2[]
      const cum = cumLen(base)
      const cornerArc = cum[1]!
      // sample approach positions (on the chain, before the corner): the carrot at look-ahead 8 + 0.6 v of a FAST
      // approach (v = 25, the stall-analysis speeds) must be occluded for some of them
      let blocked = 0
      for (let s = 4; s < cornerArc - 2; s += 2) {
        const p = pointAt(base, cum, s)
        const carrot = pointAt(base, cum, s + 8 + 0.6 * 25)
        if (los.blocked(p[0], p[1], carrot[0], carrot[1])) blocked++
      }
      expect(blocked, `${k} occluded approach samples`).toBeGreaterThanOrEqual(2)
      // past the corner the corridor is open: the carrot ahead of an exit position is in plain sight
      for (let s = cornerArc + 4; s < cum[cum.length - 1]! - 4; s += 2) {
        const p = pointAt(base, cum, s)
        const carrot = pointAt(base, cum, s + 8 + 0.6 * 10)
        expect(los.blocked(p[0], p[1], carrot[0], carrot[1]), `${k} exit sample at ${s}`).toBe(false)
      }
    }
  })

  it('C2 confined corner pocket: narrowed mouth, and 10+ m of free backing room behind the corner', { timeout: 120_000 }, () => {
    for (const k of ['crux:2', 'crux:7', 'crux:12']) {
      const course = buildSetupCourse(k)
      const L = course.layout!
      expect(L.cls).toBe(1)
      expect(L.gap).toBeGreaterThanOrEqual(8.5)
      expect(L.gap).toBeLessThanOrEqual(9.5)
      expect(L.gap!).toBeLessThan(L.w2) // the stub narrows the mouth below the corridor width
      // the backing room: the approach behind the corner mouth is a free 10 m (+2 margin off the walls)
      const z0 = -L.approach + L.w2 + 1
      const room = rectPoly((L.dir * 0), z0 + 5, 0, L.w - 4, 10)
      for (const b of course.boxes) expect(polyGap(room, rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])), `${k} backing room vs box ${b.at}`).toBeGreaterThan(0)
    }
  })

  it('C3 S-bend: two adjacent opposite 90 deg turns around the central block', { timeout: 120_000 }, () => {
    for (const k of ['crux:3', 'crux:8', 'crux:13']) {
      const course = buildSetupCourse(k)
      const L = course.layout!
      expect(L.cls).toBe(2)
      const pts = [course.startAt ?? [0, 0], ...course.waypoints] as V2[]
      expect(pts.length).toBe(4)
      const h = [headingDeg(pts[0]!, pts[1]!), headingDeg(pts[1]!, pts[2]!), headingDeg(pts[2]!, pts[3]!)]
      const t1 = signedTurnDeg(h[0]!, h[1]!)
      const t2 = signedTurnDeg(h[1]!, h[2]!)
      expect(Math.abs(t1), `${k} first turn`).toBeGreaterThanOrEqual(80)
      expect(Math.abs(t1), `${k} first turn`).toBeLessThanOrEqual(100)
      expect(Math.abs(t2), `${k} second turn`).toBeGreaterThanOrEqual(80)
      expect(Math.abs(t2), `${k} second turn`).toBeLessThanOrEqual(100)
      expect(t1 * t2, `${k} opposite turns`).toBeLessThan(0)
      // the two turns are adjacent: the crossing between them is the minimum the ~10 m turning circle allows
      const cross = Math.hypot(pts[2]![0] - pts[1]![0], pts[2]![1] - pts[1]![1])
      expect(cross, `${k} crossing`).toBeGreaterThanOrEqual(L.w + L.bw)
      expect(cross, `${k} crossing`).toBeLessThanOrEqual(L.w + L.bw + 2)
    }
  })

  it('C4 lateral gate entry: first leg ~90 deg off the start heading, gate at 16 m, every chain carries offM 16', { timeout: 120_000 }, () => {
    for (const k of ['crux:4', 'crux:9', 'crux:14']) {
      const course = buildSetupCourse(k)
      const L = course.layout!
      expect(L.cls).toBe(3)
      expect(L.gate).toBe(CRUX_GATE_M)
      const start = course.startAt ?? [0, 0]
      const first = course.waypoints[0]!
      const angle = angleBetweenDeg(headingDeg(start, first), course.startYawDeg ?? 0)
      expect(angle, `${k} first leg vs start heading`).toBeGreaterThanOrEqual(70)
      expect(angle, `${k} first leg vs start heading`).toBeLessThanOrEqual(110)
      // wall stubs flank the entry gap on the gate line
      const gapTop = L.zg + L.gw / 2
      const gapBottom = L.zg - L.gw / 2
      const stubAt = (z: number) => course.boxes.some((b) => Math.abs(Math.abs(b.at[0]) - (L.gate + 1)) < 1 && z > Math.min(b.at[1] - b.size[1] / 2, b.at[1] + b.size[1] / 2) && z < Math.max(b.at[1] - b.size[1] / 2, b.at[1] + b.size[1] / 2))
      expect(stubAt(gapTop + 2), `${k} north stub`).toBe(true)
      expect(stubAt(gapBottom - 2), `${k} south stub`).toBe(true)
      for (const c of chainsForSetup(k)) expect(c.offM, `${k} offM (the M2 lesson)`).toBe(CRUX_LATERAL_OFF_M)
    }
  })

  it('C5 final corner + goal: the goal sits right after the last corner, 3.5 m before the end wall', { timeout: 120_000 }, () => {
    for (const k of ['crux:5', 'crux:10', 'crux:15']) {
      const course = buildSetupCourse(k)
      const L = course.layout!
      expect(L.cls).toBe(4)
      expect(L.approach).toBeGreaterThanOrEqual(26)
      expect(L.approach).toBeLessThanOrEqual(34)
      const pts = [course.startAt ?? [0, 0], ...course.waypoints] as V2[]
      const lastLeg = Math.hypot(pts[2]![0] - pts[1]![0], pts[2]![1] - pts[1]![1])
      expect(lastLeg, `${k} final stub`).toBeGreaterThanOrEqual(6.5)
      expect(lastLeg, `${k} final stub`).toBeLessThanOrEqual(12.5)
      const turn = angleBetweenDeg(headingDeg(pts[0]!, pts[1]!), headingDeg(pts[1]!, pts[2]!))
      expect(turn, `${k} final corner`).toBeGreaterThanOrEqual(80)
      expect(turn, `${k} final corner`).toBeLessThanOrEqual(100)
      // the end wall seals the exit just past the goal: overshooting the goal means the wall
      const goal = pts[pts.length - 1]!
      const endWall = rectPoly(L.dir * (L.exit + 1), -L.approach + L.w2 / 2, 0, 2, L.w2 + 4)
      expect(course.boxes.some((b) => polyGap(endWall, rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])) < 1e-6), `${k} end wall past the goal ${goal}`).toBe(true)
    }
  })
})

describe('crux acceptance gate plumbing', () => {
  it('generateCruxChains is the crux branch of chainsForSetup (same cache content, [] only when the gates reject)', { timeout: 120_000 }, () => {
    // a hand-made setup key far outside the standard bands, built only for this check
    expect(generateCruxChains('crux:51')).toEqual(chainsForSetup('crux:51'))
    expect(chainsForSetup('crux:52').length).toBeGreaterThanOrEqual(MIN_CHAINS)
  })

  it('the other kinds are untouched: the maze / grid standard bands keep their pinned keys', { timeout: 300_000 }, () => {
    expect(acceptedSetupKeys(2, ['maze', 'grid'], 1)).toEqual(['maze:12', 'grid:1', 'maze:19', 'grid:2'])
    expect(acceptedSetupKeys(2, ['maze', 'grid'], 1001, 1)).toEqual(['maze:1017~1', 'grid:1001~1', 'maze:1024~1', 'grid:1002~1'])
  })
})
