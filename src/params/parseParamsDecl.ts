import { PARAM_TYPES, type ParamDef, type ParamType } from '@/types/paramSchema'

export interface ParamsDeclResult {
  defs: ParamDef[]
  /** Human-readable problems (bad JSON, unknown type, duplicate key ...); valid defs are still returned. */
  errors: string[]
}

/** Only the first block comment of a stage counts (after optional leading line comments) and must start with `@params`. */
const FIRST_BLOCK = /^\s*(?:\/\/[^\n]*\n\s*)*\/\*+\s*@params\b([\s\S]*?)\*\//

function cleanDef(raw: unknown, index: number, errors: string[]): ParamDef | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`@params[${index}] is not an object`)
    return null
  }
  const r = raw as Record<string, unknown>
  if (typeof r.key !== 'string' || r.key.length === 0) {
    errors.push(`@params[${index}] has no key`)
    return null
  }
  if (typeof r.type !== 'string' || !PARAM_TYPES.includes(r.type as ParamType)) {
    errors.push(`@params "${r.key}": unknown type ${JSON.stringify(r.type)}`)
    return null
  }
  const def: ParamDef = { key: r.key, type: r.type as ParamType }
  for (const k of ['label', 'description', 'group', 'unit'] as const) {
    if (typeof r[k] === 'string') def[k] = r[k]
  }
  for (const k of ['min', 'max', 'step'] as const) {
    const n = r[k]
    if (typeof n === 'number' && Number.isFinite(n)) def[k] = n
  }
  if ('default' in r) def.default = r.default
  if (r.advanced === true) def.advanced = true
  if (Array.isArray(r.options)) {
    const options: NonNullable<ParamDef['options']> = []
    for (const o of r.options as unknown[]) {
      if (typeof o === 'string' || typeof o === 'number') options.push({ value: o })
      else if (o && typeof o === 'object' && 'value' in o) {
        const ov = o as { value: string | number; label?: string }
        options.push(ov.label !== undefined ? { value: ov.value, label: ov.label } : { value: ov.value })
      }
    }
    def.options = options
  }
  if (def.type === 'enum' && !def.options?.length) {
    errors.push(`@params "${def.key}": enum needs options`)
    return null
  }
  return def
}

/** Parse the `@params` JSON array declared in the first block comment of a custom stage's source. */
export function parseParamsDecl(code: string | undefined): ParamsDeclResult {
  if (!code) return { defs: [], errors: [] }
  const m = FIRST_BLOCK.exec(code)
  if (!m) return { defs: [], errors: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1]!.replace(/^\s*\*/gm, ''))
  } catch (e) {
    return { defs: [], errors: [`@params is not valid JSON: ${(e as Error).message}`] }
  }
  if (!Array.isArray(parsed)) return { defs: [], errors: ['@params must be a JSON array'] }
  const errors: string[] = []
  const defs: ParamDef[] = []
  const seen = new Set<string>()
  parsed.forEach((raw, i) => {
    const def = cleanDef(raw, i, errors)
    if (!def) return
    if (seen.has(def.key)) {
      errors.push(`@params: duplicate key "${def.key}"`)
      return
    }
    seen.add(def.key)
    defs.push(def)
  })
  return { defs, errors }
}
