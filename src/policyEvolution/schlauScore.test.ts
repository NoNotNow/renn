import { describe, expect, it } from 'vitest'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { CourseBox } from './courses'
import { SCHLAU_CELL, SCHLAU_INFLATE_M, schlauDistanceField, schlauGeodesicPath } from './schlauScore'

/** length of a polyline (m) */
const polylineLength = (pts: V2[]): number => {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  return len
}

describe('schlauScore: the geodesic distance field + shortest path', () => {
  it('pins the grid constants (1 m cells, 2.5 m inflation = car half width 2 m + 0.5 m margin)', () => {
    expect(SCHLAU_CELL).toBe(1)
    expect(SCHLAU_INFLATE_M).toBe(2.5)
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
    // every path point keeps the car's width: clearance >= inflate - 0.5 from the box
    const poly = rectPoly(box.at[0], box.at[1], 0, box.size[0], box.size[1])
    for (const [x, z] of pts) expect(pointPolyGap(x, z, poly)).toBeGreaterThanOrEqual(SCHLAU_INFLATE_M - 0.5)
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

  it('a long thin wall with a gap: the path threads the gap, far shorter than around the wall end', () => {
    const wall: CourseBox[] = [
      { at: [-32, -30], size: [56, 2], yawDeg: 0 }, // x in [-60, -4]
      { at: [32, -30], size: [56, 2], yawDeg: 0 }, // x in [4, 60]
    ]
    const start: V2 = [0, 0]
    const goal: V2 = [0, -60]
    const path = schlauGeodesicPath(wall, start, goal)
    expect(path).not.toBeNull()
    const pts = path!
    const len = polylineLength(pts)
    // going around the wall end (|x| = 60) costs ~2 x hypot(60 + inflate + 2, 30)
    const around = 2 * Math.hypot(60 + SCHLAU_INFLATE_M + 2, 30)
    expect(len).toBeLessThan(around - 40)
    // the path threads the gap: a point inside the wall line's gap (|x| < 4 at z in [-31, -29])
    expect(pts.some(([x, z]) => Math.abs(x) < 4 && z <= -29 && z >= -31)).toBe(true)
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
