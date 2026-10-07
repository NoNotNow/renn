import type { PresetTransformerType } from '@/types/transformer'
import type { ParamDef } from '@/types/paramSchema'
import { TRANSFORMER_PARAMS_DOCS } from '@/transformers/transformerParamDocs'
import { getDefaultTransformerConfig } from '@/transformers/transformerPresets'

type Spec = Omit<ParamDef, 'description' | 'default'> & { default?: unknown }

/**
 * Typed schema of every preset transformer's `params`. Descriptions come from `TRANSFORMER_PARAMS_DOCS`
 * (single prose source) and defaults from the preset factory, so neither is repeated here.
 */
const SPECS: Record<PresetTransformerType, Spec[]> = {
  input: [],
  car2: [
    { key: 'power', type: 'number', min: 0, max: 2000, step: 10 },
    { key: 'steeringIntensity', type: 'number', min: 0, max: 1, step: 0.01, unit: 'rad/m' },
    { key: 'steeringSpeed', type: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'lateralGrip', type: 'number', min: 0, max: 1000, step: 5 },
    { key: 'lateralToForwardTransfer', type: 'number', min: 0, max: 1, step: 0.05, default: 0.2 },
    { key: 'tireGripSlipSpeedThreshold', type: 'number', min: 0, max: 50, step: 0.5, unit: 'm/s' },
    { key: 'lateralGripSlipScale', type: 'number', min: 0, max: 1, step: 0.05 },
    { key: 'jumpImpulse', type: 'number', min: 0, max: 2000, step: 10 },
  ],
  person: [
    { key: 'walkForce', type: 'number', min: 0, max: 1000, step: 10 },
    { key: 'runForce', type: 'number', min: 0, max: 1000, step: 10 },
    { key: 'maxWalkSpeed', type: 'number', min: 0, max: 30, unit: 'm/s' },
    { key: 'maxRunSpeed', type: 'number', min: 0, max: 60, unit: 'm/s' },
    { key: 'turnSpeed', type: 'number', min: 0, max: 20, unit: 'rad/s' },
  ],
  targetPoseInput: [
    { key: 'speed', type: 'number', min: 0, max: 50, unit: 'm/s' },
    {
      key: 'mode',
      type: 'enum',
      options: [
        { value: 'cycle', label: 'Cycle (loop)' },
        { value: 'pingPong', label: 'Ping-pong' },
        { value: 'stopAtEnd', label: 'Stop at end' },
      ],
    },
    { key: 'positionEpsilon', type: 'number', min: 0, step: 0.01, group: 'Tolerances', advanced: true },
    { key: 'rotationEpsilon', type: 'number', min: 0, step: 0.01, group: 'Tolerances', advanced: true },
    { key: 'poses', type: 'json', label: 'Waypoints (poses)', group: 'Path' },
  ],
  kinematicMovement: [{ key: 'maxRotationRate', type: 'number', min: 0, max: 50, unit: 'rad/s' }],
  wanderer: [
    { key: 'speed', type: 'number', min: 0, max: 50, unit: 'm/s' },
    { key: 'jumpDistance', type: 'number', min: 0, max: 200, unit: 'm' },
    { key: 'linear', type: 'boolean' },
    { key: 'angular', type: 'boolean' },
    { key: 'planar', type: 'boolean', default: false },
    { key: 'perimeter.center', type: 'vec3', label: 'Perimeter center', group: 'Perimeter' },
    { key: 'perimeter.halfExtents', type: 'vec3', label: 'Perimeter half extents', group: 'Perimeter' },
    { key: 'positionEpsilon', type: 'number', min: 0, step: 0.01, group: 'Tolerances', advanced: true },
    { key: 'rotationEpsilon', type: 'number', min: 0, step: 0.01, group: 'Tolerances', advanced: true },
  ],
  follow: [
    { key: 'targetEntityId', type: 'entityId', label: 'Target entity' },
    { key: 'speed', type: 'number', min: 0, max: 50, unit: 'm/s' },
    { key: 'linear', type: 'boolean' },
    { key: 'angular', type: 'boolean' },
    { key: 'leadTime', type: 'number', min: 0, max: 5, step: 0.05, unit: 's', default: 0 },
    { key: 'isFinal', type: 'boolean', default: true },
  ],
  custom: [],
}

/** Typed defs for a preset type (empty for `input` / `custom` / unknown types). */
export function presetParamDefs(type: string): ParamDef[] {
  const specs = SPECS[type as PresetTransformerType]
  if (!specs) return []
  const defaults = (getDefaultTransformerConfig(type as PresetTransformerType).params ?? {}) as Record<string, unknown>
  const docs = TRANSFORMER_PARAMS_DOCS[type as PresetTransformerType]
  return specs.map((s) => {
    const top = s.key.split('.')
    let dflt: unknown = defaults
    for (const part of top) dflt = dflt && typeof dflt === 'object' ? (dflt as Record<string, unknown>)[part] : undefined
    const def: ParamDef = { ...s }
    if ('default' in s) def.default = s.default
    else if (dflt !== undefined) def.default = dflt
    const doc = docs[s.key]
    if (doc) def.description = doc
    return def
  })
}
