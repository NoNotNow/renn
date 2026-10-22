import { describe, expect, it } from 'vitest'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { CourseBox } from './courses'
import { buildSchlauTask, parseSchlauKey, SCHLAU_KINDS, schlauHoldoutKeys, schlauKey, schlauTrainKeys } from './schlauCourses'

/** arena half-size of `goal_box` (m): the 4 walls stand centred at +/-61, inner faces at +/-60 */
const ARENA_HALF = 60
/** reachability grid: 1 m cells, integer centres -ARENA_HALF..ARENA_HALF, obstacles inflated by 2.5 m (car half width 2 m) */
const GRID_N = 2 * ARENA_HALF + 1
const INFLATE_M = 2.5

const polyOf = (b: CourseBox): V2[] => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])

/** Gap (m) between two convex polys: pointPolyGap of every corner, both ways. */
const cornerGap = (a: V2[], b: V2[]): number => {
  let best = Infinity
  for (const [p, q] of [[a, b], [b, a]] as const) for (const v of p) best = Math.min(best, pointPolyGap(v[0], v[1], q))
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
  const seen = new Uint8Array(GRID_N * GRID_N)
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

describe('schlau keys', () => {
  it('round-trips kind:seed and kind:seed~variant', () => {
    expect(schlauKey('goal_open', 5)).toBe('goal_open:5')
    expect(schlauKey('goal_box', 12)).toBe('goal_box:12')
    expect(schlauKey('goal_box', 12, 2)).toBe('goal_box:12~2')
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
      'goal_open :5',
      ' goal_open:5',
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
  it('4 walls + 3-8 obstacle boxes, all inside the arena, start / goal clear, goal reachable, 50-110 m (seeds 1..10)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const t = buildSchlauTask('goal_box', seed)
      expect(t.key).toBe(`goal_box:${seed}`)
      // the walls are the only thin boxes (2 m); the obstacles are 4-14 m per axis
      const walls = t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) <= 2)
      const obstacles = t.boxes.filter((b) => Math.min(b.size[0], b.size[1]) > 2)
      expect(walls.length).toBe(4)
      expect(obstacles.length).toBeGreaterThanOrEqual(3)
      expect(obstacles.length).toBeLessThanOrEqual(8)
      // the walls: 2 m thick, centred at +/-61 (inner faces at +/-60), spanning the arena
      for (const w of walls) {
        expect(Math.min(w.size[0], w.size[1])).toBe(2)
        expect(Math.max(w.size[0], w.size[1])).toBe(2 * (ARENA_HALF + 2))
        expect(w.yawDeg).toBe(0)
        expect(Math.abs(w.at[0]) === ARENA_HALF + 1 || Math.abs(w.at[1]) === ARENA_HALF + 1).toBe(true)
      }
      // the obstacle boxes: 4-14 m per axis, yaw 0-180, inside the inner arena
      for (const b of obstacles) {
        expect(b.size[0]).toBeGreaterThanOrEqual(4)
        expect(b.size[0]).toBeLessThanOrEqual(14)
        expect(b.size[1]).toBeGreaterThanOrEqual(4)
        expect(b.size[1]).toBeLessThanOrEqual(14)
        expect(b.yawDeg).toBeGreaterThanOrEqual(0)
        expect(b.yawDeg).toBeLessThan(180)
        for (const [x, z] of polyOf(b)) {
          expect(Math.abs(x)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
          expect(Math.abs(z)).toBeLessThanOrEqual(ARENA_HALF + 1e-9)
        }
      }
      // start within +/-35 m per axis, goal at least 10 m off the inner walls
      expect(Math.abs(t.start[0])).toBeLessThanOrEqual(35)
      expect(Math.abs(t.start[1])).toBeLessThanOrEqual(35)
      expect(Math.abs(t.goal[0])).toBeLessThanOrEqual(ARENA_HALF - 10)
      expect(Math.abs(t.goal[1])).toBeLessThanOrEqual(ARENA_HALF - 10)
      // start hull and goal >= 6 m clear of every box
      const hull = rectPoly(t.start[0], t.start[1], (t.startYawDeg * Math.PI) / 180, 4, 8)
      for (const b of t.boxes) {
        expect(cornerGap(hull, polyOf(b))).toBeGreaterThanOrEqual(6)
        expect(pointPolyGap(t.goal[0], t.goal[1], polyOf(b))).toBeGreaterThanOrEqual(6)
      }
      // the goal is reachable from the start with car-width clearance
      expect(reachable(t.boxes, t.start, t.goal)).toBe(true)
      // 50-110 m euclidean start -> goal
      expect(t.distM).toBeGreaterThanOrEqual(50)
      expect(t.distM).toBeLessThanOrEqual(110)
      expect(t.distM).toBeCloseTo(Math.hypot(t.goal[0] - t.start[0], t.goal[1] - t.start[1]), 9)
    }
  })

  it('variant 1: a valid task with a clear start, differing from variant 0', () => {
    let diffs = 0
    for (const kind of SCHLAU_KINDS)
      for (let seed = 1; seed <= 10; seed++) {
        const v0 = buildSchlauTask(kind, seed, 0)
        const v1 = buildSchlauTask(kind, seed, 1)
        expect(v1.key).toBe(schlauKey(kind, seed, 1))
        expect(v1.variant).toBe(1)
        // clear start: the hull keeps off every box
        const hull = rectPoly(v1.start[0], v1.start[1], (v1.startYawDeg * Math.PI) / 180, 4, 8)
        for (const b of v1.boxes) expect(cornerGap(hull, polyOf(b))).toBeGreaterThan(0.5)
        // still a valid task of its kind; the goal stays put (the jitter moves the start only), so the
        // distance band holds from the CANONICAL start — the origin for goal_open
        if (kind === 'goal_open') {
          expect(v1.boxes).toEqual([])
          expect(Math.hypot(v1.goal[0], v1.goal[1])).toBeGreaterThanOrEqual(60)
          expect(Math.hypot(v1.goal[0], v1.goal[1])).toBeLessThanOrEqual(140)
        } else {
          expect(v1.boxes.length).toBeGreaterThanOrEqual(4 + 3)
          expect(v1.boxes.length).toBeLessThanOrEqual(4 + 8)
          expect(Math.abs(v1.start[0])).toBeLessThanOrEqual(ARENA_HALF - 10)
          expect(Math.abs(v1.start[1])).toBeLessThanOrEqual(ARENA_HALF - 10)
          expect(Math.abs(v1.goal[0])).toBeLessThanOrEqual(ARENA_HALF - 10)
          expect(Math.abs(v1.goal[1])).toBeLessThanOrEqual(ARENA_HALF - 10)
          for (const b of v1.boxes) expect(pointPolyGap(v1.goal[0], v1.goal[1], polyOf(b))).toBeGreaterThanOrEqual(6)
        }
        // distM is the euclidean distance of the (jittered) start to the fixed goal
        expect(v1.distM).toBeCloseTo(Math.hypot(v1.goal[0] - v1.start[0], v1.goal[1] - v1.start[1]), 9)
        if (JSON.stringify(v1) !== JSON.stringify(v0)) diffs++
      }
    expect(diffs).toBeGreaterThan(0)
  })
})

describe('schlau bands', () => {
  it('train and holdout key sets are disjoint', () => {
    const train = schlauTrainKeys()
    const holdout = schlauHoldoutKeys()
    expect(train.length).toBe(2 * 8)
    expect(holdout.length).toBe(2 * 5)
    expect(train).toContain('goal_open:1')
    expect(train).toContain('goal_box:8')
    expect(holdout).toContain('goal_open:1001~1')
    expect(holdout).toContain('goal_box:1005~1')
    const set = new Set(train)
    for (const k of holdout) expect(set.has(k)).toBe(false)
    // custom bands stay disjoint too
    const t2 = schlauTrainKeys(3, ['goal_box'], 50)
    const h2 = schlauHoldoutKeys(3, ['goal_box'], 2, 5000)
    expect(t2).toEqual(['goal_box:50', 'goal_box:51', 'goal_box:52'])
    expect(h2).toEqual(['goal_box:5000~2', 'goal_box:5001~2', 'goal_box:5002~2'])
    expect(t2.some((k) => h2.includes(k))).toBe(false)
  })

  it('deterministic: two builds of the same key are identical JSON', () => {
    for (const kind of SCHLAU_KINDS)
      for (const [seed, variant] of [[1, 0], [7, 0], [3, 1], [9, 2], [1001, 1]] as const)
        expect(JSON.stringify(buildSchlauTask(kind, seed, variant))).toBe(JSON.stringify(buildSchlauTask(kind, seed, variant)))
  })
})
