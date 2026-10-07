import type { ParamDef } from '@/types/paramSchema'

/** "tickEvery" -> "Tick every". */
export function labelFromKey(key: string): string {
  const last = key.split('.').pop() ?? key
  const spaced = last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function defLabel(def: ParamDef): string {
  return def.label ?? labelFromKey(def.key)
}

type Bag = Record<string, unknown>

function isBag(v: unknown): v is Bag {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Read `key` (a literal top-level key wins; otherwise a dotted path such as `perimeter.center`). */
export function getParamValue(params: Bag | undefined, key: string): unknown {
  if (!params) return undefined
  if (key in params) return params[key]
  if (!key.includes('.')) return undefined
  let cur: unknown = params
  for (const part of key.split('.')) {
    if (!isBag(cur)) return undefined
    cur = cur[part]
  }
  return cur
}

/** Immutable write; `undefined` removes the key (reset). Dotted keys write into nested objects. */
export function setParamValue(params: Bag | undefined, key: string, value: unknown): Bag {
  const base: Bag = { ...(params ?? {}) }
  if (key in base || !key.includes('.')) {
    if (value === undefined) delete base[key]
    else base[key] = value
    return base
  }
  const [head, ...rest] = key.split('.')
  const child = isBag(base[head!]) ? (base[head!] as Bag) : undefined
  if (value === undefined && child === undefined) return base
  base[head!] = setParamValue(child, rest.join('.'), value)
  return base
}

/** True when a value is stored here and differs from the schema default. */
export function isOverridden(value: unknown, def: ParamDef): boolean {
  if (value === undefined) return false
  if (def.default === undefined) return true
  return JSON.stringify(value) !== JSON.stringify(def.default)
}

/** Drag step / sensitivity for number fields, from the def or the magnitude of the value. */
export function numberStepFor(def: ParamDef, value: number): { step: number; sensitivity: number } {
  if (def.step !== undefined && def.step > 0) return { step: def.step, sensitivity: def.step / 2 }
  if (def.type === 'integer') return { step: 1, sensitivity: 0.5 }
  const abs = Math.abs(value)
  if (abs >= 10) return { step: 1, sensitivity: 0.5 }
  if (abs > 0 && abs < 0.1) return { step: 0.01, sensitivity: 0.005 }
  return { step: 0.1, sensitivity: 0.05 }
}

/** Number shown for a numeric def: value, else default, else 0. */
export function numericOr(value: unknown, fallback: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback
  return 0
}

/** True when a stored number lies outside the def's min/max hint (display only, never enforced). */
export function outsideHint(def: ParamDef, value: number): boolean {
  return (def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)
}
