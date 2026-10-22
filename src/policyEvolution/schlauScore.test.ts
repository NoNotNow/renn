import { describe, expect, it } from 'vitest'
import { pointPolyGap, polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { CourseBox } from './courses'
import { NOSE_M } from './policy'
import { buildSchlauTask, type SchlauTask } from './schlauCourses'
import {
  SCHLAU_CELL,
  SCHLAU_FILLET_M,
  SCHLAU_INFLATE_M,
  SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME,
  SCHLAU_OBJECT_TOUCH_PENALTY_PER_S,
  SCHLAU_PATH_INFLATE_M,
  SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME,
  SCHLAU_WALL_TOUCH_PENALTY_PER_S,
  schlauDistanceField,
  schlauGeodesicPath,
  schlauGeodesicPathInflated,
  schlauTouchPenaltyNorm,
} from './schlauScore'

/** length of a polyline (m) */
const polylineLength = (pts: V2[]): number => {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  return len
}

/** start nose: start + headingDir(yaw) * NOSE_M (0 deg = -Z, positive left) */
const startNose = (task: SchlauTask): V2 => {
  const yawRad = (task.startYawDeg * Math.PI) / 180
  return [task.start[0] - Math.sin(yawRad) * NOSE_M, task.start[1] - Math.cos(yawRad) * NOSE_M]
}

const polyOf = (b: CourseBox): V2[] => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])

/** distance of a point from the segment a -> b */
const pointSegDist = (p: V2, a: V2, b: V2): number => {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}

/** exact min clearance (m) of a polyline's straight segments from the polys */
const minClearance = (pts: V2[], polys: V2[][]): number => {
  let min = Infinity
  for (let i = 1; i < pts.length; i++) for (const poly of polys) min = Math.min(min, polyGap([pts[i - 1]!, pts[i]!], poly))
  return min
}

/**
 * Independent route-existence check on the 1 m grid (the documented fallback condition): 8-connected BFS over the
 * boxes +/- 12 m, a cell FREE when its centre keeps `inflate` of EXACT clearance — the same free-cell rule as the
 * path's Dijkstra, so `routeExistsAt(boxes, start, goal, SCHLAU_PATH_INFLATE_M) === false` is exactly when the
 * 2.5 m fallback is allowed.
 */
const routeExistsAt = (boxes: CourseBox[], start: V2, goal: V2, inflate: number): boolean => {
  const polys = boxes.map(polyOf)
  let minX = Math.min(start[0], goal[0])
  let maxX = Math.max(start[0], goal[0])
  let minZ = Math.min(start[1], goal[1])
  let maxZ = Math.max(start[1], goal[1])
  for (const b of boxes) {
    const r = Math.hypot(b.size[0], b.size[1]) / 2
    minX = Math.min(minX, b.at[0] - r)
    maxX = Math.max(maxX, b.at[0] + r)
    minZ = Math.min(minZ, b.at[1] - r)
    maxZ = Math.max(maxZ, b.at[1] + r)
  }
  const m = 12
  const x0 = Math.floor(minX - m)
  const z0 = Math.floor(minZ - m)
  const nx = Math.ceil(maxX + m - x0) + 1
  const nz = Math.ceil(maxZ + m - z0) + 1
  const free = (i: number, j: number) => polys.every((poly) => pointPolyGap(x0 + i + 0.5, z0 + j + 0.5, poly) >= inflate)
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, Math.floor(v)))
  const [si, sj] = [clamp(start[0] - x0, nx - 1), clamp(start[1] - z0, nz - 1)]
  const [gi, gj] = [clamp(goal[0] - x0, nx - 1), clamp(goal[1] - z0, nz - 1)]
  if (!free(gi, gj)) return false
  const seen = new Uint8Array(nx * nz)
  const q: number[] = [sj * nx + si]
  seen[sj * nx + si] = 1
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!
    if (c === gj * nx + gi) return true
    const i = c % nx
    const j = (c - i) / nx
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
      const n = nj * nx + ni
      if (seen[n] || !free(ni, nj)) continue
      seen[n] = 1
      q.push(n)
    }
  }
  return false
}

describe('schlauScore: the geodesic distance field + shortest path', () => {
  it('pins the grid constants (1 m cells; the field keeps 2.5 m, the path keeps 4 m with a 2.5 m fallback)', () => {
    expect(SCHLAU_CELL).toBe(1)
    expect(SCHLAU_INFLATE_M).toBe(2.5)
    expect(SCHLAU_PATH_INFLATE_M).toBe(4)
    expect(SCHLAU_FILLET_M).toBe(5)
  })

  it('pins the schlau touch penalties (user decision 2026-10-23: wall 12 -> 30 pts/s, object 4 -> 15 pts/s)', () => {
    // the world score stage currency (points per second of contact)
    expect(SCHLAU_WALL_TOUCH_PENALTY_PER_S).toBe(30)
    expect(SCHLAU_OBJECT_TOUCH_PENALTY_PER_S).toBe(15)
    // the episode currency (norm per touching frame): the old v3 borrow scaled by the same factors (x2.5 / x3.75)
    expect(SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME).toBeCloseTo(0.03125, 12)
    expect(SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME).toBeCloseTo(0.01875, 12)
    expect(schlauTouchPenaltyNorm(60, 0)).toBeCloseTo(60 * SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME, 12)
    expect(schlauTouchPenaltyNorm(0, 60)).toBeCloseTo(60 * SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME, 12)
    expect(schlauTouchPenaltyNorm(undefined, undefined)).toBe(0)
  })

  it('empty boxes: the field is the plain euclidean distance to the goal (grid tolerance), 0 at the goal', () => {
    const goal: V2 = [3, -7]
    const f = schlauDistanceField([], goal)
    expect(f.at(goal[0], goal[1])).toBeLessThan(1)
    for (const [dx, dz] of [
      [10, 0],
      [7, -7],
      [-9, 4],
      [0, -11],
      [-6, -8],
    ] as const) {
      expect(Math.abs(f.at(goal[0] + dx, goal[1] + dz) - Math.hypot(dx, dz))).toBeLessThanOrEqual(1.5)
    }
  })

  it('one box directly between start and goal: the field and the path detour around it', () => {
    const box: CourseBox = { at: [0, -15], size: [14, 10], yawDeg: 0 }
    const start: V2 = [0, 0]
    const goal: V2 = [0, -30]
    const euclid = Math.hypot(start[0] - goal[0], start[1] - goal[1])
    const f = schlauDistanceField([box], goal)
    expect(f.at(start[0], start[1])).toBeGreaterThan(euclid + 5)
    const path = schlauGeodesicPath([box], start, goal)
    expect(path).not.toBeNull()
    const pts = path!
    expect(polylineLength(pts)).toBeGreaterThan(euclid + 5)
    expect(Math.hypot(pts[0]![0] - start[0], pts[0]![1] - start[1])).toBeLessThan(1.5)
    expect(Math.hypot(pts[pts.length - 1]![0] - goal[0], pts[pts.length - 1]![1] - goal[1])).toBeLessThan(1.5)
    // resampled: no consecutive gap beyond 10 m
    for (let i = 1; i < pts.length; i++) {
      expect(Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])).toBeLessThanOrEqual(10 + 1e-9)
    }
    // every straight segment keeps the PATH's full 4 m of clearance from the box (exact segment <-> box gap;
    // the path exists at 4 m here, so no fallback) — and the fillet rounds the detour: no vertex turns sharper
    // than 60 deg (a corner where the fillet cannot keep the clearance keeps a moderate sharp vertex instead)
    const poly = rectPoly(box.at[0], box.at[1], 0, box.size[0], box.size[1])
    expect(minClearance(pts, [poly])).toBeGreaterThanOrEqual(SCHLAU_PATH_INFLATE_M - 1e-6)
    for (let i = 2; i < pts.length; i++) {
      const a = Math.atan2(pts[i - 1]![1] - pts[i - 2]![1], pts[i - 1]![0] - pts[i - 2]![0])
      const b = Math.atan2(pts[i]![1] - pts[i - 1]![1], pts[i]![0] - pts[i - 1]![0])
      const turn = Math.abs(((b - a + Math.PI) % (2 * Math.PI)) - Math.PI)
      expect(turn).toBeLessThanOrEqual((60 * Math.PI) / 180)
    }
  })

  it('goal_box tasks (seeds 1..10): the path keeps >= 4 m of clearance from every box, or the documented 2.5 m fallback when no 4 m route exists (user decision 2026-10-23)', () => {
    let fallbacks = 0
    for (let seed = 1; seed <= 10; seed++) {
      const task = buildSchlauTask('goal_box', seed)
      const nose = startNose(task)
      const res = schlauGeodesicPathInflated(task.boxes, nose, task.goal)
      expect(res, `seed ${seed}`).not.toBeNull()
      const polys = task.boxes.map(polyOf)
      expect(res!.pts.length, `seed ${seed}`).toBeGreaterThan(1)
      // resampled: no consecutive gap beyond 10 m
      for (let i = 1; i < res!.pts.length; i++)
        expect(Math.hypot(res!.pts[i]![0] - res!.pts[i - 1]![0], res!.pts[i]![1] - res!.pts[i - 1]![1]), `seed ${seed}`).toBeLessThanOrEqual(10 + 1e-9)
      const min = minClearance(res!.pts, polys)
      if (res!.inflate === SCHLAU_PATH_INFLATE_M) {
        // the primary build: EXACT — every straight segment keeps the full 4 m off every box (no grazing corners)
        expect(min, `seed ${seed}`).toBeGreaterThanOrEqual(SCHLAU_PATH_INFLATE_M - 1e-6)
      } else {
        // the documented fallback: only allowed when NO 4 m route exists, and it keeps the old 2.5 m floor
        expect(res!.inflate, `seed ${seed}`).toBe(SCHLAU_INFLATE_M)
        expect(routeExistsAt(task.boxes, nose, task.goal, SCHLAU_PATH_INFLATE_M), `seed ${seed}`).toBe(false)
        expect(min, `seed ${seed}`).toBeGreaterThanOrEqual(SCHLAU_INFLATE_M - 1e-6)
        fallbacks++
      }
      // the crossing wall forces a detour: the path deviates >= 4 m off the direct nose -> goal line
      let maxDev = 0
      for (const p of res!.pts) maxDev = Math.max(maxDev, pointSegDist(p, nose, task.goal))
      expect(maxDev, `seed ${seed}`).toBeGreaterThanOrEqual(4)
    }
    expect(fallbacks).toBeLessThan(10)
  })

  it('goal walled off by a closed ring of boxes: no path, the field value is finite and beyond span', () => {
    const ring: CourseBox[] = [
      { at: [0, -19], size: [22, 2], yawDeg: 0 },
      { at: [0, -41], size: [22, 2], yawDeg: 0 },
      { at: [-11, -30], size: [2, 22], yawDeg: 0 },
      { at: [11, -30], size: [2, 22], yawDeg: 0 },
    ]
    const start: V2 = [0, 0]
    const goal: V2 = [0, -30]
    expect(schlauGeodesicPath(ring, start, goal)).toBeNull()
    const f = schlauDistanceField(ring, goal)
    const v = f.at(start[0], start[1])
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBeGreaterThan(f.span)
  })

  it('a long thin wall with an 8 m gap: no 4 m corridor fits the gap, so the path goes AROUND the wall end at 4 m', () => {
    const wall: CourseBox[] = [
      { at: [-32, -30], size: [56, 2], yawDeg: 0 }, // x in [-60, -4]
      { at: [32, -30], size: [56, 2], yawDeg: 0 }, // x in [4, 60]
    ]
    const start: V2 = [0, 0]
    const goal: V2 = [0, -60]
    // a 4 m route EXISTS (around the |x| = 60 wall ends, inside the grid margin) -> the primary build, no fallback
    expect(routeExistsAt(wall, start, goal, SCHLAU_PATH_INFLATE_M)).toBe(true)
    const res = schlauGeodesicPathInflated(wall, start, goal)
    expect(res).not.toBeNull()
    expect(res!.inflate).toBe(SCHLAU_PATH_INFLATE_M)
    const pts = res!.pts
    // the route rounds a wall end: it reaches beyond |x| = 60, keeping the full 4 m off both wall pieces
    expect(pts.some(([x]) => Math.abs(x) >= 60)).toBe(true)
    expect(minClearance(pts, wall.map(polyOf))).toBeGreaterThanOrEqual(SCHLAU_PATH_INFLATE_M - 1e-6)
  })

  it('a closed ring with a 6.2 m gate: no 4 m route exists -> the documented 2.5 m fallback threads the gate', () => {
    // the goal sits inside a closed box ring whose only opening is 6.2 m wide — wide enough for a 2.5 m corridor
    // (a cell centre at |x| = 0.5 keeps 2.6 m), too narrow for a 4 m corridor, and closed everywhere else
    const ring: CourseBox[] = [
      { at: [0, -41], size: [22, 2], yawDeg: 0 },
      { at: [-11, -30], size: [2, 22], yawDeg: 0 },
      { at: [11, -30], size: [2, 22], yawDeg: 0 },
      { at: [-7.05, -19], size: [7.9, 2], yawDeg: 0 }, // x in [-11, -3.1]
      { at: [7.05, -19], size: [7.9, 2], yawDeg: 0 }, // x in [3.1, 11] — the gate: x in [-3.1, 3.1]
    ]
    const start: V2 = [0, 0]
    const goal: V2 = [0, -30]
    expect(routeExistsAt(ring, start, goal, SCHLAU_PATH_INFLATE_M)).toBe(false)
    expect(routeExistsAt(ring, start, goal, SCHLAU_INFLATE_M)).toBe(true)
    const res = schlauGeodesicPathInflated(ring, start, goal)
    expect(res).not.toBeNull()
    expect(res!.inflate).toBe(SCHLAU_INFLATE_M)
    // the fallback path threads the gate and keeps the 2.5 m floor everywhere
    expect(res!.pts.some(([x, z]) => Math.abs(x) < 3.1 && z <= -18 && z >= -20)).toBe(true)
    expect(minClearance(res!.pts, ring.map(polyOf))).toBeGreaterThanOrEqual(SCHLAU_INFLATE_M - 1e-6)
  })

  it('deterministic: two calls produce identical output', () => {
    const boxes: CourseBox[] = [
      { at: [0, -15], size: [12, 10], yawDeg: 0 },
      { at: [-20, -40], size: [6, 3], yawDeg: 30 },
    ]
    const goal: V2 = [5, -50]
    const f1 = schlauDistanceField(boxes, goal)
    const f2 = schlauDistanceField(boxes, goal)
    expect([f1.x0, f1.z0, f1.nx, f1.nz, f1.inflate, f1.span]).toEqual([f2.x0, f2.z0, f2.nx, f2.nz, f2.inflate, f2.span])
    for (const [x, z] of [[0, 0], [10, -20], [-30, -45], [5, -50], [100, 100]] as const) {
      expect(f1.at(x, z)).toBe(f2.at(x, z))
    }
    const p1 = schlauGeodesicPath(boxes, [0, 0], goal)
    const p2 = schlauGeodesicPath(boxes, [0, 0], goal)
    expect(p1).toEqual(p2)
  })
})
