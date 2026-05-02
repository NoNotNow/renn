/**
 * User-authored transformer compiled once from `TransformerConfig.code` (type `custom`).
 */
import type {
  TransformInput,
  TransformOutput,
  Transformer,
  TransformerConfig,
  Vec3,
  Rotation,
} from '@/types/transformer'
import { clamp } from '@/utils/numberUtils'
import { getForwardVectorFromEuler, getUpVectorFromEuler, eulerDeltaAroundAxis } from '@/utils/rotationUtils'
import { scaleVec3 as scaleVec3Util } from '@/utils/vec3'

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function cloneVec3Tuple(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]]
}

function readVec3(raw: unknown): Vec3 | undefined {
  if (!Array.isArray(raw) || raw.length !== 3) return undefined
  const a = raw[0]
  const b = raw[1]
  const c = raw[2]
  if (!isFiniteNum(a) || !isFiniteNum(b) || !isFiniteNum(c)) return undefined
  return [a, b, c]
}

function readRotation(raw: unknown): Rotation | undefined {
  const o = raw as Rotation | undefined
  const v = readVec3(o ?? null)
  return v ?? undefined
}

function readSetPose(raw: unknown): TransformOutput['setPose'] | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const po = raw as { position?: unknown; rotation?: unknown }
  const position = readVec3(po.position)
  const rotation = readRotation(po.rotation)
  if (!position || !rotation) return undefined
  return { position, rotation }
}

function sanitizeTransformOutput(raw: unknown): TransformOutput {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object') return {}

  const o = raw as Record<string, unknown>
  const next: TransformOutput = {}

  const force = readVec3(o.force)
  const impulse = readVec3(o.impulse)
  const torque = readVec3(o.torque)
  const color = readVec3(o.color)
  if (force) next.force = cloneVec3Tuple(force)
  if (impulse) next.impulse = cloneVec3Tuple(impulse)
  if (torque) next.torque = cloneVec3Tuple(torque)
  if (color) next.color = cloneVec3Tuple(color)

  if (typeof o.addRotation === 'undefined') {
    /* leave unset */
  } else if (o.addRotation === null) {
    next.addRotation = null
  } else {
    const r = readRotation(o.addRotation)
    if (r) next.addRotation = cloneVec3Tuple(r)
  }

  const setPose = readSetPose(o.setPose)
  if (setPose) next.setPose = setPose

  if (typeof o.earlyExit === 'boolean') {
    next.earlyExit = o.earlyExit
  }

  if (
    !next.force &&
    !next.impulse &&
    !next.torque &&
    next.color === undefined &&
    next.addRotation === undefined &&
    !next.setPose &&
    !next.earlyExit
  ) {
    return {}
  }

  return next
}

/** Frozen singleton passed as the fifth argument to compiled custom transformer bodies. */
export interface TransformerRuntimeApi {
  getAction(input: TransformInput, name: string): number
  getForwardVector(rotation: Rotation): Vec3
  getUpVector(rotation: Rotation): Vec3
  addVec3(a: Vec3, b: Vec3): Vec3
  scaleVec3(v: Vec3, s: number): Vec3
  clamp(value: number, min: number, max: number): number
  eulerDeltaAroundAxis(currentRotation: Rotation, axis: Vec3, angleRad: number): Rotation
}

function addVec3Impl(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export const TRANSFORMER_RUNTIME_API: TransformerRuntimeApi = Object.freeze({
  getAction: (input: TransformInput, name: string): number => input.actions[name] ?? 0,
  getForwardVector: (rotation: Rotation): Vec3 => {
    const v = getForwardVectorFromEuler(rotation)
    return [v[0], v[1], v[2]]
  },
  getUpVector: (rotation: Rotation): Vec3 => {
    const v = getUpVectorFromEuler(rotation)
    return [v[0], v[1], v[2]]
  },
  addVec3: addVec3Impl,
  scaleVec3: (v: Vec3, s: number): Vec3 => scaleVec3Util(v, s),
  clamp,
  eulerDeltaAroundAxis,
} satisfies TransformerRuntimeApi)

type CustomTransformFn = (
  input: TransformInput,
  dt: number,
  params: Record<string, unknown>,
  state: Record<string, unknown>,
  api: TransformerRuntimeApi,
) => unknown

function compileCustomTransform(configKey: string, source: string): CustomTransformFn {
  const dangerousPatterns = [
    /eval\s*\(/,
    /Function\s*\(/,
    /import\s*\(/,
    /require\s*\(/,
    /__proto__/,
    /constructor\s*\[/,
  ]
  for (const pattern of dangerousPatterns) {
    if (pattern.test(source)) {
      throw new Error(`Custom transformer "${configKey}" contains potentially dangerous pattern: ${pattern}`)
    }
  }
  const wrappedSource = `
      "use strict";
      return function(input, dt, params, state, api) {
        ${source}
      };
    `
  try {
    const factory = new Function(wrappedSource)
    return factory() as CustomTransformFn
  } catch (e) {
    throw new Error(`Failed to compile custom transformer "${configKey}": ${e}`)
  }
}

export class CustomCodeTransformer implements Transformer {
  readonly type = 'custom' as const
  readonly priority: number
  enabled: boolean
  private readonly liveParams: Record<string, unknown>
  private readonly state: Record<string, unknown> = {}
  private readonly transformFn: CustomTransformFn

  constructor(config: TransformerConfig) {
    const priority = config.priority ?? 10
    const enabled = config.enabled ?? true
    this.priority = priority
    this.enabled = enabled
    this.liveParams = { ...(config.params ?? {}) }
    const code = typeof config.code === 'string' ? config.code : ''
    this.transformFn = compileCustomTransform(`custom:p${priority}`, code)
  }

  setParams(patch: Record<string, unknown>): void {
    Object.assign(this.liveParams, patch)
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    try {
      const raw = this.transformFn(input, dt, this.liveParams, this.state, TRANSFORMER_RUNTIME_API)
      return sanitizeTransformOutput(raw)
    } catch (e) {
      console.warn('[CustomCodeTransformer] Runtime error:', e)
      return {}
    }
  }
}

export function defaultCustomTransformerCode(): string {
  return `// params (JSON) and api helpers — use the car2 preset in the stack for full vehicle behavior.
const power = Number(params.power ?? 0);
if (!input.environment.isTouchingObject || power === 0) return {};

const forward = api.getForwardVector(input.rotation);
return { impulse: api.scaleVec3(forward, power * dt) };`
}

export function effectiveCustomTransformerCode(config: TransformerConfig): string {
  return typeof config.code === 'string' && config.code.trim() !== '' ? config.code : defaultCustomTransformerCode()
}
