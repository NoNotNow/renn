export type GeneType = 'float' | 'int' | 'bool' | 'enum'
export type ParamValue = number | boolean | string
export type Params = Record<string, ParamValue>

export interface GeneSpec {
  key: string
  type: GeneType
  min?: number
  max?: number
  /** float/int only; 'log' requires min > 0 */
  scale?: 'lin' | 'log'
  default: ParamValue
  group: string
  options?: string[]
}

export interface GenomeSpec {
  specVersion: string
  genes: GeneSpec[]
}

export function validateSpec(spec: GenomeSpec): string[] {
  const errs: string[] = []
  const seen = new Set<string>()
  if (!spec.specVersion) errs.push('specVersion missing')
  for (const g of spec.genes) {
    if (seen.has(g.key)) errs.push(`duplicate key ${g.key}`)
    seen.add(g.key)
    if (!g.group) errs.push(`${g.key}: group missing`)
    if (g.type === 'float' || g.type === 'int') {
      if (g.min === undefined || g.max === undefined || !(g.min < g.max)) errs.push(`${g.key}: need min < max`)
      else {
        if (g.scale === 'log' && g.min <= 0) errs.push(`${g.key}: log scale needs min > 0`)
        if (typeof g.default !== 'number' || g.default < g.min || g.default > g.max) errs.push(`${g.key}: default out of range`)
      }
    } else if (g.type === 'bool') {
      if (typeof g.default !== 'boolean') errs.push(`${g.key}: default must be boolean`)
    } else if (g.type === 'enum') {
      if (!g.options || g.options.length < 2) errs.push(`${g.key}: enum needs >= 2 options`)
      else if (typeof g.default !== 'string' || !g.options.includes(g.default)) errs.push(`${g.key}: default not in options`)
    } else errs.push(`${g.key}: unknown type`)
  }
  return errs
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export function normaliseGene(g: GeneSpec, v: ParamValue): number {
  switch (g.type) {
    case 'bool':
      return v ? 1 : 0
    case 'enum': {
      const n = g.options!.length
      const i = Math.max(0, g.options!.indexOf(String(v)))
      return i / (n - 1)
    }
    default: {
      const x = Number(v)
      const lo = g.min!
      const hi = g.max!
      if (g.scale === 'log') return clamp01((Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)))
      return clamp01((x - lo) / (hi - lo))
    }
  }
}

export function denormaliseGene(g: GeneSpec, u: number): ParamValue {
  const t = clamp01(u)
  switch (g.type) {
    case 'bool':
      return t >= 0.5
    case 'enum': {
      const n = g.options!.length
      return g.options![Math.min(n - 1, Math.round(t * (n - 1)))]
    }
    default: {
      const lo = g.min!
      const hi = g.max!
      let x = g.scale === 'log' ? Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo))) : lo + t * (hi - lo)
      if (g.type === 'int') x = Math.round(x)
      return Math.min(hi, Math.max(lo, x))
    }
  }
}

/** Params -> vector in [0,1]^n (missing keys use the gene default). */
export function normalise(spec: GenomeSpec, params: Params): number[] {
  return spec.genes.map((g) => normaliseGene(g, params[g.key] ?? g.default))
}

export function denormalise(spec: GenomeSpec, vec: number[]): Params {
  const out: Params = {}
  spec.genes.forEach((g, i) => {
    out[g.key] = denormaliseGene(g, vec[i])
  })
  return out
}

export function defaultParams(spec: GenomeSpec): Params {
  const out: Params = {}
  for (const g of spec.genes) out[g.key] = g.default
  return out
}
