import { describe, expect, it } from 'vitest'
import { polyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { buildCourse, COURSE_KINDS, courseKey, parseCourseKey, polylineNearestDist, withVariant, COURSE_LENGTH, FIELD_HALF_WIDTH, holdoutCourseKeys, RouteProgress, trainCourseKeys } from './courses'
import { runPolicyEpisode } from './episode'
import { GENOME_LENGTH, N_HIDDEN, N_IN, N_OUT, N_RAYS } from './policy'

/** zero weights except the gas bias: drives straight ahead at full throttle */
function straightGas(): number[] {
  const w = new Array<number>(GENOME_LENGTH).fill(0)
  w[GENOME_LENGTH - N_OUT + 1] = 3
  return w
}

/** hand-wired: steer = tanh(5 x goalLeft), speed target ~9 m/s (checks the goal vector and the steering sign) */
function goalFollower(): number[] {
  const w = new Array<number>(GENOME_LENGTH).fill(0)
  w[0 * N_IN + N_RAYS + 4] = 5
  w[N_HIDDEN * N_IN + N_HIDDEN + 0 * N_HIDDEN + 0] = 2
  w[GENOME_LENGTH - N_OUT + 1] = 0.3
  return w
}

describe('courses', () => {
  it('are deterministic and disjoint between train and holdout', () => {
    expect(buildCourse('field', 3)).toEqual(buildCourse('field', 3))
    expect(buildCourse('slalom', 3).boxes.length).toBeGreaterThan(20)
    expect(trainCourseKeys().some((k) => holdoutCourseKeys().includes(k))).toBe(false)
    expect(trainCourseKeys(2).length).toBe(2 * COURSE_KINDS.length)
  })

  it('maze courses: the route is a chain of neighbouring cells and the start is free', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const c = buildCourse('maze', seed)
      expect(c.boxes.length).toBeGreaterThan(30)
      const pts: Array<[number, number]> = [[0, 0], ...c.waypoints]
      for (let i = 1; i < pts.length - 1; i++) expect(Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])).toBeCloseTo(16, 3)
      const yaw = ((c.startYawDeg ?? 0) * Math.PI) / 180
      const hull = rectPoly(0, 0, yaw, 4, 8)
      for (const b of c.boxes) expect(polyGap(hull, rectPoly(b.at[0], b.at[1], 0, b.size[0], b.size[1]))).toBeGreaterThan(0.5)
    }
  })

  it('grid courses: deterministic serpentine of lane centres, U-turn hops a lane wide, start and walls clear of each other', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const c = buildCourse('grid', seed)
      expect(buildCourse('grid', seed)).toEqual(c)
      const { laneW, lanes, zFar, zNear, len } = c.layout!
      expect(laneW!).toBeGreaterThanOrEqual(24)
      expect(laneW!).toBeLessThanOrEqual(28)
      expect(len!).toBeGreaterThanOrEqual(56)
      expect(len!).toBeLessThanOrEqual(72)
      // the serpentine: the mouth of every lane in driving order (far / near alternating), then the crossing to the next lane
      expect(c.waypoints.length).toBe(2 * (lanes! - 1) + 1)
      const pts: Array<[number, number]> = [[0, 0], ...c.waypoints]
      const mouth = (lane: number) => (lane % 2 === 0 ? zFar! : zNear!)
      for (let i = 0; i < c.waypoints.length; i++) {
        // waypoint i belongs to lane ceil(i/2) and sits at the mouth z of lane floor(i/2) (the crossing to the next lane)
        expect(Math.abs(pts[i + 1]![0] - Math.ceil(i / 2) * laneW!)).toBeLessThan(1e-9)
        expect(pts[i + 1]![1]).toBeCloseTo(mouth(Math.floor(i / 2)), 6)
      }
      // route length = the polyline through start and waypoints
      let length = 0
      for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
      expect(c.length).toBeCloseTo(length, 6)
      // every U-turn hop is one lane wide: >= 24 m turning diameter (the car's min turn circle is ~10 m radius, hull 4 x 8 m)
      for (let i = 1; i < pts.length - 1; i += 2) {
        expect(Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1])).toBeCloseTo(laneW!, 6)
      }
      // the start hull is clear of every wall / divider, and vice versa
      const hull = rectPoly(0, 0, 0, 4, 8)
      for (const b of c.boxes) expect(polyGap(hull, rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))).toBeGreaterThan(0.5)
    }
  })
})

describe('start variants', () => {
  it('keys parse and round-trip, variant 0 is the canonical course', () => {
    expect(parseCourseKey('field:5')).toEqual({ kind: 'field', seed: 5, variant: 0, difficulty: 1 })
    expect(parseCourseKey('maze:7~3')).toEqual({ kind: 'maze', seed: 7, variant: 3, difficulty: 1 })
    expect(courseKey('slalom', 2, 4)).toBe('slalom:2~4')
    expect(withVariant('field:5~2', 9)).toBe('field:5~9')
    expect(buildCourse('field', 5, 0)).toEqual(buildCourse('field', 5))
    expect(() => parseCourseKey('field:5~x')).toThrow()
  })

  it('variants move only the start pose, deterministically, and keep the car clear of walls', () => {
    for (const kind of COURSE_KINDS) {
      for (let seed = 1; seed <= 8; seed++) {
        const base = buildCourse(kind, seed)
        const a = buildCourse(kind, seed, 1)
        expect(buildCourse(kind, seed, 1)).toEqual(a)
        expect(a.boxes).toEqual(base.boxes)
        expect(a.waypoints).toEqual(base.waypoints)
        const b = buildCourse(kind, seed, 2)
        expect(a.startAt === undefined || b.startAt === undefined || a.startAt[0] !== b.startAt[0] || a.startYawDeg !== b.startYawDeg).toBe(true)
        const at = a.startAt ?? [0, 0]
        const hull = rectPoly(at[0], at[1], (((a.startYawDeg ?? 0)) * Math.PI) / 180, 4, 8)
        for (const box of a.boxes) expect(polyGap(hull, rectPoly(box.at[0], box.at[1], (box.yawDeg * Math.PI) / 180, box.size[0], box.size[1]))).toBeGreaterThan(0.4)
      }
    }
  })
})

describe('field track', () => {
  it('is closed: continuous side walls, back and end wall, so the obstacle field cannot be driven around', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const c = buildCourse('field', seed)
      for (const side of [-1, 1]) {
        for (let z = 18; z > -COURSE_LENGTH - 30; z -= 1) {
          const covered = c.boxes.some((b) => b.size[1] >= 39 && Math.abs(b.at[0] - side * FIELD_HALF_WIDTH) < 1e-9 && Math.abs(z - b.at[1]) <= b.size[1] / 2)
          expect(covered, `seed ${seed} side ${side} z ${z}`).toBe(true)
        }
      }
      expect(c.boxes.some((b) => b.at[1] > 20 && b.size[0] > 2 * FIELD_HALF_WIDTH)).toBe(true)
      expect(c.boxes.some((b) => b.at[1] < -COURSE_LENGTH && b.size[0] > 2 * FIELD_HALF_WIDTH)).toBe(true)
      // goals stay near the middle of the track
      for (const w of c.waypoints) expect(Math.abs(w[0])).toBeLessThanOrEqual(8)
    }
  })

  it('RouteProgress reports the distance to the route', () => {
    const c = buildCourse('field', 1)
    const r = new RouteProgress(c)
    r.update(0, -5)
    expect(r.lastDist).toBeLessThan(10)
    r.update(40, -5)
    expect(r.lastDist).toBeGreaterThan(30)
  })

  it('polylineNearestDist finds the true nearest segment (no hint, vertices included)', () => {
    const L: V2[] = [
      [0, 0],
      [10, 0],
    ]
    expect(polylineNearestDist(L, 5, 0)).toBeCloseTo(0, 9) // on the segment
    expect(polylineNearestDist(L, 5, 3)).toBeCloseTo(3, 9) // perpendicular
    expect(polylineNearestDist(L, -4, 0)).toBeCloseTo(4, 9) // before the start vertex
    expect(polylineNearestDist(L, 14, 0)).toBeCloseTo(4, 9) // past the end vertex
    const bent: V2[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ]
    expect(polylineNearestDist(bent, 12, 2)).toBeCloseTo(2, 9) // nearest on the SECOND segment
    expect(polylineNearestDist(bent, 5, 5)).toBeCloseTo(5, 9) // the elbow is further than the first segment
    expect(polylineNearestDist([[3, 4]], 0, 0)).toBe(0) // degenerate: single point
    expect(polylineNearestDist([], 0, 0)).toBe(0) // degenerate: empty
  })
})

describe('policy episode', () => {
  it('a zero policy stands still and is aborted as stalled', async () => {
    const m = await runPolicyEpisode(new Array<number>(GENOME_LENGTH).fill(0), 'field:1')
    expect(m.outcome).toBe('stall')
    expect(m.progress).toBeLessThan(2)
  }, 60_000)

  it('full throttle drives, then crashes into something', async () => {
    const m = await runPolicyEpisode(straightGas(), 'slalom:1')
    console.log(JSON.stringify(m))
    expect(m.progress).toBeGreaterThan(5)
    expect(['crash', 'stall', 'finish', 'timeout']).toContain(m.outcome)
  }, 60_000)

  it('a hand-wired goal follower steers toward the goals', async () => {
    const m = await runPolicyEpisode(goalFollower(), 'field:1')
    console.log(JSON.stringify(m))
    expect(m.progress).toBeGreaterThan(25)
  }, 60_000)

  it('a hand-wired goal follower makes headway in a maze', async () => {
    const m = await runPolicyEpisode(goalFollower(), 'maze:1')
    console.log(JSON.stringify(m))
    expect(m.progress).toBeGreaterThan(10)
  }, 60_000)

  it('a car that drives away from the route sideways never finishes (wall / off-course)', async () => {
    const w = new Array<number>(GENOME_LENGTH).fill(0)
    w[GENOME_LENGTH - N_OUT] = 0.6 // constant left steering
    w[GENOME_LENGTH - N_OUT + 1] = 1 // speed target
    const m = await runPolicyEpisode(w, 'field:3')
    expect(['crash', 'offcourse', 'stall']).toContain(m.outcome)
    expect(m.progress).toBeLessThan(100)
  }, 60_000)

  it('a start variant and sensor noise run deterministically and are not the canonical episode', async () => {
    const a = await runPolicyEpisode(goalFollower(), 'field:2~1')
    const b = await runPolicyEpisode(goalFollower(), 'field:2~1')
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
    const c = await runPolicyEpisode(goalFollower(), 'field:2')
    expect(c.progress).not.toBeCloseTo(a.progress, 3)
  }, 60_000)

  it('is deterministic', async () => {
    const a = await runPolicyEpisode(straightGas(), 'field:2')
    const b = await runPolicyEpisode(straightGas(), 'field:2')
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
  }, 120_000)
})
