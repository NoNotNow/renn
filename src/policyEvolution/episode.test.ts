import { describe, expect, it } from 'vitest'
import { buildCourse, holdoutCourseKeys, trainCourseKeys } from './courses'
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
    expect(m.progress).toBeGreaterThan(60)
  }, 60_000)

  it('is deterministic', async () => {
    const a = await runPolicyEpisode(straightGas(), 'field:2')
    const b = await runPolicyEpisode(straightGas(), 'field:2')
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
  }, 120_000)
})
