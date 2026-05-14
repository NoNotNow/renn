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
import type { Entity } from '@/types/world'
import { clamp as clampImpl } from '@/utils/numberUtils'
import {
  getForwardVectorFromEuler,
  getUpVectorFromEuler,
  eulerDeltaAroundAxis as eulerDeltaAroundAxisImpl,
} from '@/utils/rotationUtils'
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
import { publishVariableValue, VARIABLE_OVERLAY_MAX_INDEX } from '@/runtime/variableOverlayBridge'
import { publishCoordinateValue } from '@/runtime/coordinateOverlayBridge'

let _customCodeVisualizeEntityId: string | null = null

let _transformerRuntimeGetEntity: ((id: string) => Entity | undefined) | null = null

let _transformerRuntimeGetLivePosition: ((id: string) => Vec3 | null) | null = null

/**
 * During {@link RenderItemRegistry.executeTransformers}, resolves ids to live {@link Entity}
 * documents on render items. Cleared to null outside that scope; custom code then sees
 * `api.getEntity` as always undefined.
 */
export function setTransformerRuntimeEntityLookup(fn: ((id: string) => Entity | undefined) | null): void {
  _transformerRuntimeGetEntity = fn
}

/**
 * Same scope as {@link setTransformerRuntimeEntityLookup}; backs {@link TransformerRuntimeEntity.getLivePosition}
 * (registry physics cache / mesh). Cleared outside transformer execution.
 */
export function setTransformerRuntimeLivePositionLookup(fn: ((id: string) => Vec3 | null) | null): void {
  _transformerRuntimeGetLivePosition = fn
}

/** Shallow copy of the persisted entity plus live pose helper (see `api.getEntity`). */
export type TransformerRuntimeEntity = Entity & {
  /** Current world position from physics cache or mesh; null when hook unwired or pose unavailable. */
  getLivePosition(): Vec3 | null
}

function wrapEntityForTransformerRuntime(entity: Entity): TransformerRuntimeEntity {
  const id = entity.id
  return {
    ...entity,
    getLivePosition(): Vec3 | null {
      return _transformerRuntimeGetLivePosition?.(id) ?? null
    },
  }
}

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

function describeGot(x: unknown): string {
  if (x === undefined) return 'undefined'
  if (x === null) return 'null'
  if (typeof x === 'number') {
    return Number.isFinite(x) ? `number (${x})` : 'number (non-finite)'
  }
  if (typeof x === 'string') {
    const j = JSON.stringify(x)
    return j.length <= 52 ? `string (${j})` : `string (${JSON.stringify(x.slice(0, 40))}…)`
  }
  if (Array.isArray(x)) return `array(length ${x.length})`
  if (typeof x === 'object') return 'object'
  return String(x)
}

function throwApiError(scope: string, detail: string): never {
  throw new Error(`[${scope}] ${detail}`)
}

function requireRotation(scope: string, param: string, raw: unknown): Rotation {
  const r = readRotation(raw)
  if (!r) {
    throwApiError(scope, `expected ${param}: [rx, ry, rz] (radians), got: ${describeGot(raw)}`)
  }
  return r
}

function requireVec3(scope: string, param: string, raw: unknown): Vec3 {
  const v = readVec3(raw)
  if (!v) {
    throwApiError(scope, `expected ${param}: [x, y, z], got: ${describeGot(raw)}`)
  }
  return v
}

function requireFiniteNumber(scope: string, param: string, raw: unknown): number {
  if (!isFiniteNum(raw)) {
    throwApiError(scope, `expected ${param}: finite number, got: ${describeGot(raw)}`)
  }
  return raw
}

function requireStringParam(scope: string, param: string, raw: unknown): string {
  if (typeof raw !== 'string') {
    throwApiError(scope, `expected ${param}: string, got: ${describeGot(raw)}`)
  }
  return raw
}

function requireEntityId(scope: string, raw: unknown): string {
  return requireStringParam(scope, 'id', raw)
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
  /**
   * Builder visualize mode only: draws a line from the entity to the given world-space coordinate.
   * No-op in Play mode, tests, or when visualize gizmo mode is inactive.
   */
  visualizeCoordinate(coordinate: Vec3, color: string): void
  /**
   * Current world position from physics cache or mesh (same as {@link RenderItemRegistry.getPosition} during transformer execution).
   * Null when id is unknown, pose unavailable, or live-position hook is unwired. Prefer over {@link getEntity} in hot paths (no entity snapshot object).
   */
  getWorldPosition(id: string): Vec3 | null
  /**
   * Persisted spawn position from world JSON (`entity.position`) for the id. Independent of live physics; may lag moving bodies.
   * Null when entity lookup is unwired, entity missing, or `position` absent/invalid.
   */
  getStartPosition(id: string): Vec3 | null
  /**
   * Shallow copy of the persisted entity fields plus {@link TransformerRuntimeEntity.getLivePosition}.
   * Undefined when id is unknown or entity lookup is unwired.
   */
  getEntity(id: string): TransformerRuntimeEntity | undefined
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
  getForwardVector: (rotation: Rotation): Vec3 => {
    const r = requireRotation('TransformerRuntimeApi.vec.getForwardVector', 'rotation', rotation)
    return vecGetForwardVector(r)
  },
  getUpVector: (rotation: Rotation): Vec3 => {
    const r = requireRotation('TransformerRuntimeApi.vec.getUpVector', 'rotation', rotation)
    return vecGetUpVector(r)
  },
  dot: (a: Vec3, b: Vec3): number => {
    const av = requireVec3('TransformerRuntimeApi.vec.dot', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.vec.dot', 'b', b)
    return dotVec3(av, bv)
  },
  length: (v: Vec3): number => {
    const vv = requireVec3('TransformerRuntimeApi.vec.length', 'v', v)
    return vec3Length(vv)
  },
  add: (a: Vec3, b: Vec3): Vec3 => {
    const av = requireVec3('TransformerRuntimeApi.vec.add', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.vec.add', 'b', b)
    return addVec3Impl(av, bv)
  },
  scale: (v: Vec3, s: number): Vec3 => {
    const vv = requireVec3('TransformerRuntimeApi.vec.scale', 'v', v)
    const ss = requireFiniteNumber('TransformerRuntimeApi.vec.scale', 's', s)
    return scaleVec3Util(vv, ss)
  },
  getForwardSpeed: (velocity: Vec3, forward: Vec3): number => {
    const vel = requireVec3('TransformerRuntimeApi.vec.getForwardSpeed', 'velocity', velocity)
    const fwd = requireVec3('TransformerRuntimeApi.vec.getForwardSpeed', 'forward', forward)
    return getForwardSpeedUtil(vel, fwd)
  },
})

function eulerDeltaAroundAxisApi(currentRotation: Rotation, axis: Vec3, angleRad: number): Rotation {
  const rot = requireRotation('TransformerRuntimeApi.eulerDeltaAroundAxis', 'currentRotation', currentRotation)
  const ax = requireVec3('TransformerRuntimeApi.eulerDeltaAroundAxis', 'axis', axis)
  const ang = requireFiniteNumber('TransformerRuntimeApi.eulerDeltaAroundAxis', 'angleRad', angleRad)
  return eulerDeltaAroundAxisImpl(rot, ax, ang)
}

function clampApi(value: number, min: number, max: number): number {
  const v = requireFiniteNumber('TransformerRuntimeApi.clamp', 'value', value)
  const lo = requireFiniteNumber('TransformerRuntimeApi.clamp', 'min', min)
  const hi = requireFiniteNumber('TransformerRuntimeApi.clamp', 'max', max)
  return clampImpl(v, lo, hi)
}

function getActionApi(input: TransformInput, name: string): number {
  if (input === null || input === undefined) {
    throwApiError(
      'TransformerRuntimeApi.getAction',
      `expected input: TransformInput object, got: ${describeGot(input)}`,
    )
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throwApiError(
      'TransformerRuntimeApi.getAction',
      `expected input: TransformInput object, got: ${describeGot(input)}`,
    )
  }
  if (typeof name !== 'string') {
    throwApiError('TransformerRuntimeApi.getAction', `expected name: string, got: ${describeGot(name)}`)
  }
  const rawActions = (input as { actions?: unknown }).actions
  if (rawActions !== undefined && rawActions !== null) {
    if (typeof rawActions !== 'object' || Array.isArray(rawActions)) {
      throwApiError(
        'TransformerRuntimeApi.getAction',
        `expected input.actions: Record<string, number>, got: ${describeGot(rawActions)}`,
      )
    }
  }
  const actions =
    rawActions != null && typeof rawActions === 'object' && !Array.isArray(rawActions)
      ? (rawActions as Record<string, number>)
      : {}
  return actions[name] ?? 0
}

export const TRANSFORMER_RUNTIME_API: TransformerRuntimeApi = Object.freeze({
  getAction: getActionApi,
  getForwardVector: (rotation): Vec3 => {
    const r = requireRotation('TransformerRuntimeApi.getForwardVector', 'rotation', rotation)
    return vecGetForwardVector(r)
  },
  getUpVector: (rotation): Vec3 => {
    const r = requireRotation('TransformerRuntimeApi.getUpVector', 'rotation', rotation)
    return vecGetUpVector(r)
  },
  addVec3: (a, b): Vec3 => {
    const av = requireVec3('TransformerRuntimeApi.addVec3', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.addVec3', 'b', b)
    return addVec3Impl(av, bv)
  },
  scaleVec3: (v, s): Vec3 => {
    const vv = requireVec3('TransformerRuntimeApi.scaleVec3', 'v', v)
    const ss = requireFiniteNumber('TransformerRuntimeApi.scaleVec3', 's', s)
    return scaleVec3Util(vv, ss)
  },
  vec: VEC_API,
  clamp: clampApi,
  eulerDeltaAroundAxis: eulerDeltaAroundAxisApi,
  log: (message: string, durationSeconds = 4): void => {
    if (typeof message !== 'string') {
      throwApiError('TransformerRuntimeApi.log', `expected message: string, got: ${describeGot(message)}`)
    }
    requireFiniteNumber('TransformerRuntimeApi.log', 'durationSeconds', durationSeconds)
    if (durationSeconds < 0) {
      throwApiError(
        'TransformerRuntimeApi.log',
        `expected durationSeconds: finite number >= 0, got: ${describeGot(durationSeconds)}`,
      )
    }
    _snackbarFn?.(message, durationSeconds)
  },
  visualize: (value: number, color: string, name: string, index: number): void => {
    requireFiniteNumber('TransformerRuntimeApi.visualize', 'value', value)
    requireStringParam('TransformerRuntimeApi.visualize', 'color', color)
    requireStringParam('TransformerRuntimeApi.visualize', 'name', name)
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > VARIABLE_OVERLAY_MAX_INDEX
    ) {
      throwApiError(
        'TransformerRuntimeApi.visualize',
        `expected index: integer 1–${VARIABLE_OVERLAY_MAX_INDEX}, got: ${describeGot(index)}`,
      )
    }
    const id = _customCodeVisualizeEntityId
    if (id == null) return
    publishVariableValue(id, value, color, name, index)
  },
  visualizeCoordinate: (coordinate: Vec3, color: string): void => {
    const coord = requireVec3('TransformerRuntimeApi.visualizeCoordinate', 'coordinate', coordinate)
    requireStringParam('TransformerRuntimeApi.visualizeCoordinate', 'color', color)
    const id = _customCodeVisualizeEntityId
    if (id == null) return
    publishCoordinateValue(id, coord, color)
  },
  getWorldPosition: (id: string): Vec3 | null => {
    requireEntityId('TransformerRuntimeApi.getWorldPosition', id)
    return _transformerRuntimeGetLivePosition?.(id) ?? null
  },
  getStartPosition: (id: string): Vec3 | null => {
    requireEntityId('TransformerRuntimeApi.getStartPosition', id)
    const entity = _transformerRuntimeGetEntity?.(id)
    if (!entity) return null
    const p = readVec3(entity.position)
    return p ? cloneVec3Tuple(p) : null
  },
  getEntity: (id: string): TransformerRuntimeEntity | undefined => {
    requireEntityId('TransformerRuntimeApi.getEntity', id)
    const entity = _transformerRuntimeGetEntity?.(id)
    return entity ? wrapEntityForTransformerRuntime(entity) : undefined
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
  private readonly authoringCode: string
  private readonly transformFn: CustomTransformFn

  constructor(config: TransformerConfig) {
    const priority = config.priority ?? 10
    const enabled = config.enabled ?? true
    this.priority = priority
    this.enabled = enabled
    this.liveParams = { ...(config.params ?? {}) }
    const code = typeof config.code === 'string' ? config.code : ''
    this.authoringCode = code
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
    const stack =
      e instanceof Error && typeof e.stack === 'string' && e.stack.trim() !== ''
        ? e.stack
        : undefined
    publishCustomTransformerRuntimeError({
      entityId,
      configStackIndex: idx,
      message,
      stack,
      code: this.authoringCode,
    })
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
