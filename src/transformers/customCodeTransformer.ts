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
import {
  dotVec3,
  getForwardSpeed as getForwardSpeedUtil,
  scaleVec3 as scaleVec3Util,
  vec3Length,
} from '@/utils/vec3'
import {
  clearCustomTransformerRuntimeErrorForTarget,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import { publishVariableValue } from '@/runtime/variableOverlayBridge'

let _customCodeVisualizeEntityId: string | null = null

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

/** Vector math exposed as `api.vec.*` (tuple `[x,y,z]`); flat `addVec3` / `scaleVec3` are the same as `vec.add` / `vec.scale`; flat `getForwardVector` / `getUpVector` match `vec.getForwardVector` / `vec.getUpVector`. */
export interface TransformerVecApi {
  /** Unit forward (-Z facing) from Euler. */
  getForwardVector(rotation: Rotation): Vec3
  /** Unit world up (+Y) from Euler. */
  getUpVector(rotation: Rotation): Vec3
  dot(a: Vec3, b: Vec3): number
  length(v: Vec3): number
  add(a: Vec3, b: Vec3): Vec3
  scale(v: Vec3, s: number): Vec3
  /** Scalar speed along `forward` (unnormalized forward scales the projection). Prefer a unit forward from getForwardVector. */
  getForwardSpeed(velocity: Vec3, forward: Vec3): number
}

/** Frozen singleton passed as the fifth argument to compiled custom transformer functions. */
export interface TransformerRuntimeApi {
  getAction(input: TransformInput, name: string): number
  /** Same as `api.vec.getForwardVector`. */
  getForwardVector(rotation: Rotation): Vec3
  /** Same as `api.vec.getUpVector`. */
  getUpVector(rotation: Rotation): Vec3
  /** Same as `api.vec.add`. */
  addVec3(a: Vec3, b: Vec3): Vec3
  /** Same as `api.vec.scale`. */
  scaleVec3(v: Vec3, s: number): Vec3
  vec: TransformerVecApi
  clamp(value: number, min: number, max: number): number
  eulerDeltaAroundAxis(currentRotation: Rotation, axis: Vec3, angleRad: number): Rotation
  /** Show a message in the play-mode snackbar. durationSeconds defaults to 4. No-op in tests unless wired via setTransformerSnackbarFn. */
  log(message: string, durationSeconds?: number): void
  /**
   * Builder visualize mode only: records a numeric sample for the variable overlay when the bridge is wired.
   * No-op in Play mode, tests, or when visualize gizmo mode is inactive.
   */
  visualize(value: number, color: string, name: string, index: number): void
}

type SnackbarFn = (message: string, durationSeconds: number) => void
let _snackbarFn: SnackbarFn | null = null

/** Wire the runtime snackbar for `api.log`. Call with `null` on teardown. */
export function setTransformerSnackbarFn(fn: SnackbarFn | null): void {
  _snackbarFn = fn
}

function addVec3Impl(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecGetForwardVector(rotation: Rotation): Vec3 {
  const v = getForwardVectorFromEuler(rotation)
  return [v[0], v[1], v[2]]
}

function vecGetUpVector(rotation: Rotation): Vec3 {
  const v = getUpVectorFromEuler(rotation)
  return [v[0], v[1], v[2]]
}

const VEC_API: TransformerVecApi = Object.freeze({
  getForwardVector: vecGetForwardVector,
  getUpVector: vecGetUpVector,
  dot: dotVec3,
  length: vec3Length,
  add: addVec3Impl,
  scale: (v: Vec3, s: number): Vec3 => scaleVec3Util(v, s),
  getForwardSpeed: getForwardSpeedUtil,
})

export const TRANSFORMER_RUNTIME_API: TransformerRuntimeApi = Object.freeze({
  getAction: (input: TransformInput, name: string): number => input.actions[name] ?? 0,
  getForwardVector: (rotation) => VEC_API.getForwardVector(rotation),
  getUpVector: (rotation) => VEC_API.getUpVector(rotation),
  addVec3: (a, b) => VEC_API.add(a, b),
  scaleVec3: (v, s) => VEC_API.scale(v, s),
  vec: VEC_API,
  clamp,
  eulerDeltaAroundAxis,
  log: (message: string, durationSeconds = 4): void => {
    _snackbarFn?.(String(message), durationSeconds)
  },
  visualize: (value: number, color: string, name: string, index: number): void => {
    const id = _customCodeVisualizeEntityId
    if (id == null) return
    publishVariableValue(id, value, color, name, index)
  },
} satisfies TransformerRuntimeApi)

type CustomTransformFn = (
  input: TransformInput,
  dt: number,
  params: Record<string, unknown>,
  state: Record<string, unknown>,
  api: TransformerRuntimeApi,
) => unknown

/**
 * Detects whether `source` defines a `function transform(...)`.
 * Allows leading comments/whitespace before the declaration.
 * Legacy code (bare return statements) falls back to body-wrapping for backward compat.
 */
function isFullFunctionSource(source: string): boolean {
  return /\bfunction\s+transform\s*\(/.test(source)
}

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

  const wrappedSource = isFullFunctionSource(source)
    ? `"use strict"; ${source} return transform;`
    : `"use strict"; return function(input, dt, params, state, api) { ${source} };`

  try {
    const factory = new Function(wrappedSource)
    return factory() as CustomTransformFn
  } catch (e) {
    throw new Error(`Failed to compile custom transformer "${configKey}": ${e}`)
  }
}

/** Authoring-time check: same rules as runtime construction; returns an error message or null if valid. */
export function validateCustomTransformerSource(source: string, configKey = 'custom'): string | null {
  try {
    compileCustomTransform(configKey, source)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export class CustomCodeTransformer implements Transformer {
  readonly type = 'custom' as const
  readonly priority: number
  enabled: boolean
  configStackIndex?: number
  runtimeEntityId?: string
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
    const prevVisualizeEntity = _customCodeVisualizeEntityId
    _customCodeVisualizeEntityId = this.runtimeEntityId ?? null
    try {
      const raw = this.transformFn(input, dt, this.liveParams, this.state, TRANSFORMER_RUNTIME_API)
      const out = sanitizeTransformOutput(raw)
      this.clearPublishedRuntimeErrorIfTargeted()
      return out
    } catch (e) {
      console.warn('[CustomCodeTransformer] Runtime error:', e)
      this.publishRuntimeError(e)
      return {}
    } finally {
      _customCodeVisualizeEntityId = prevVisualizeEntity
    }
  }

  private clearPublishedRuntimeErrorIfTargeted(): void {
    const entityId = this.runtimeEntityId
    const idx = this.configStackIndex
    if (entityId != null && typeof idx === 'number' && idx >= 0) {
      clearCustomTransformerRuntimeErrorForTarget(entityId, idx)
    }
  }

  private publishRuntimeError(e: unknown): void {
    const entityId = this.runtimeEntityId
    const idx = this.configStackIndex
    if (entityId == null || typeof idx !== 'number' || idx < 0) return
    const message = e instanceof Error ? e.message : String(e)
    publishCustomTransformerRuntimeError({ entityId, configStackIndex: idx, message })
  }
}

export function defaultCustomTransformerCode(): string {
  return `// ── Params shape (edit in the Params JSON field above) ───────────────────────
// { "power": 120 }

// JSDoc @type on each parameter below wires Monaco completions for transforms (otherwise parameters become implicit any).
// Example: use api.visualize(...) in Builder with the Visualize toolbar mode to plot live numbers.

/** @returns {TransformOutput | undefined} */
function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  const power = Number(params.power ?? 0);
  // Builder Visualize mode: plot every tick (no-op when overlay unwired). Must run before the touch gate so the bar updates without contact.
  api.visualize(power, '#48d9ff', 'power', 1);
  if (!input.environment.isTouchingObject || power === 0) return {};

  const forward = api.vec.getForwardVector(input.rotation);
  return { impulse: api.vec.scale(forward, power * dt) };
}`
}

export function effectiveCustomTransformerCode(config: TransformerConfig): string {
  return typeof config.code === 'string' && config.code.trim() !== '' ? config.code : defaultCustomTransformerCode()
}
