import { describe, expect, it } from 'vitest'
import { beatsBestSchlau } from './schlauCheckpoint'

// The checkpoint selection of the schlau runner (critique 2026-10-23 §0): FINISH COUNT first, the ascending
// lex episode-value vector only as the tie-break. The pure lex order preferred the 0-finish creeper over the
// real driver — these tests pin that the creeper can never win again.
describe('beatsBestSchlau', () => {
  it('a creeper with tiny positives LOSES to a driver with more finishes (the base-run bug)', () => {
    const creeper = { finishes: 0, vec: [0.0003, 0.0004, 0.0006, 0.0009] }
    const driver = { finishes: 14, vec: [0, 0, 0.0001, 0.002] }
    expect(beatsBestSchlau(driver, creeper)).toBe(true)
    expect(beatsBestSchlau(creeper, driver)).toBe(false)
  })

  it('equal finishes fall back to the ascending lex vector (the es.ts order)', () => {
    expect(beatsBestSchlau({ finishes: 10, vec: [0.1, 0.2] }, { finishes: 10, vec: [0.1, 0.1] })).toBe(true)
    expect(beatsBestSchlau({ finishes: 10, vec: [0.1, 0.1] }, { finishes: 10, vec: [0.1, 0.2] })).toBe(false)
    expect(beatsBestSchlau({ finishes: 10, vec: [0.1, 0.2] }, { finishes: 10, vec: [0.1, 0.2] })).toBe(false)
    // a true 0 slot vs a tiny positive on equal finishes: the lex order still sees the difference
    expect(beatsBestSchlau({ finishes: 5, vec: [0, 0.5] }, { finishes: 5, vec: [0.0003, 0.4] })).toBe(false)
    expect(beatsBestSchlau({ finishes: 5, vec: [0.0003, 0.4] }, { finishes: 5, vec: [0, 0.5] })).toBe(true)
  })

  it('an absent incumbent or a legacy incumbent without a finish count', () => {
    expect(beatsBestSchlau({ finishes: 0, vec: [0.0001] })).toBe(true)
    // legacy incumbent (pre-trainFinishes run file) reads as 0 finishes — correct for the stored creeper
    expect(beatsBestSchlau({ finishes: 1, vec: [0] }, { finishes: undefined as unknown as number, vec: [0.0003] })).toBe(true)
    // a 0-finish candidate does NOT displace the legacy incumbent (the lex tie-break decides; a real driver with >= 1 finishes does)
    expect(beatsBestSchlau({ finishes: 0, vec: [0.0001] }, { finishes: undefined as unknown as number, vec: [0.0003] })).toBe(false)
    expect(beatsBestSchlau({ finishes: 0, vec: [0.0004] }, { finishes: undefined as unknown as number, vec: [0.0003] })).toBe(true)
    // a shorter incumbent vector (the legacy scalar fallback) pads with 0
    expect(beatsBestSchlau({ finishes: 3, vec: [0.1, 0.2] }, { finishes: 3, vec: [0.1] })).toBe(true)
  })
})
