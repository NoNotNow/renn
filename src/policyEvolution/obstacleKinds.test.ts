import { describe, expect, it } from 'vitest'
import { acceptedSetupKeys, chainClearance, chainsForSetup, CLEARANCE, flattenChainKeys, generateChains, holdoutV3Episodes, MIN_CHAINS, trainV3Episodes } from './chains'
import { buildSetupCourse, COURSE_START, parseCourseKey, V3_KINDS, type Course } from './courses'
import { drivePolicyEpisode, OFF_CHAIN_M, runPolicyEpisode, type EpisodeDriveCtx } from './episode'
import { genomeLengthV3 } from './policy'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { LegProgress } from './legs'
import { WallLos } from './wallLos'
import { DetourShaping } from './detourShaping'
import { initRapier } from '@/physics/rapierPhysics'
import { installDeterminism } from '@/test/avLab/determinism'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * The obstacle-fluency detour kinds (2026-10-14, see agent-context/feature-policy-evolution.md): `blockade`
 * (transverse wall segments crossing the direct start -> target line, the opening alternating sides) and
 * `blocks` (big jittered blocks with one ON the line) — the target vector points THROUGH an obstacle, forward
 * progress demands a committed detour around its end. DIRECT-LINE GUIDANCE (2026-10-15, the gen-95 stop
 * redesign): the guidance chain of these kinds is the DIRECT start -> target line THROUGH the obstacles — the
 * net (14 rays, 50 m range) must learn the detour itself; the planner routes would pre-chew it. Pinned here:
 *  - registry + TRAIN / HOLDOUT enumeration (the kinds train and validate like every other kind),
 *  - the geometry invariant that makes each kind ITS task: the DIRECT start -> target line crosses obstacle(s),
 *    the detour exists and is wide enough (openings 12-18 m / >= 12 m corridors, by construction),
 *  - the per-VARIANT geometry noise (a fresh obstacle world every generation, not one memorized course),
 *  - the SOLVABILITY GATE (planner acceptance unchanged, >= MIN_CHAINS routes must exist) and the direct-line
 *    chains it returns (one leg, plaza-scale offcourse tolerance, clearance 0 THROUGH the walls is the design),
 *  - the quarter-weight deviation penalty of the peak score (an intended swing stays cheap, cheese still pays),
 *  - the WallLos progress-credit gate: credit freezes behind a wall and RESUMES past every crossing,
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

describe('blockade (transverse wall pairs crossing the target line)', () => {
  /**
   * T1 USER-AUTHORIZED COURSE CHANGE (2026-10-15): the openings moved from the side walls (demanded swing
   * hw = 34-42 m, measured plateau 0.253 after 600 detour-focus gens) to MID-PLAZA — seeded centres in the
   * demonstrated learnable band (~10-20 m), alternating sides so forward progress stays a sequence of
   * committed lateral swings. Each wall is TWO SEGMENTS whose union still spans across x = 0.
   */
  it('the direct line passes THROUGH every wall; MID-PLAZA 12-18 m openings in the learnable swing band, alternating sides', () => {
    for (const seed of [1, 2, 3]) {
      const course = buildSetupCourse(`blockade:${seed}`)
      const hw = course.layout!.hw!
      const tz = course.layout!.tz!
      // transverse wall SEGMENTS (thickness 2, interior z); every wall = a PAIR of segments at the same z
      const segs = course.boxes.filter((b) => b.size[1] === 2 && b.size[0] > 4 && b.at[1] < -20 && b.at[1] > tz + 20)
      const byZ = new Map<number, typeof segs>()
      for (const s of segs) byZ.set(s.at[1]!, [...(byZ.get(s.at[1]!) ?? []), s])
      expect(byZ.size).toBeGreaterThanOrEqual(2)
      const centres: number[] = []
      for (const pair of byZ.values()) {
        expect(pair).toHaveLength(2)
        const [left, right] = [...pair].sort((a, b) => a.at[0]! - b.at[0]!)
        const gapL = left.at[0]! + left.size[0] / 2
        const gapR = right.at[0]! - right.size[0] / 2
        const open = gapR - gapL
        const centre = (gapL + gapR) / 2
        centres.push(centre)
        expect(open).toBeGreaterThanOrEqual(12)
        expect(open).toBeLessThanOrEqual(18)
        // mid-plaza swing band: the seeded centre sits 12-22 m off the middle the target line runs in
        expect(Math.abs(centre)).toBeGreaterThanOrEqual(12)
        expect(Math.abs(centre)).toBeLessThanOrEqual(22)
        // the opening never touches the middle band: the whole jittered line (|x| <= 6) stays inside the wall
        expect(Math.abs(centre) - open / 2).toBeGreaterThanOrEqual(8)
        // both segments are real walls: the inner one spans across x = 0, the outer one closes to the side wall
        expect(left.at[0]! - left.size[0] / 2).toBeLessThanOrEqual(-hw + 0.5)
        expect(right.at[0]! + right.size[0] / 2).toBeGreaterThanOrEqual(hw - 0.5)
        expect(hw - Math.abs(centre) - open / 2).toBeGreaterThanOrEqual(1)
      }
      // the openings alternate sides: the detour weaves
      expect(centres.map(Math.sign).some((s, i) => i > 0 && s === centres.map(Math.sign)[i - 1])).toBe(false)
      // the direct line crosses EVERY wall — the target vector points through the whole blockade
      expect(lineCrossedBoxes(course)).toBeGreaterThanOrEqual(byZ.size)
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

describe('the detour kinds: planner SOLVABILITY gate, DIRECT-LINE guidance chains', () => {
  it('accepted setups return direct start -> target chains (one leg, plaza-scale offM, clearance 0 THROUGH the walls)', () => {
    for (const kind of NEW_KINDS) {
      const setups = acceptedSetupKeys(2, [kind], 1)
      expect(setups.length).toBe(2)
      for (const key of setups) {
        const chains = chainsForSetup(key)
        expect(chains.length).toBeGreaterThanOrEqual(MIN_CHAINS)
        const course = buildSetupCourse(key)
        const start = course.startAt ?? COURSE_START
        const target = course.waypoints[0]!
        for (const c of chains) {
          // the guidance chain is the DIRECT line: [start, end] — no planner route, no legs, no breadcrumbs
          expect(c.points).toHaveLength(2)
          expect(c.points[0]!).toEqual(start)
          // every end sits in the target region behind the obstacles (not at some generic far end)
          expect(Math.hypot(c.points[1]![0] - target[0], c.points[1]![1] - target[1])).toBeLessThanOrEqual(25)
          expect(c.legEnds).toBeUndefined()
          expect(c.length).toBeGreaterThan(100) // the target sits 140+ m away: progress demands the detour
          // plaza-scale offcourse tolerance: the intended swing around a wall end must never end the episode
          expect(c.offM).toBe((course.layout!.hw ?? 0) + 10)
          expect(c.offM!).toBeGreaterThan(OFF_CHAIN_M)
          // the guidance line runs THROUGH the obstacles: clearance below the planner minimum is the DESIGN
          expect(chainClearance(course.boxes, c.points)).toBeLessThan(CLEARANCE[kind].min)
        }
        // the ends are distinct routes (the chooseEnds separation rule survives the direct-line switch)
        for (let i = 1; i < chains.length; i++) for (let j = 0; j < i; j++) {
          const a = chains[i]!.points[1]!
          const b = chains[j]!.points[1]!
          expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(8)
        }
      }
    }
  })

  it('the planner acceptance stays the SOLVABILITY gate: chains exist exactly when planner routes exist', () => {
    for (const kind of NEW_KINDS) {
      for (const seed of [1, 2, 3, 4]) {
        const key = `${kind}:${seed}`
        const solvable = CLEARANCE[kind].margins.some((m) => generateChains(key, m).length >= MIN_CHAINS)
        expect(chainsForSetup(key).length >= MIN_CHAINS).toBe(solvable)
      }
    }
  })

  it('planner grids are variant-safe (the variant first cannot poison the direct-line chains)', () => {
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

/** densify a polyline to ~step m points (the walk of the LOS test) */
function densify(points: V2[], step: number): V2[] {
  const out: V2[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

describe('the detour kinds pay a QUARTER-weight deviation penalty (the intended swing stays cheap)', () => {
  /**
   * Scripted double of the simulator: the car teleports along a fixed lateral offset from the chain (facing -Z,
   * constant speed, no contacts), so the peak score is a pure function of the scoring rules — the deviation
   * weight is observable as the peak difference between a detour-kind key and a normal-kind key on the SAME
   * trajectory, calibrated against an on-chain (dev 0) run of the same trajectory shape.
   */
  const scriptedEpisode = (key: string, dev: number): { peakNorm: number } => {
    const dt = DEFAULT_DT
    const seconds = 9
    const frames = Math.round(seconds / dt)
    const path: V2[] = Array.from({ length: frames + 1 }, (_, f) => [dev, -(10 * f * dt)] as V2)
    let frame = 0
    const sim = {
      runFrames: (n: number) => {
        frame += n
      },
      getPosition: () => {
        const p = path[Math.min(frame, frames)]!
        return [p[0], 0.5, p[1]]
      },
      getRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      getVelocity: () => [0, 0, -10],
      getTouchingEntityIds: () => [],
    } as unknown as WorldSimulator
    const chain: V2[] = [
      [0, 0],
      [0, -100],
    ]
    const route = new LegProgress(chain, undefined, 30)
    const ctx: EpisodeDriveCtx = {
      sim,
      key,
      seconds,
      v3: true,
      route,
      routeLength: 100,
      offCourseM: 30,
      chainPoints: chain,
      walls: [],
      wallIds: new Set(),
      det: installDeterminism(1, 0),
    }
    try {
      return { peakNorm: drivePolicyEpisode(ctx).peakNorm! }
    } finally {
      ctx.det.restore()
    }
  }

  it('the same 20 m off-chain trajectory pays a QUARTER of the deviation on the detour kinds, the full price elsewhere', () => {
    const onChain = scriptedEpisode('free:1#0v3', 0)
    const detour = scriptedEpisode('blockade:1#0v3', 20)
    const normal = scriptedEpisode('free:1#0v3', 20)
    // 20 m off a 100 m chain: the deviation term is 0.20 at full weight, 0.05 at quarter weight
    expect(normal.peakNorm).toBeCloseTo(onChain.peakNorm - 0.2, 2)
    expect(detour.peakNorm).toBeCloseTo(onChain.peakNorm - 0.05, 2)
    expect(detour.peakNorm - normal.peakNorm).toBeCloseTo(0.15, 2)
  })
})

describe('the WallLos progress-credit gate freezes behind walls and RESUMES past every crossing', () => {
  const wallsOf = (course: Course) => course.boxes.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))

  it('blockade: a drivable detour walk banks credit past every wall and finishes in full', () => {
    const key = acceptedSetupKeys(1, ['blockade'], 1)[0]!
    const course = buildSetupCourse(key)
    const chain = chainsForSetup(key)[0]!
    const gated = new LegProgress(chain.points, undefined, chain.offM, new WallLos(wallsOf(course)))
    const raw = new LegProgress(chain.points, undefined, chain.offM)
    // a drivable detour exists — the planner route is the solvability gate's own proof; walk it
    const planner = generateChains(key, CLEARANCE.blockade.margins[0]!)[0]!
    const walk = densify([...planner.points, chain.points[chain.points.length - 1]!], 2)
    const [sx, sz] = [chain.points[0]![0], chain.points[0]![1]]
    const [ex, ez] = [chain.points[1]![0], chain.points[1]![1]]
    const len = chain.length
    const sAt = (z: number) => Math.max(0, Math.min(len, (((0 - sx) * (ex - sx) + (z - sz) * (ez - sz)) / (len * len)) * len))
    const walls = course.boxes
      .filter((b) => b.size[1] === 2 && b.size[0] > 20 && b.at[1] < -20 && b.at[1] > course.layout!.tz! + 20)
      .map((b) => b.at[1]!)
      .sort((a, b) => b - a)
    expect(walls.length).toBeGreaterThanOrEqual(2)
    let frozenSeen = false
    const creditedPast = walls.map(() => -1)
    for (const p of walk) {
      const c = gated.update(p[0], p[1])
      raw.update(p[0], p[1])
      if (raw.progress - c > 1) frozenSeen = true
      walls.forEach((w, i) => {
        if (creditedPast[i]! < 0 && p[1] < w - 10) creditedPast[i] = c
      })
    }
    // past every wall (10 m clear of it) the credit has resumed BEYOND the wall's arc position
    walls.forEach((w, i) => expect(creditedPast[i]!).toBeGreaterThan(sAt(w)))
    // arrival at the target: finish credits in full, gated == raw == the whole direct line
    expect(gated.done).toBe(true)
    expect(gated.progress).toBe(chain.length)
    expect(raw.progress).toBe(chain.length)
    expect(frozenSeen).toBe(true) // the gate actually bites on the way (credit frozen behind a wall)
  })

  it('blocks: the walk around the pinned block finishes in full credit with the gate biting on the way', () => {
    const key = acceptedSetupKeys(1, ['blocks'], 1)[0]!
    const course = buildSetupCourse(key)
    const chain = chainsForSetup(key)[0]!
    const gated = new LegProgress(chain.points, undefined, chain.offM, new WallLos(wallsOf(course)))
    const raw = new LegProgress(chain.points, undefined, chain.offM)
    const planner = generateChains(key, CLEARANCE.blocks.margins[0]!)[0]!
    const walk = densify([...planner.points, chain.points[chain.points.length - 1]!], 2)
    let frozenSeen = false
    for (const p of walk) {
      const c = gated.update(p[0], p[1])
      raw.update(p[0], p[1])
      if (raw.progress - c > 1) frozenSeen = true
    }
    expect(gated.done).toBe(true)
    expect(gated.progress).toBe(chain.length)
    expect(frozenSeen).toBe(true)
  })
})

describe('fitness shaping (opt-in lateral-passing credit, DESIGN test-results/policy-evolution/fitness-shaping/)', () => {
  /**
   * Scripted swing episode on a synthetic one-gate plaza (chain (0,0)->(0,-100), gate at z = -50.7 with
   * opening [-23.8, -11.3], side walls at |x| in [36, 38]): the car drives straight to z = -30, then
   * swings 5 m toward the opening and stops. The drive-level seam: with the shaper on the ctx the
   * metrics carry `shapingBonus` (= 5/100 for the partial swing); without it the field is absent.
   */
  const scriptedSwing = (withShaper: boolean) => {
    const dt = DEFAULT_DT
    const seconds = 4
    const frames = Math.round(seconds / dt)
    const straight = 3 // 3 s at 10 m/s -> z = -30
    const path: V2[] = Array.from({ length: frames + 1 }, (_, f) => {
      const t = f * dt
      const z = -Math.min(t, straight) * 10
      const x = t <= straight ? 0 : -Math.min((t - straight) * 10, 5)
      return [x, z] as V2
    })
    let frame = 0
    const sim = {
      runFrames: (n: number) => {
        frame += n
      },
      getPosition: () => {
        const p = path[Math.min(frame, frames)]!
        return [p[0], 0.5, p[1]]
      },
      getRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      getVelocity: () => [0, 0, -10],
      getTouchingEntityIds: () => [],
    } as unknown as WorldSimulator
    const chain: V2[] = [
      [0, 0],
      [0, -100],
    ]
    const wallBoxes: Array<{ at: [number, number]; size: [number, number] }> = [
      { at: [-29.9, -50.7], size: [12.2, 2] },
      { at: [12.35, -50.7], size: [47.3, 2] },
      { at: [37, -50], size: [2, 100] },
      { at: [-37, -50], size: [2, 100] },
    ]
    const walls = wallBoxes.map((b) => ({ cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2, poly: rectPoly(b.at[0], b.at[1], 0, b.size[0], b.size[1]) }))
    const ctx: EpisodeDriveCtx = {
      sim,
      key: 'blockade:1#0v3',
      seconds,
      v3: true,
      route: new LegProgress(chain, undefined, 30),
      routeLength: 100,
      offCourseM: 30,
      chainPoints: chain,
      walls,
      wallIds: new Set(),
      det: installDeterminism(1, 0),
      ...(withShaper ? { shaping: new DetourShaping(chain, walls, 100) } : {}),
    }
    try {
      return drivePolicyEpisode(ctx)
    } finally {
      ctx.det.restore()
    }
  }

  it('a scripted PARTIAL swing earns shapingBonus while its credited arc is stuck before the wall', () => {
    const m = scriptedSwing(true)
    expect(m.shapingBonus).toBeCloseTo(5 / 100, 4)
    // the credited arc never passed the straight-run distance (the wall blocks it) — the zero-credit gap
    expect(m.progress).toBeLessThan(35)
  })

  it('without the shaper the metrics have NO shapingBonus field (opt-in, byte-identical default)', () => {
    const m = scriptedSwing(false)
    expect('shapingBonus' in m).toBe(false)
  })

  it('runPolicyEpisode: the flag shapes ONLY direct-line kinds; without it the field is absent', async () => {
    await initRapier()
    const zero = new Array<number>(genomeLengthV3(24)).fill(0)
    const detourKey = `${acceptedSetupKeys(1, ['blockade'], 1)[0]}#0v3`
    const plainKey = `${acceptedSetupKeys(1, ['gates'], 1)[0]}#0v3`
    const shaped = await runPolicyEpisode(zero, detourKey, { shaping: true })
    expect('shapingBonus' in shaped).toBe(true)
    expect(shaped.shapingBonus).toBe(0) // the zero policy never moves
    const unshaped = await runPolicyEpisode(zero, detourKey)
    expect('shapingBonus' in unshaped).toBe(false)
    const plain = await runPolicyEpisode(zero, plainKey, { shaping: true })
    expect('shapingBonus' in plain).toBe(false)
  }, 120_000)

  it('REAL geometry pin: on a real blockade setup a partial swing pays while the credited arc is frozen', () => {
    const wallsOf = (course: Course) => course.boxes.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))
    const key = acceptedSetupKeys(1, ['blockade'], 1)[0]!
    const course = buildSetupCourse(key)
    const chain = chainsForSetup(key)[0]!
    const gated = new LegProgress(chain.points, undefined, chain.offM, new WallLos(wallsOf(course)))
    const shaper = new DetourShaping(chain.points, wallsOf(course).map((p) => ({ cx: 0, cz: 0, r: 0, poly: p })), chain.length)
    // first wall plane + its opening, read off the course geometry (independent of the shaper's frame)
    const z0 = Math.max(...course.boxes.filter((b) => b.size[1] === 2 && b.size[0] > 20 && b.at[1]! < -20 && b.at[1]! > course.layout!.tz! + 20).map((b) => b.at[1]!))
    const segs = course.boxes
      .filter((b) => Math.abs(b.at[1]! - z0) < 0.5 && b.size[1] === 2 && b.size[0] < 2 * course.layout!.hw!)
      .map((b) => [Math.min(b.at[0]! - b.size[0] / 2, b.at[0]! + b.size[0] / 2), Math.max(b.at[0]! - b.size[0] / 2, b.at[0]! + b.size[0] / 2)] as [number, number])
      .sort((a, b) => a[0] - b[0])
    expect(segs.length).toBe(2)
    const openLo = segs[0]![1]
    const openHi = segs[1]![0]
    const [sx, sz] = chain.points[0]!
    const [ex, ez] = chain.points[1]!
    const at = (f: number): V2 => [sx + (ex - sx) * f, sz + (ez - sz) * f]
    // walk: 30 m along the line (the wall is 20+ m ahead), then a PARTIAL swing 40 % of the way to the
    // NEAREST edge of the opening interval (the line passes through the wall, so the start is outside it)
    const before = at(30 / chain.length)
    const nearEdge = before[0]! < openLo ? openLo : before[0]! > openHi ? openHi : before[0]!
    const d0 = Math.abs(nearEdge - before[0]!)
    expect(d0).toBeGreaterThan(5)
    const walkPts: V2[] = [chain.points[0]!, before, [before[0]! + 0.4 * (nearEdge - before[0]!), before[1]!]]
    let credited = 0
    let bonus = 0
    for (const p of densify(walkPts, 1)) {
      credited = gated.update(p[0], p[1])
      bonus = shaper.step(p[0], p[1])
    }
    // the credited arc is stuck at the ~30 m mark: the swing itself banks no arc (the zero-credit gap)
    expect(credited).toBeLessThan(32)
    // ... while the shaper pays 40 % of the line-to-near-edge distance, in route metres over the chain length
    expect(bonus).toBeCloseTo((0.4 * d0) / chain.length, 3)
  })
})
