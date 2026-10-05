/**
 * One tunable parameter of a pipe (`TransformerPipe.paramDefs`) or of a transformer stage
 * (preset registry, `@params` block in custom stage code, or inferred from current values).
 * `min` / `max` are UI hints only (drag range): typed or stored values are never clamped or rejected.
 */
export type ParamType =
  | 'number'
  | 'integer'
  | 'string'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'entityId'
  | 'vec2'
  | 'vec3'
  | 'numberList'
  | 'json'

export const PARAM_TYPES: readonly ParamType[] = [
  'number',
  'integer',
  'string',
  'boolean',
  'enum',
  'color',
  'entityId',
  'vec2',
  'vec3',
  'numberList',
  'json',
]

export interface ParamEnumOption {
  value: string | number
  label?: string
}

export interface ParamDef {
  key: string
  label?: string
  type: ParamType
  default?: unknown
  description?: string
  /** Section heading in the form; defs without a group come first. */
  group?: string
  /** Drag hint only, never enforced. */
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: ParamEnumOption[]
  /** Collapsed under "Advanced" by default. */
  advanced?: boolean
}
