import type { GenomeSpec } from './genes'
import { gaussian, randInt, type Rng } from './rng'

/** Individual's genotype: normalised vector + self-adaptive step size. */
export interface Genotype {
  vec: number[]
  sigma: number
}

export interface MutateOpts {
  /** per-gene mutation probability (default max(0.15, 1/n)) */
  mutProb?: number
  sigmaMin: number
  sigmaMax: number
  /** log-normal learning rate for sigma (default 0.3) */
  tau?: number
  /** flip probability for bool/enum genes when selected for mutation (default 0.5) */
  flipProb?: number
}

export function reflect01(x: number): number {
  let y = x
  for (let i = 0; i < 4 && (y < 0 || y > 1); i++) y = y < 0 ? -y : 2 - y
  return y < 0 ? 0 : y > 1 ? 1 : y
}

export function clampSigma(s: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, s))
}

export function mutate(spec: GenomeSpec, ind: Genotype, rng: Rng, opts: MutateOpts): Genotype {
  const n = ind.vec.length
  const tau = opts.tau ?? 0.3
  const pm = opts.mutProb ?? Math.max(0.15, 1 / n)
  const flip = opts.flipProb ?? 0.5
  const sigma = clampSigma(ind.sigma * Math.exp(tau * gaussian(rng)), opts.sigmaMin, opts.sigmaMax)
  const vec = ind.vec.slice()
  let any = false
  const apply = (i: number, force = false) => {
    const g = spec.genes[i]
    if (g.type === 'bool') {
      if (force || rng.next() < flip) vec[i] = vec[i] >= 0.5 ? 0 : 1
    } else if (g.type === 'enum') {
      if (force || rng.next() < flip) {
        const k = g.options!.length
        const cur = Math.round(vec[i] * (k - 1))
        let nx = randInt(rng, k - 1)
        if (nx >= cur) nx++
        vec[i] = nx / (k - 1)
      }
    } else {
      vec[i] = reflect01(vec[i] + sigma * gaussian(rng))
    }
  }
  for (let i = 0; i < n; i++) {
    if (rng.next() < pm) {
      apply(i)
      any = true
    }
  }
  if (!any && n > 0) apply(randInt(rng, n), true)
  return { vec, sigma }
}

export function uniformCrossover(a: Genotype, b: Genotype, rng: Rng): Genotype {
  const vec = a.vec.map((x, i) => (rng.next() < 0.5 ? x : b.vec[i]))
  return { vec, sigma: rng.next() < 0.5 ? a.sigma : b.sigma }
}

/** Perturb only genes belonging to `group` (for seeding). */
export function perturbGroup(spec: GenomeSpec, ind: Genotype, group: string, rng: Rng, sigma: number): Genotype {
  const vec = ind.vec.slice()
  spec.genes.forEach((g, i) => {
    if (g.group !== group) return
    if (g.type === 'bool') {
      if (rng.next() < 0.3) vec[i] = vec[i] >= 0.5 ? 0 : 1
    } else if (g.type === 'enum') {
      if (rng.next() < 0.3) vec[i] = randInt(rng, g.options!.length) / (g.options!.length - 1)
    } else vec[i] = reflect01(vec[i] + sigma * gaussian(rng))
  })
  return { vec, sigma: ind.sigma }
}
