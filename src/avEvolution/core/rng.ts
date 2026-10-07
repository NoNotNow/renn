/** Seeded PRNG (mulberry32). All stochastic core code takes an Rng; never Math.random. */
export interface Rng {
  /** uniform [0,1) */
  next(): number
  /** serialisable state */
  getState(): number
  setState(s: number): void
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    getState: () => a,
    setState: (s) => {
      a = s >>> 0
    },
  }
}

/** Standard normal via Box-Muller. */
export function gaussian(rng: Rng): number {
  let u = 0
  while (u === 0) u = rng.next()
  const v = rng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function randInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng.next() * n))
}
