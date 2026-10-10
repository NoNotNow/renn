import { describe, expect, it } from 'vitest'
import { kindTolerance, shipDecision, type KindFinish } from './shipGate'

const k = (kind: string, finished: number, chains: number): KindFinish => ({ kind, finished, chains })

describe('ship gate (holdout finish count)', () => {
  const shipped = [k('corridor', 17, 18), k('maze', 12, 15), k('free', 20, 24)]
  it('tolerance is max(1, ceil(5 %))', () => {
    expect(kindTolerance(18)).toBe(1)
    expect(kindTolerance(20)).toBe(1)
    expect(kindTolerance(21)).toBe(2)
    expect(kindTolerance(100)).toBe(5)
  })
  it('equal total is rejected, strictly higher accepted', () => {
    expect(shipDecision([k('corridor', 17, 18), k('maze', 12, 15), k('free', 20, 24)], shipped).ship).toBe(false)
    const d = shipDecision([k('corridor', 17, 18), k('maze', 12, 15), k('free', 21, 24)], shipped)
    expect(d.ship).toBe(true)
  })
  it('a kind losing 2 of 18 is rejected even if the total is higher', () => {
    const d = shipDecision([k('corridor', 15, 18), k('maze', 12, 15), k('free', 24, 24)], shipped)
    expect(d.totalOk).toBe(true)
    expect(d.ship).toBe(false)
    expect(d.worseKinds).toEqual(['corridor'])
    expect(d.verdict).toContain('corridor')
  })
  it('a kind losing 1 is accepted (corridor 17->16, maze 12->11)', () => {
    const d = shipDecision([k('corridor', 16, 18), k('maze', 11, 15), k('free', 24, 24)], shipped)
    expect(d.ship).toBe(true)
  })
  it('tolerance scales to 5 % for large kinds', () => {
    const s = [k('big', 100, 100), k('x', 0, 10)]
    expect(shipDecision([k('big', 95, 100), k('x', 10, 10)], s).ship).toBe(true)
    expect(shipDecision([k('big', 94, 100), k('x', 10, 10)], s).ship).toBe(false)
  })
  it('fitness plays no role: decision depends only on finish counts', () => {
    expect(shipDecision(shipped, shipped).ship).toBe(false)
    expect(shipDecision(shipped, shipped).verdict).toContain('(1)')
  })
})
