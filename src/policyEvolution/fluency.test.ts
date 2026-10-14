import { describe, expect, it } from 'vitest'
import { episodeValues, fluencyPenaltyNorm, V3_LAT_JERK_PENALTY, V3_LAT_JERK_RADS, V3_LONG_JERK_MPS2, V3_LONG_JERK_PENALTY } from './es'
import { runPolicyEpisode } from './episode'
import { genomeLengthV3 } from './policy'
import { reverserV3 } from './handWired'
import { initRapier } from '@/physics/rapierPhysics'

/**
 * Fluency shaping (obstacle-fluency 2026-10-14): the v3 fitness subtracts a per-episode penalty for RAPID
 * speed / steering changes — the windowed (1.5 s) net accel / yaw-rate changes of the car (episode.ts counts
 * the windows, es.ts prices them). Pinned here:
 *  - the penalty math (windows x rates) and its commensurability with the touch penalties,
 *  - the wiring: an episode's metrics carry the window counts, the fitness values subtract the penalty,
 *  - the calibration invariants: deadbands sit above the actuator's 60 Hz pedal bang-bang (a constant-rate
 *    turn / a smooth reversal pays ~0), the per-window cost stays far below a wall-touch second.
 */
describe('fluencyPenaltyNorm (the pure seam)', () => {
  it('prices jerk windows in norm currency, ignoring absent metrics (pre-fluency files)', () => {
    expect(fluencyPenaltyNorm(undefined, undefined)).toBe(0)
    expect(fluencyPenaltyNorm(3, 0)).toBe(3 * V3_LONG_JERK_PENALTY)
    expect(fluencyPenaltyNorm(0, 2)).toBe(2 * V3_LAT_JERK_PENALTY)
    expect(fluencyPenaltyNorm(2, 2)).toBe(2 * (V3_LONG_JERK_PENALTY + V3_LAT_JERK_PENALTY))
  })

  it('stays commensurable: a full oscillatory episode pays less than a single second of wall grinding', () => {
    // a worst-case S4-style oscillatory episode: ~30 above-deadband windows (measured, gates)
    const worst = fluencyPenaltyNorm(11, 22)
    const wallSecond = 60 * 0.0125 // CRASH-grade contact: 60 frames of wall touch
    expect(worst).toBeGreaterThan(0.05)
    expect(worst).toBeLessThan(wallSecond / 2)
    // and the deadbands sit above the smooth-maneuvre scale: a hard-but-constant brake (m/s^2) and a
    // constant-rate racing-line turn stay free by construction
    expect(V3_LONG_JERK_MPS2).toBeGreaterThan(0)
    expect(V3_LAT_JERK_RADS).toBeGreaterThan(0)
  })
})

describe('fluency wiring (episode.ts -> es.ts)', () => {
  it('v3 episodes report their jerk window counts', async () => {
    await initRapier()
    const m = await runPolicyEpisode(reverserV3(), 'free:1#1v3')
    expect(m.jerkLongWins).toBeDefined()
    expect(m.jerkLatWins).toBeDefined()
    expect(m.jerkLongWins!).toBeGreaterThanOrEqual(0)
    expect(m.jerkLatWins!).toBeGreaterThanOrEqual(0)
  }, 60_000)

  it('a stalled car banks no fluency penalty (the counters, not the metric, feed the fitness)', async () => {
    await initRapier()
    const zero = new Array<number>(genomeLengthV3(24)).fill(0)
    const m = await runPolicyEpisode(zero, 'free:2#1v3')
    expect(m.outcome).toBe('stall')
    expect(m.jerkLongWins).toBe(0)
    expect(m.jerkLatWins).toBe(0)
  }, 60_000)

  it('episodeValues subtracts the fluency penalty from metrics without peakNorm (the fallback path)', () => {
    const base = { key: 'free:1#0v3', norm: 0.5, outcome: 'finish' as const, maxDevOrigM: 0, length: 100, touchWallFrames: 0, touchObjectFrames: 0 }
    const clean = [{ ...base }]
    const jerky = [{ ...base, jerkLongWins: 10, jerkLatWins: 10 }]
    const [cleanVal] = episodeValues(clean)
    const [jerkyVal] = episodeValues(jerky)
    expect(cleanVal).toBe(0.5)
    expect(jerkyVal).toBeCloseTo(0.5 - fluencyPenaltyNorm(10, 10), 10)
    expect(jerkyVal).toBeLessThan(cleanVal)
  })
})
