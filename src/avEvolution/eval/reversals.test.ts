import { describe, expect, it } from 'vitest'
import { ReversalCounter } from './reversals'

const run = (vs: number[]) => {
  const c = new ReversalCounter()
  vs.forEach((v) => c.push(v))
  return c
}

describe('ReversalCounter', () => {
  it('counts nothing for monotone forward or backward driving', () => {
    expect(run([0, 2, 5, 8, 3, 1.5]).count).toBe(0)
    expect(run([-2, -5, -3]).count).toBe(0)
  })
  it('a K-turn (forward, back, forward) is two reversals', () => {
    expect(run([5, 3, 0, -2, -4, -1.5, 0, 2, 6]).count).toBe(2)
  })
  it('hysteresis: a dip through 0 that never exceeds 1 m/s the other way is NOT a reversal', () => {
    expect(run([5, 2, 0.5, -0.5, -1, 0, 0.8, 3, 6]).count).toBe(0)
    expect(run([5, -0.99, 5]).count).toBe(0)
  })
  it('exactly 1 m/s is inside the dead band, just above counts', () => {
    expect(run([5, -1, 5]).count).toBe(0)
    expect(run([5, -1.01, 5]).count).toBe(2)
  })
  it('the first sample above the threshold only sets the sign; starting from rest is free', () => {
    expect(run([0, 0, -3, -4]).count).toBe(0)
    expect(run([0, 0, -3, 3]).count).toBe(1)
  })
  it('reverseFrames counts samples below -1 m/s', () => {
    expect(run([5, -0.5, -1.5, -3, -2, 4]).reverseFrames).toBe(3)
  })
})
