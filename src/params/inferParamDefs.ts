import type { ParamDef } from '@/types/paramSchema'
import { labelFromKey } from './paramValue'

function isNumArray(v: unknown, len?: number): v is number[] {
  return Array.isArray(v) && (len === undefined || v.length === len) && v.every((x) => typeof x === 'number')
}

/** `threatIds`-style key holding a list of strings. */
export function isIdList(key: string, value: unknown): value is string[] {
  return /(^|[a-z])Ids$/.test(key) && Array.isArray(value) && value.every((x) => typeof x === 'string')
}

/** Infer a def for one current value (type, default = the value). */
export function inferParamDef(key: string, value: unknown): ParamDef {
  const base = { key, label: labelFromKey(key), default: value }
  if (typeof value === 'boolean') return { ...base, type: 'boolean' }
  if (typeof value === 'number') return { ...base, type: 'number' }
  if (typeof value === 'string') {
    if (/(^|[a-z])Id$/.test(key) || key === 'id') return { ...base, type: 'entityId' }
    if (/^#[0-9a-f]{6}$/i.test(value) && /colou?r/i.test(key)) return { ...base, type: 'color' }
    return { ...base, type: 'string' }
  }
  if (isNumArray(value, 2)) return { ...base, type: 'vec2' }
  if (isNumArray(value, 3)) return { ...base, type: 'vec3' }
  if (isNumArray(value)) return { ...base, type: 'numberList' }
  return { ...base, type: 'json' }
}

/**
 * Defs for every key of `values` that `declared` does not cover; inferred ones get group `Other` when
 * there are declared defs. Declared defs keep their order and come first. Nothing is dropped:
 * unknown value shapes become `json`.
 */
export function mergeDeclaredAndInferred(
  declared: ParamDef[],
  values: Record<string, unknown>,
  inferredGroup = 'Other',
): ParamDef[] {
  const covered = new Set(declared.map((d) => d.key.split('.')[0]!))
  const extra: ParamDef[] = []
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || covered.has(key)) continue
    const def = inferParamDef(key, value)
    if (declared.length > 0) def.group = inferredGroup
    extra.push(def)
  }
  return [...declared, ...extra]
}
