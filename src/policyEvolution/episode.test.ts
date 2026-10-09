import { describe, expect, it } from 'vitest'
import { polyGap, rectPoly } from '@/avEvolution/eval/geometry'
import { buildCourse, COURSE_KINDS, COURSE_LENGTH, FIELD_HALF_WIDTH, holdoutCourseKeys, RouteProgress, trainCourseKeys } from './courses'
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

  it('is deterministic', async () => {
    const a = await runPolicyEpisode(straightGas(), 'field:2')
    const b = await runPolicyEpisode(straightGas(), 'field:2')
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
  }, 120_000)
})
