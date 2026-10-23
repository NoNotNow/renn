import { describe, expect, it } from 'vitest'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { CourseBox } from './courses'
import { schlauDistanceField } from './schlauScore'
import { stageBatch } from './curriculum'
import {
  buildSchlauTask,
  NOSE_CLEAR_M,
  parseSchlauKey,
  parseSchlauKinds,
  SCHLAU_HOLDOUT_PER_KIND,
  SCHLAU_KINDS,
  SCHLAU_TRAIN_PER_KIND,
  schlauDifficulty,
  schlauHoldoutKeys,
  schlauKindsCanStage,
  schlauKey,
  schlauLineCrosses,
  schlauTrainKeys,
  type SchlauTask,
} from './schlauCourses'

/** arena half-size (m): the 4 walls stand centred at +/-61, inner faces at +/-60 */
const ARENA_HALF = 60
/** reachability grid: 1 m cells, integer centres -ARENA_HALF..ARENA_HALF, obstacles inflated by 2.5 m (car half width 2 m) */
const GRID_N = 2 * ARENA_HALF + 1
const INFLATE_M = 2.5
/** the car nose: NOSE_M ahead of the centre (policy.ts) */
const NOSE_M = 4.1

const polyOf = (b: CourseBox): V2[] => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])

/** Gap (m) between two convex polys: pointPolyGap of every corner, both ways. */
const cornerGap = (a: V2[], b: V2[]): number => {
  let best = Infinity
  for (const [p, q] of [[a, b], [b, a]] as const) for (const v of p) best = Math.min(best, pointPolyGap(v[0], v[1], q))
  return best
}

/** Does the direct start -> goal segment CROSS the box poly (exact for convex polys; a touch counts)? */
const crosses = (b: CourseBox, start: V2, goal: V2): boolean => polyGap([start, goal], polyOf(b)) === 0

/** The car NOSE of a pose: fwd of rotation [0, yaw, 0] is [-sin, -cos] (0 = -Z, positive turns left). */
const noseOf = (at: V2, yawDeg: number): V2 => {
  const r = (yawDeg * Math.PI) / 180
  return [at[0] - Math.sin(r) * NOSE_M, at[1] - Math.cos(r) * NOSE_M]
}
const noseOfTask = (t: SchlauTask): V2 => noseOf(t.start, t.startYawDeg)
/** nearest box-poly gap of a point */
const nearestBoxGap = (t: SchlauTask, p: V2): number => Math.min(...t.boxes.map((b) => pointPolyGap(p[0], p[1], polyOf(b))))
/** the nearest point of the nearest box (for the aim check) */
const nearestBoxPoint = (t: SchlauTask, p: V2): V2 => {
  let best: V2 = [0, 0]
  let bestGap = Infinity
  for (const b of t.boxes) {
    const poly = polyOf(b)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const c = poly[(i + 1) % poly.length]!
      const ex = c[0] - a[0]
      const ez = c[1] - a[1]
      const q = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / (ex * ex + ez * ez || 1)))
      const pt: V2 = [a[0] + ex * q, a[1] + ez * q]
      const gap = Math.hypot(pt[0] - p[0], pt[1] - p[1])
      if (gap < bestGap) {
        bestGap = gap
        best = pt
      }
    }
  }
  return best
}

/** Local reachability check (independent copy of the generator's): 4-connected flood fill on the 1 m grid over the arena, obstacles inflated by INFLATE_M — is the goal cell reached from the start cell? */
const reachable = (boxes: readonly CourseBox[], start: V2, goal: V2): boolean => {
  const blocked = new Uint8Array(GRID_N * GRID_N)
  for (const b of boxes) {
    const poly = polyOf(b)
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const [px, pz] of poly) {
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (pz < z0) z0 = pz
      if (pz > z1) z1 = pz
    }
    for (let z = Math.max(-ARENA_HALF, Math.ceil(z0 - INFLATE_M)); z <= Math.min(ARENA_HALF, Math.floor(z1 + INFLATE_M)); z++)
      for (let x = Math.max(-ARENA_HALF, Math.ceil(x0 - INFLATE_M)); x <= Math.min(ARENA_HALF, Math.floor(x1 + INFLATE_M)); x++)
        if (pointPolyGap(x, z, poly) <= INFLATE_M) blocked[(z + ARENA_HALF) * GRID_N + (x + ARENA_HALF)] = 1
  }
  const cell = (p: V2) => (Math.round(p[1]) + ARENA_HALF) * GRID_N + (Math.round(p[0]) + ARENA_HALF)
  const from = cell(start)
  const to = cell(goal)
  if (blocked[from] || blocked[to]) return false
  const seen = new Uint8Array(blocked.length)
  const queue: number[] = [from]
  seen[from] = 1
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]
    if (c === to) return true
    const cx = (c % GRID_N) - ARENA_HALF
    const cz = Math.floor(c / GRID_N) - ARENA_HALF
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < -ARENA_HALF || nx > ARENA_HALF || nz < -ARENA_HALF || nz > ARENA_HALF) continue
      const n = (nz + ARENA_HALF) * GRID_N + (nx + ARENA_HALF)
      if (blocked[n] || seen[n]) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  return false
}

/** goal_wall layer segments: thick (3 m) boxes whose corners POKE beyond the inner arena (into the 2 m arena wall bodies) — the sealed gate-wall pieces. */
const pokes = (b: CourseBox): boolean => polyOf(b).some(([x, z]) => Math.max(Math.abs(x), Math.abs(z)) > ARENA_HALF + 0.5)
const layerSegmentsOf = (t: SchlauTask): CourseBox[] => t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) > 2 && pokes(b))
const extraWallsOf = (t: SchlauTask): CourseBox[] => t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) === 3 && !pokes(b))

/** One goal_wall layer: the plane coordinate + the gate interval along the wall's long axis. */
interface Layer {
  plane: number
  alongX: boolean
  gateLo: number
  gateHi: number
}
const layersOf = (t: SchlauTask): Layer[] => {
  const segs = layerSegmentsOf(t)
  const planes = new Map<number, CourseBox[]>()
  for (const s of segs) {
    const alongX = s.size[0] > s.size[1]
    const plane = alongX ? s.at[1] : s.at[0]
    const key = Math.round(plane * 1e6)
    const bucket = planes.get(key) ?? []
    bucket.push(s)
    planes.set(key, bucket)
  }
  return [...planes.entries()].map(([k, group]) => {
    const alongX = group[0]!.size[0] > group[0]!.size[1]
    const axis = alongX ? 0 : 1
    const sorted = group.slice().sort((a, b) => a.at[axis]! - b.at[axis]!)
    const lo = sorted[0]!
    const hi = sorted[1]!
    const loEnd = lo.at[axis]! + lo.size[axis]! / 2
    const hiStart = hi.at[axis]! - hi.size[axis]! / 2
    return { plane: k / 1e6, alongX, gateLo: loEnd, gateHi: hiStart }
  })
}

describe('schlau keys', () => {
  it('round-trips kind:seed and kind:seed~variant', () => {
    expect(schlauKey('goal_open', 5)).toBe('goal_open:5')
    expect(schlauKey('goal_box', 12)).toBe('goal_box:12')
    expect(schlauKey('goal_wall', 3, 2)).toBe('goal_wall:3~2')
    for (const kind of SCHLAU_KINDS)
      for (const [seed, variant] of [[1, 0], [5, 0], [12, 2], [1001, 1]] as const)
        expect(parseSchlauKey(schlauKey(kind, seed, variant))).toEqual({ kind, seed, variant })
  })

  it('parseSchlauKey throws on garbage', () => {
    for (const bad of [
      '',
      'goal_open',
      'goal_open:',
      'goal_open:x',
      'goal_open:-1',
      'goal_open:5~',
      'goal_open:5~-1',
      'goal_open:5~x',
      'goal_open:5:6',
      'goal_open:5~1~2',
      'field:5',
      'goal_wall :5',
      ' goal_wall:5',
    ])
      expect(() => parseSchlauKey(bad)).toThrow()
  })
})

describe('goal_open', () => {
  it('empty boxes, start at the origin, yaw in [-40, 40], goal 60-140 m out, deterministic per key', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const t = buildSchlauTask('goal_open', seed)
      expect(t.key).toBe(`goal_open:${seed}`)
      expect(t.kind).toBe('goal_open')
      expect(t.seed).toBe(seed)
      expect(t.variant).toBe(0)
      expect(t.boxes).toEqual([])
      expect(t.start).toEqual([0, 0])
      expect(t.startYawDeg).toBeGreaterThanOrEqual(-40)
      expect(t.startYawDeg).toBeLessThanOrEqual(40)
      expect(t.distM).toBeGreaterThanOrEqual(60)
      expect(t.distM).toBeLessThanOrEqual(140)
      expect(t.distM).toBeCloseTo(Math.hypot(t.goal[0], t.goal[1]), 9)
      expect(buildSchlauTask('goal_open', seed)).toEqual(t)
    }
  })
})

describe('goal_box', () => {
  it('4 walls + the ramped crossing wall + 3-11 sampled obstacles, all inside the arena, start / goal / NOSE clear, goal reachable, 50-110 m (seeds 1..16)', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const t = buildSchlauTask('goal_box', seed)
      expect(t.key).toBe(`goal_box:${seed}`)
      const walls = t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) <= 2)
      const obstacles = t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) > 2)
      expect(walls.length).toBe(4)
      expect(obstacles.length).toBeGreaterThanOrEqual(1 + 3)
      expect(obstacles.length).toBeLessThanOrEqual(1 + 11)
      for (const w of walls) {
        expect(Math.min(w.size[0], w.size[1])).toBe(2)
        expect(Math.max(w.size[0], w.size[1])).toBe(2 * (ARENA_HALF + 2))
        expect(w.yawDeg).toBe(0)
      }
      for (const b of obstacles) {
        // min axis 4-14 always; a max axis beyond 14 can only be the RAMPED crossing wall (up to 14 + 22 at d = 1)
        expect(Math.min(b.size[0], b.size[1])).toBeGreaterThanOrEqual(4)
        expect(Math.min(b.size[0], b.size[1])).toBeLessThanOrEqual(14)
        expect(Math.max(b.size[0], b.size[1])).toBeLessThanOrEqual(14 + 22)
        expect(b.yawDeg).toBeGreaterThanOrEqual(0)
        expect(b.yawDeg).toBeLessThan(180)
        for (const [x, z] of polyOf(b)) {
          expect(Math.abs(x)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
          expect(Math.abs(z)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
        }
      }
      expect(Math.abs(t.start[0])).toBeLessThanOrEqual(35)
      expect(Math.abs(t.start[1])).toBeLessThanOrEqual(35)
      expect(Math.abs(t.goal[0])).toBeLessThanOrEqual(ARENA_HALF - 10)
      expect(Math.abs(t.goal[1])).toBeLessThanOrEqual(ARENA_HALF - 10)
      const hull = rectPoly(t.start[0], t.start[1], (t.startYawDeg * Math.PI) / 180, 4, 8)
      const nose = noseOfTask(t)
      for (const b of t.boxes) {
        expect(cornerGap(hull, polyOf(b))).toBeGreaterThanOrEqual(6)
        expect(pointPolyGap(t.goal[0], t.goal[1], polyOf(b))).toBeGreaterThanOrEqual(6)
        // the POISON rule: the nose keeps > INFLATE_M + NOSE_CLEAR_M off every box (>= NOSE_CLEAR_M off every inflated scoring cell)
        expect(pointPolyGap(nose[0], nose[1], polyOf(b)), `goal_box:${seed}`).toBeGreaterThan(INFLATE_M + NOSE_CLEAR_M)
      }
      expect(reachable(t.boxes, t.start, t.goal)).toBe(true)
      expect(t.distM).toBeGreaterThanOrEqual(50)
      expect(t.distM).toBeLessThanOrEqual(110)
      expect(t.distM).toBeCloseTo(Math.hypot(t.goal[0] - t.start[0], t.goal[1] - t.start[1]), 9)
    }
  })

  it('every goal_box task: the direct start -> goal segment crosses >= 1 obstacle box (the guaranteed crossing wall, user decision 2026-10-23)', () => {
    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 2002, 3001, 3004, 3005, 3006]) {
      const t = buildSchlauTask('goal_box', seed)
      expect(schlauLineCrosses(t.boxes, t.start, t.goal), `goal_box:${seed}`).toBe(true)
    }
    for (let seed = 1; seed <= 5; seed++) {
      const t = buildSchlauTask('goal_box', seed, 1)
      expect(schlauLineCrosses(t.boxes, t.start, t.goal), `goal_box:${seed}~1`).toBe(true)
    }
    const open = buildSchlauTask('goal_open', 1)
    expect(schlauLineCrosses(open.boxes, open.start, open.goal)).toBe(false)
  })
})

describe('goal_wall (v2: sealed gate walls, WF-Blockade style)', () => {
  it('4 arena walls + 1-3 sealed layers with exactly ONE gate each + 0-3 extra walls; the direct line crosses WALL; all in the arena; start / goal / NOSE clear; solvable at 2.5 m (seeds 1..16 + 21..24)', () => {
    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 21, 22, 23, 24]) {
      const t = buildSchlauTask('goal_wall', seed)
      expect(t.key).toBe(`goal_wall:${seed}`)
      const walls = t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) <= 2)
      const segs = layerSegmentsOf(t)
      const extras = extraWallsOf(t)
      expect(walls.length).toBe(4)
      expect(walls.length + segs.length + extras.length).toBe(t.boxes.length)
      const layers = layersOf(t)
      // the ramp asks for 1 + (d >= 0.5) + (d >= 0.8) layers; short / near-diagonal geometry may fit fewer
      const ramp = 1 + (schlauDifficulty(seed) >= 0.5 ? 1 : 0) + (schlauDifficulty(seed) >= 0.8 ? 1 : 0)
      expect(layers.length).toBeGreaterThanOrEqual(1)
      expect(layers.length).toBeLessThanOrEqual(ramp)
      const w = 14 - 7 * schlauDifficulty(seed)
      for (const L of layers) {
        // exactly ONE gate per layer, at the seeded ramp width (the only passage through the plane)
        expect(L.gateHi - L.gateLo).toBeCloseTo(w, 6)
        expect(L.gateLo).toBeGreaterThanOrEqual(-(ARENA_HALF - 10) - 1e-6)
        expect(L.gateHi).toBeLessThanOrEqual(ARENA_HALF - 10 + 1e-6)
      }
      // every layer segment: sealed (pokes into the arena wall bodies), 3 m thick, axis-aligned
      for (const s of segs) {
        expect(Math.min(s.size[0], s.size[1])).toBe(3)
        expect(s.yawDeg).toBe(0)
        expect(pokes(s)).toBe(true)
      }
      // extra walls: 10-18 m long, 3 m thick, corners inside the inner arena, at most 3
      expect(extras.length).toBeLessThanOrEqual(3)
      for (const b of extras) {
        expect(Math.max(b.size[0], b.size[1])).toBeGreaterThanOrEqual(10)
        expect(Math.max(b.size[0], b.size[1])).toBeLessThanOrEqual(18)
        for (const [x, z] of polyOf(b)) {
          expect(Math.abs(x)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
          expect(Math.abs(z)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
        }
      }
      // THE point of the kind: the direct start -> goal line crosses a LAYER SEGMENT (wall, not gate)
      expect(segs.some((b) => crosses(b, t.start, t.goal)), `goal_wall:${seed}`).toBe(true)
      // start / goal bands like goal_box
      expect(Math.abs(t.start[0])).toBeLessThanOrEqual(35)
      expect(Math.abs(t.start[1])).toBeLessThanOrEqual(35)
      expect(Math.abs(t.goal[0])).toBeLessThanOrEqual(ARENA_HALF - 10)
      expect(Math.abs(t.goal[1])).toBeLessThanOrEqual(ARENA_HALF - 10)
      // start hull, goal and the NOSE clear of every box
      const hull = rectPoly(t.start[0], t.start[1], (t.startYawDeg * Math.PI) / 180, 4, 8)
      const nose = noseOfTask(t)
      for (const b of t.boxes) {
        expect(cornerGap(hull, polyOf(b))).toBeGreaterThanOrEqual(6)
        expect(pointPolyGap(t.goal[0], t.goal[1], polyOf(b))).toBeGreaterThanOrEqual(6)
        expect(pointPolyGap(nose[0], nose[1], polyOf(b)), `goal_wall:${seed}`).toBeGreaterThan(INFLATE_M + NOSE_CLEAR_M)
      }
      // solvable at car-width clearance (2.5 m inflation) — never a dead blockade
      expect(reachable(t.boxes, t.start, t.goal), `goal_wall:${seed}`).toBe(true)
      expect(t.distM).toBeGreaterThanOrEqual(50)
      expect(t.distM).toBeLessThanOrEqual(110)
    }
  })

  it('the layer structure holds on the whole holdout band (seeds 1001..1008, the d = 1 tier: 7 m gates)', () => {
    for (let seed = 1001; seed <= 1008; seed++) {
      const t = buildSchlauTask('goal_wall', seed)
      for (const L of layersOf(t)) expect(L.gateHi - L.gateLo).toBeCloseTo(7, 6)
      expect(layerSegmentsOf(t).some((b) => crosses(b, t.start, t.goal)), `goal_wall:${seed}`).toBe(true)
      expect(reachable(t.boxes, t.start, t.goal), `goal_wall:${seed}`).toBe(true)
      const nose = noseOfTask(t)
      for (const b of t.boxes) expect(pointPolyGap(nose[0], nose[1], polyOf(b))).toBeGreaterThan(INFLATE_M + NOSE_CLEAR_M)
    }
  })
})

// --- goal_turn helpers: the construct is axis-aligned; A = the cardinal nose direction, Lt = its lateral ---

/** fwd of rotation [0, yaw, 0] is [-sin, -cos] (0 = -Z, positive turns left). */
const fwdOf = (yawDeg: number): V2 => {
  const r = (yawDeg * Math.PI) / 180
  return [-Math.sin(r), -Math.cos(r)]
}

/** the cardinal yaw (0/90/180/270) nearest to yawDeg and their angular distance (deg, <= 180). */
const nearestCardinal = (yawDeg: number): { yaw: number; dist: number } => {
  let best = 0
  let bestDist = Infinity
  for (const c of [0, 90, 180, 270]) {
    const d = Math.abs(((yawDeg - c + 540) % 360) - 180)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return { yaw: best, dist: bestDist }
}

/** One goal_turn construct element in the (A, Lt) frame of the start pose. */
interface TurnBox {
  box: CourseBox
  /** f = (center - S) . A, l = (center - S) . Lt */
  f: number
  l: number
  /** long axis along A (cheek) or along Lt (the dedicated wall) */
  alongA: boolean
  maxAxis: number
  minAxis: number
}

/** The goal_turn construct of a task: the dedicated wall + the two cheeks + the extras, in the start's frame. */
const turnConstructOf = (t: SchlauTask) => {
  const card = nearestCardinal(t.startYawDeg)
  // the cardinal nose direction as an EXACT unit vector (fwdOf(180) is [-1.2e-16, 1] — the float x must not flip
  // the axis test below; the generator's directions are the exact literals)
  const CARDINAL_DIRS: V2[] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]
  const A = CARDINAL_DIRS[[0, 180, 90, 270].indexOf(card.yaw)]!
  const Lt: V2 = [-A[1], A[0]]
  const fl = (p: V2) => ({ f: (p[0] - t.start[0]) * A[0] + (p[1] - t.start[1]) * A[1], l: (p[0] - t.start[0]) * Lt[0] + (p[1] - t.start[1]) * Lt[1] })
  const arena = t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) <= 2)
  const inner: TurnBox[] = t.boxes
    .filter((b) => Math.min(b.size[0], b.size[1]) > 2)
    .map((b) => {
      const alongA = A[0] !== 0 ? b.size[0] > b.size[1] : b.size[1] > b.size[0]
      return { box: b, ...fl([b.at[0], b.at[1]]), alongA, maxAxis: Math.max(b.size[0], b.size[1]), minAxis: Math.min(b.size[0], b.size[1]) }
    })
  // the dedicated wall: long along Lt, >= 30 m; the cheeks: long along A, >= 29 m; the extras: everything small
  const wall = inner.filter((b) => !b.alongA && b.maxAxis >= 30)
  const cheeks = inner.filter((b) => b.alongA && b.maxAxis >= 20)
  const extras = inner.filter((b) => b.maxAxis < 20)
  return { card, A, Lt, fl, arena, wall, cheeks, extras }
}

/** the nearest point of a convex poly to p (for the nose-vs-wall gap and aim checks). */
const nearestOnPoly = (poly: V2[], p: V2): { point: V2; gap: number } => {
  let best: V2 = poly[0]!
  let bestGap = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const ex = b[0] - a[0]
    const ez = b[1] - a[1]
    const q = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / (ex * ex + ez * ez || 1)))
    const pt: V2 = [a[0] + ex * q, a[1] + ez * q]
    const gap = Math.hypot(pt[0] - p[0], pt[1] - p[1])
    if (gap < bestGap) {
      bestGap = gap
      best = pt
    }
  }
  return { point: best, gap: bestGap }
}

describe('goal_turn (the dead-end shunt rotation task, handoff 2026-10-23 Task 1)', () => {
  it('every seed: 4 arena walls + ONE dedicated wall (30-50 m, crossed near its middle) + TWO sealed cheeks (12-14 m free corridor) + 0-2 extras', () => {
    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 21, 1001, 1002, 1003]) {
      const t = buildSchlauTask('goal_turn', seed)
      expect(t.key).toBe(`goal_turn:${seed}`)
      const { arena, wall, cheeks, extras } = turnConstructOf(t)
      expect(arena.length).toBe(4)
      expect(wall.length).toBe(1)
      expect(cheeks.length).toBe(2)
      expect(extras.length).toBeLessThanOrEqual(2)
      expect(arena.length + wall.length + cheeks.length + extras.length).toBe(t.boxes.length)
      const W = wall[0]!
      // the wall: 30-50 m long, 4 m thick, perpendicular to the nose (long axis along Lt), centred on the nose ray
      expect(W.maxAxis).toBeGreaterThanOrEqual(30)
      expect(W.maxAxis).toBeLessThanOrEqual(50)
      expect(W.minAxis).toBe(4)
      expect(Math.abs(W.l)).toBeLessThan(1e-9)
      // the crossing point of the direct start -> goal line sits in the wall's middle third
      expect(crosses(W.box, t.start, t.goal), `goal_turn:${seed}`).toBe(true)
      // the cheeks: one per side of the nose ray, long along the nose axis, 3-5 m thick
      expect(cheeks.some((c) => c.l > 0) && cheeks.some((c) => c.l < 0), `goal_turn:${seed}`).toBe(true)
      for (const c of cheeks) {
        expect(c.maxAxis).toBeGreaterThanOrEqual(20)
        expect(c.minAxis).toBeGreaterThanOrEqual(3)
        expect(c.minAxis).toBeLessThanOrEqual(5)
      }
      // every non-arena box inside the inner arena (the 4 arena walls deliberately poke to +/-62, like goal_box)
      for (const b of t.boxes.filter((x) => Math.min(x.size[0], x.size[1]) > 2)) for (const [x, z] of polyOf(b)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
        expect(Math.abs(z)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
      }
      expect(Math.abs(t.goal[0])).toBeLessThanOrEqual(ARENA_HALF - 10)
      expect(Math.abs(t.goal[1])).toBeLessThanOrEqual(ARENA_HALF - 10)
    }
  })

  it('the corridor: cheek inner faces at 6-7 m each side (12-14 m free width — a shunt fits, a forward U-turn does not), sealed against the wall, open behind the car', () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 16, 1001, 1002]) {
      const t = buildSchlauTask('goal_turn', seed)
      const { wall, cheeks, fl } = turnConstructOf(t)
      const wallF = polyOf(wall[0]!.box).map((p) => fl(p).f)
      const wallFarF = Math.max(...wallF)
      for (const side of [1, -1]) {
        const cheek = cheeks.find((c) => Math.sign(c.l) === side)!
        // the inner face's lateral coordinate: the corner closest to the ray
        const ls = polyOf(cheek.box).map((p) => fl(p).l)
        const inner = side > 0 ? Math.min(...ls) : Math.max(...ls)
        expect(inner * side, `goal_turn:${seed} cheek ${side}`).toBeGreaterThanOrEqual(6 - 1e-6)
        expect(inner * side).toBeLessThanOrEqual(7 + 1e-6)
        // sealed: the cheek reaches the wall's FAR face plane (no gap to sneak through at the corner)
        const cheekF = polyOf(cheek.box).map((p) => fl(p).f)
        expect(Math.max(...cheekF)).toBeGreaterThanOrEqual(wallFarF - 1e-6)
        // open behind: the cheek extends >= 10 m behind the start centre (the corridor mouth is behind the car)
        expect(Math.min(...cheekF)).toBeLessThanOrEqual(-10 + 1e-6)
      }
    }
  })

  it('the start pose: nose 11-20 m off the wall (the NOSE_CLEAR_M poison floor), aimed dead ahead at it, yaw within 20 deg of the cardinal perpendicular', () => {
    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 1001, 1002]) {
      const t = buildSchlauTask('goal_turn', seed)
      const { card, wall } = turnConstructOf(t)
      // yaw: within 20 deg of a cardinal (the wall is axis-aligned, the yaw jitter is +/-20 deg)
      expect(card.dist, `goal_turn:${seed} yaw ${t.startYawDeg}`).toBeLessThanOrEqual(20 + 1e-9)
      const nose = noseOfTask(t)
      const near = nearestOnPoly(polyOf(wall[0]!.box), nose)
      // the nose keeps the poison floor off the wall: > INFLATE_M + NOSE_CLEAR_M (g is drawn in [11, 20])
      expect(near.gap, `goal_turn:${seed}`).toBeGreaterThan(INFLATE_M + NOSE_CLEAR_M)
      // the yaw jitter (<= 20 deg) tilts the nose, adding <= NOSE_M * (1 - cos 20 deg) ~ 0.25 m to the gap
      expect(near.gap).toBeLessThanOrEqual(20.25)
      // aimed dead ahead: the wall's nearest point lies on the nose ray (fwd), not to the side
      const fwd = fwdOf(t.startYawDeg)
      const ux = (near.point[0] - nose[0]) / (near.gap || 1)
      const uz = (near.point[1] - nose[1]) / (near.gap || 1)
      expect(ux * fwd[0] + uz * fwd[1]).toBeGreaterThan(0.9)
    }
  })

  it('the goal: BEHIND the wall, 4-10 m past its far face, ON the nose ray; the euclidean band 23-38.2 m', () => {
    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 1001, 1002]) {
      const t = buildSchlauTask('goal_turn', seed)
      const { wall, fl } = turnConstructOf(t)
      const wallF = polyOf(wall[0]!.box).map((p) => fl(p).f)
      const wallFarF = Math.max(...wallF)
      const goalFl = fl(t.goal)
      // on the nose ray (lateral offset 0 by construction)
      expect(Math.abs(goalFl.l), `goal_turn:${seed}`).toBeLessThan(1e-9)
      // past the wall's far face by 4-10 m (the handoff's 2-10 m, floored: the 2.5 m inflation must leave the goal cell free)
      expect(goalFl.f - wallFarF).toBeGreaterThanOrEqual(4 - 1e-6)
      expect(goalFl.f - wallFarF).toBeLessThanOrEqual(10 + 1e-6)
      // the goal keeps the machinery clearance off every box (free goal cell at 2.5 m inflation)
      for (const b of t.boxes) expect(pointPolyGap(t.goal[0], t.goal[1], polyOf(b)), `goal_turn:${seed}`).toBeGreaterThan(INFLATE_M)
      expect(t.distM).toBeGreaterThanOrEqual(23)
      expect(t.distM).toBeLessThanOrEqual(38.2)
    }
  })

  it('the spawn hull clears every box; the nose keeps the relaxed goal_turn floor (> 3.5 m) off every box; the goal stays REACHABLE (2.5 m BFS)', () => {
    for (const seed of [...Array.from({ length: 16 }, (_, i) => i + 1), 21, 1001, 1002, 1003, 1004]) {
      const t = buildSchlauTask('goal_turn', seed)
      const hull = rectPoly(t.start[0], t.start[1], (t.startYawDeg * Math.PI) / 180, 4, 8)
      const nose = noseOfTask(t)
      for (const b of t.boxes) {
        expect(cornerGap(hull, polyOf(b)), `goal_turn:${seed}`).toBeGreaterThan(0.5)
        expect(pointPolyGap(nose[0], nose[1], polyOf(b)), `goal_turn:${seed} nose`).toBeGreaterThan(INFLATE_M + 1)
      }
      expect(reachable(t.boxes, t.start, t.goal), `goal_turn:${seed}`).toBe(true)
    }
  })

  it('NO shortcut: the drivable nose -> goal distance (the score field) far exceeds the euclidean — the route must exit the corridor mouth and swing around the wall end', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const t = buildSchlauTask('goal_turn', seed)
      const field = schlauDistanceField(t.boxes, t.goal)
      const nose = noseOfTask(t)
      const d0 = field.at(nose[0], nose[1])
      const eucl = Math.hypot(nose[0] - t.goal[0], nose[1] - t.goal[1])
      expect(d0, `goal_turn:${seed}`).toBeGreaterThan(1.25 * eucl)
      expect(d0).toBeLessThan(Infinity)
    }
  })

  it('variants: NEVER facing poses (the geometry guarantee is the nose-at-the-wall pose); jitter stays clear, keeps the crossing and stays solvable', () => {
    let jitter = 0
    for (let seed = 1; seed <= 6; seed++) {
      for (const variant of [1, 2, 3]) {
        const t = buildSchlauTask('goal_turn', seed, variant)
        expect(t.poseClass, `goal_turn:${seed}~${variant}`).not.toBe('facing')
        const hull = rectPoly(t.start[0], t.start[1], (t.startYawDeg * Math.PI) / 180, 4, 8)
        const nose = noseOfTask(t)
        for (const b of t.boxes) {
          expect(cornerGap(hull, polyOf(b)), `goal_turn:${seed}~${variant}`).toBeGreaterThan(0.5)
          expect(pointPolyGap(nose[0], nose[1], polyOf(b)), `goal_turn:${seed}~${variant}`).toBeGreaterThan(INFLATE_M + 1)
        }
        expect(schlauLineCrosses(t.boxes, t.start, t.goal), `goal_turn:${seed}~${variant}`).toBe(true)
        expect(reachable(t.boxes, t.start, t.goal), `goal_turn:${seed}~${variant}`).toBe(true)
        if (t.poseClass === 'jitter') jitter++
      }
    }
    expect(jitter).toBeGreaterThan(0)
  })
})

describe('difficulty ramp (SEEDED, critique §6: early seeds easy, late seeds + holdout hard)', () => {
  it('schlauDifficulty: 0 at seed 1, ramps over the 16-seed TRAIN band, 1 from seed 17 on (the holdout band = max)', () => {
    expect(schlauDifficulty(1)).toBe(0)
    expect(schlauDifficulty(13)).toBeCloseTo(0.75, 9)
    expect(schlauDifficulty(16)).toBeCloseTo(0.9375, 9)
    expect(schlauDifficulty(17)).toBe(1)
    expect(schlauDifficulty(1001)).toBe(1)
  })

  it('goal_box: the crossing wall length ramps — 12-14 m at seed 1, 30-36 m at the d = 1 holdout band', () => {
    const crossedWallLen = (t: SchlauTask): number => {
      let best = 0
      for (const b of t.boxes) {
        if (Math.min(b.size[0], b.size[1]) !== 4) continue
        if (crosses(b, t.start, t.goal)) best = Math.max(best, Math.max(b.size[0], b.size[1]))
      }
      return best
    }
    // easy tier (d = 0): the original 12-14 m crossing wall
    const easy = buildSchlauTask('goal_box', 1)
    expect(crossedWallLen(easy)).toBeGreaterThanOrEqual(12)
    expect(crossedWallLen(easy)).toBeLessThanOrEqual(14)
    // mid ramp (d = 0.25 at seed 5): between the tiers
    const mid = buildSchlauTask('goal_box', 5)
    expect(crossedWallLen(mid)).toBeGreaterThan(14)
    expect(crossedWallLen(mid)).toBeLessThanOrEqual(14 + 22 * schlauDifficulty(5) + 1e-9)
    // the LAST TRAIN seed (d ~ 0.94): the hard tier lands IN the band (the critique's missing 1.3-detour class)
    const hard = buildSchlauTask('goal_box', 16)
    expect(crossedWallLen(hard)).toBeGreaterThanOrEqual(12 + 18 * schlauDifficulty(16))
    // hard tier (d = 1, the holdout band): 30-36 m — the detour-1.32 class, cloned into the band by the ramp
    for (const seed of [1001, 1002, 1003, 1004]) {
      const t = buildSchlauTask('goal_box', seed)
      expect(crossedWallLen(t), `goal_box:${seed}`).toBeGreaterThanOrEqual(30)
      expect(crossedWallLen(t)).toBeLessThanOrEqual(36)
    }
  })

  it('goal_wall: the gate width ramps with the seed — 14 m at seed 1, ~7.4 m at the last train seed, 7 m from seed 17 on (exact, no rng)', () => {
    for (const [seed, expected] of [[1, 14], [8, 14 - 7 * (7 / 16)], [16, 14 - 7 * (15 / 16)], [17, 7], [1001, 7]] as const)
      for (const L of layersOf(buildSchlauTask('goal_wall', seed))) expect(L.gateHi - L.gateLo).toBeCloseTo(expected, 6)
  })
})

describe('spawn-pose poison rule (critique §4: NO instant-offcourse traps, canonical AND variants)', () => {
  it('every spawn pose of every kind and variant keeps the nose > INFLATE_M + NOSE_CLEAR_M off every box and stays solvable', () => {
    for (const kind of ['goal_box', 'goal_wall'] as const) {
      for (const seed of [1, 2, 5, 8, 13, 16, 21, 1001, 1003, 1005]) {
        for (const variant of [0, 1, 2, 3]) {
          const t = buildSchlauTask(kind, seed, variant)
          const nose = noseOfTask(t)
          for (const b of t.boxes) expect(pointPolyGap(nose[0], nose[1], polyOf(b)), `${kind}:${seed}~${variant}`).toBeGreaterThan(INFLATE_M + NOSE_CLEAR_M)
          // solvable from the spawn pose (backing off + rerouting works)
          expect(reachable(t.boxes, t.start, t.goal), `${kind}:${seed}~${variant}`).toBe(true)
        }
      }
    }
  })
})

describe('start variants (facing + jitter, user notes 2026-10-23)', () => {
  it('a seeded FACING share of the variants teaches back-off: head-on at a box, nose in the clear band, aimed, solvable (deterministic rate)', () => {
    for (const kind of ['goal_box', 'goal_wall'] as const) {
      let facing = 0
      for (let seed = 1; seed <= 8; seed++) {
        for (let variant = 1; variant <= 4; variant++) {
          const t = buildSchlauTask(kind, seed, variant)
          if (t.poseClass !== 'facing') continue
          facing++
          // a facing pose: the nose points DEAD AHEAD at a box 10.5-16 m off (the poison floor holds), still solvable
          const nose = noseOfTask(t)
          const r = (t.startYawDeg * Math.PI) / 180
          const fwd: V2 = [-Math.sin(r), -Math.cos(r)]
          const aimed = t.boxes.some((b) => {
            const p = nearestBoxPoint({ boxes: [b] } as SchlauTask, nose)
            const gap = pointPolyGap(nose[0], nose[1], polyOf(b))
            return gap <= 16.5 && ((p[0] - nose[0]) * fwd[0] + (p[1] - nose[1]) * fwd[1]) / (gap || 1) > 0.99
          })
          expect(aimed, `${kind}:${seed}~${variant}`).toBe(true)
          expect(nearestBoxGap(t, nose)).toBeGreaterThan(INFLATE_M + NOSE_CLEAR_M)
          expect(nearestBoxGap(t, nose)).toBeLessThanOrEqual(16.5)
          expect(schlauLineCrosses(t.boxes, t.start, t.goal), `${kind}:${seed}~${variant}`).toBe(true)
          expect(reachable(t.boxes, t.start, t.goal), `${kind}:${seed}~${variant}`).toBe(true)
        }
      }
      // the deterministic seeded rate (FACING_SHARE 0.3 of the variant draws, most constructions accepted)
      expect(facing).toBeGreaterThanOrEqual(4)
      expect(facing).toBeLessThanOrEqual(16)
    }
  })

  it('JITTER poses stay within the +/-4 m / +/-15 deg band of their OWN canonical start (absolute bounds), crossing kept', () => {
    // the variant re-seeds the WHOLE world, so the pose can only be checked against the absolute band:
    // canonical starts sit within +/-35 m with yaw [-40, 40]; a jitter pose stays within +/-39 m / [-55, 55]
    for (const kind of ['goal_box', 'goal_wall'] as const) {
      let jitter = 0
      for (let seed = 1; seed <= 8; seed++) {
        for (let variant = 1; variant <= 4; variant++) {
          const t = buildSchlauTask(kind, seed, variant)
          if (t.poseClass === 'facing') continue
          if (t.poseClass === 'jitter') {
            jitter++
            expect(Math.abs(t.start[0])).toBeLessThanOrEqual(35 + 4 + 1e-9)
            expect(Math.abs(t.start[1])).toBeLessThanOrEqual(35 + 4 + 1e-9)
            expect(t.startYawDeg).toBeGreaterThanOrEqual(-55 - 1e-9)
            expect(t.startYawDeg).toBeLessThanOrEqual(55 + 1e-9)
            expect(schlauLineCrosses(t.boxes, t.start, t.goal)).toBe(true)
            expect(reachable(t.boxes, t.start, t.goal)).toBe(true)
          }
        }
      }
      // the jitter class stays populated alongside the facing share
      expect(jitter).toBeGreaterThan(0)
    }
  })

  it('goal_open variants stay jitter poses (no boxes to face) and differ from the canonical', () => {
    let diffs = 0
    for (let seed = 1; seed <= 6; seed++) {
      const v0 = buildSchlauTask('goal_open', seed, 0)
      for (let variant = 1; variant <= 2; variant++) {
        const t = buildSchlauTask('goal_open', seed, variant)
        expect(t.boxes).toEqual([])
        expect(['jitter', 'canonical']).toContain(t.poseClass)
        expect(Math.abs(t.start[0])).toBeLessThanOrEqual(4 * Math.SQRT2 + 1e-9)
        expect(Math.abs(t.start[1])).toBeLessThanOrEqual(4 * Math.SQRT2 + 1e-9)
        if (JSON.stringify(t) !== JSON.stringify(v0)) diffs++
      }
    }
    expect(diffs).toBeGreaterThan(0)
  })

  it('the train band feeds 16 distinct canonical starts and goals per kind (no near-identical layouts)', () => {
    for (const kind of ['goal_box', 'goal_wall'] as const) {
      const starts = new Set<string>()
      const goals = new Set<string>()
      for (let seed = 1; seed <= 16; seed++) {
        const t = buildSchlauTask(kind, seed)
        starts.add(`${t.start[0].toFixed(1)} ${t.start[1].toFixed(1)} ${t.startYawDeg.toFixed(1)}`)
        goals.add(`${t.goal[0].toFixed(1)} ${t.goal[1].toFixed(1)}`)
      }
      expect(starts.size).toBe(16)
      expect(goals.size).toBe(16)
    }
  })
})

describe('parseSchlauKinds (the --kinds flag of run-schlau)', () => {
  it('parses a comma list into canonical SCHLAU_KINDS order, dedupes', () => {
    expect(parseSchlauKinds('goal_wall')).toEqual(['goal_wall'])
    expect(parseSchlauKinds('goal_box,goal_wall')).toEqual(['goal_box', 'goal_wall'])
    expect(parseSchlauKinds('goal_wall,goal_open,goal_wall')).toEqual(['goal_open', 'goal_wall'])
    expect(parseSchlauKinds('goal_turn,goal_box,goal_wall,goal_open')).toEqual([...SCHLAU_KINDS])
  })

  it('throws on unknown kinds and empty segments', () => {
    for (const bad of ['', ',', 'maze', 'goal_box,', ',goal_wall', 'goal_box,,goal_wall', 'goal_box goal_wall', 'field,goal_open'])
      expect(() => parseSchlauKinds(bad), JSON.stringify(bad)).toThrow()
  })

  it('stage eligibility: the goal_open -> rest curriculum needs >= 2 kinds including goal_open (a single kind never stages)', () => {
    expect(schlauKindsCanStage(['goal_wall'])).toBe(false)
    expect(schlauKindsCanStage(['goal_open'])).toBe(false)
    expect(schlauKindsCanStage(['goal_box'])).toBe(false)
    expect(schlauKindsCanStage(['goal_box', 'goal_wall'])).toBe(false)
    expect(schlauKindsCanStage(['goal_open', 'goal_box'])).toBe(true)
    expect(schlauKindsCanStage(['goal_open', 'goal_wall'])).toBe(true)
    expect(schlauKindsCanStage([...SCHLAU_KINDS])).toBe(true)
  })
})

describe('schlau bands (critique §3/§5: goal_open cut to 3, box/wall 16, holdout 8 per kind)', () => {
  it('train and holdout key sets are disjoint; the per-kind defaults', () => {
    const train = schlauTrainKeys()
    const holdout = schlauHoldoutKeys()
    expect(train.length).toBe(3 + 16 + 16 + 16)
    expect(holdout.length).toBe(4 * SCHLAU_HOLDOUT_PER_KIND)
    expect(train).toContain('goal_open:1')
    expect(train).toContain('goal_open:3')
    expect(train).not.toContain('goal_open:4')
    expect(train).toContain('goal_box:16')
    expect(train).toContain('goal_wall:16')
    expect(train).toContain('goal_turn:16')
    expect(holdout).toContain('goal_open:1001~1')
    expect(holdout).toContain('goal_box:1008~1')
    expect(holdout).toContain('goal_wall:1008~1')
    expect(holdout).toContain('goal_turn:1008~1')
    expect(SCHLAU_TRAIN_PER_KIND).toEqual({ goal_open: 3, goal_box: 16, goal_wall: 16, goal_turn: 16 })
    expect(SCHLAU_HOLDOUT_PER_KIND).toBe(8)
    const set = new Set(train)
    for (const k of holdout) expect(set.has(k)).toBe(false)
    // custom bands stay disjoint too
    const t2 = schlauTrainKeys(3, ['goal_box'], 50)
    const h2 = schlauHoldoutKeys(3, ['goal_box'], 2, 5000)
    expect(t2).toEqual(['goal_box:50', 'goal_box:51', 'goal_box:52'])
    expect(h2).toEqual(['goal_box:5000~2', 'goal_box:5001~2', 'goal_box:5002~2'])
    expect(t2.some((k) => h2.includes(k))).toBe(false)
    // a goal_wall-only band (the dedicated wall runs)
    const tw = schlauTrainKeys(3, ['goal_wall'], 50)
    const hw = schlauHoldoutKeys(3, ['goal_wall'], 2, 5000)
    expect(tw).toEqual(['goal_wall:50', 'goal_wall:51', 'goal_wall:52'])
    expect(hw).toEqual(['goal_wall:5000~2', 'goal_wall:5001~2', 'goal_wall:5002~2'])
    expect(tw.some((k) => hw.includes(k))).toBe(false)
  })

  it('deterministic: two builds of the same key are identical JSON', () => {
    for (const kind of SCHLAU_KINDS)
      for (const [seed, variant] of [[1, 0], [7, 0], [3, 1], [9, 2], [1001, 1]] as const)
        expect(JSON.stringify(buildSchlauTask(kind, seed, variant))).toBe(JSON.stringify(buildSchlauTask(kind, seed, variant)))
  })

  it('no training slowdown from more train keys: the per-generation batch is --batch per active kind, independent of the band size (critique refinement 3)', () => {
    const byKind16 = { goal_wall: schlauTrainKeys(16, ['goal_wall']) }
    const byKind3 = { goal_wall: schlauTrainKeys(3, ['goal_wall']) }
    for (let g = 0; g < 32; g++) {
      const b16 = stageBatch(byKind16, ['goal_wall'], 1, g)
      const b3 = stageBatch(byKind3, ['goal_wall'], 1, g)
      expect(b16).toHaveLength(1)
      expect(b3).toHaveLength(1)
      expect(byKind16.goal_wall).toContain(b16[0])
    }
    // and a bigger batch rotates through the band, still independent of OTHER kinds' band sizes
    const multi = { goal_open: schlauTrainKeys(3, ['goal_open']), goal_box: schlauTrainKeys(16, ['goal_box']), goal_wall: schlauTrainKeys(16, ['goal_wall']) }
    for (let g = 0; g < 8; g++) expect(stageBatch(multi, ['goal_open', 'goal_box', 'goal_wall'], 2, g)).toHaveLength(6)
  })
})
