/**
 * Deterministic headless runs: seeded `Math.random` and a simulated `Date.now`.
 *
 * Legacy stages (self-driving-car `direction.js` / `umlenker.js`, inline world code) time manoeuvres with `Date.now()`.
 * Headless frames run much faster than real time, so those timers count a machine-dependent number of frames and two
 * runs with the same seed diverge. With the clock tied to the simulation (`advance(dt)` once per frame) a run is a pure
 * function of (world, seed, frames). `performance.now` stays real so profiling keeps measuring wall time.
 */

export interface DeterminismHandle {
  /** Advance the simulated wall clock by `dt` seconds (call once per frame). */
  advance(dt: number): void
  /** Simulated milliseconds since install. */
  simMs(): number
  /** Generator state (store in a snapshot, restore to continue the exact random stream). */
  rngState(): number
  setRngState(s: number): void
  restore(): void
}

export type SeededRandom = (() => number) & { getState(): number; setState(s: number): void }

export function mulberry32(seed: number): SeededRandom {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Object.assign(next, { getState: () => a, setState: (s: number) => void (a = s >>> 0) })
}

const EPOCH_MS = Date.UTC(2026, 0, 1)

export function installDeterminism(seed: number, startMs = 0): DeterminismHandle {
  const origRandom = Math.random
  const origNow = Date.now
  let ms = startMs
  const rng = mulberry32(seed)
  Math.random = rng
  Date.now = () => EPOCH_MS + Math.floor(ms)
  return {
    advance(dt: number) {
      ms += dt * 1000
    },
    simMs: () => ms,
    rngState: () => rng.getState(),
    setRngState: (s: number) => rng.setState(s),
    restore() {
      Math.random = origRandom
      Date.now = origNow
    },
  }
}
