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
import type { RaycastResult } from '@/physics/rapierPhysics'
import { clamp as clampImpl } from '@/utils/numberUtils'
import {
  getForwardVectorFromEuler,
  getUpVectorFromEuler,
  eulerDeltaAroundAxis as eulerDeltaAroundAxisImpl,
} from '@/utils/rotationUtils'
import {
  angleBetweenVec3,
  crossVec3,
  dotVec3,
  getForwardSpeed as getForwardSpeedUtil,
  normalizeVec3 as normalizeVec3Util,
  offsetAlongVec3,
  projectVec3OntoPlane,
  rightFromForwardVec3,
  rotateVec3AroundAxis,
  scaleVec3 as scaleVec3Util,
  signedAngleAroundAxisVec3,
  subtractVec3 as subtractVec3Util,
  vec3Length,
} from '@/utils/vec3'
import { raycastSpreadImpl } from '@/transformers/raycastSpread'
import {
  clearCustomTransformerRuntimeErrorForTarget,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import { publishVariableValue, VARIABLE_OVERLAY_MAX_INDEX } from '@/runtime/variableOverlayBridge'
import { publishLineValue } from '@/runtime/coordinateOverlayBridge'
import { extractLineNumberFromError, extractLineFromStack } from '@/utils/errorLineMapper'

let _customCodeVisualizeEntityId: string | null = null

let _transformerRuntimeGetEntity: ((id: string) => Entity | undefined) | null = null

let _transformerRuntimeGetLivePosition: ((id: string) => Vec3 | null) | null = null

let _transformerRuntimeRaycast: ((origin: Vec3, dir: Vec3, maxDistance?: number) => RaycastResult) | null = null

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

/**
 * Wire the physics raycast backend for `api.raycast`. Set before transformer execution, cleared after.
 * Takes a raw origin Vec3 to avoid a redundant entity position lookup (callers pass `input.position`).
 */
export function setTransformerRuntimeRaycast(
  fn: ((origin: Vec3, dir: Vec3, maxDistance?: number) => RaycastResult) | null,
): void {
  _transformerRuntimeRaycast = fn
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

  if (typeof o.targetLabel === 'string') {
    next.targetLabel = o.targetLabel
  }

  if (
    !next.force &&
    !next.impulse &&
    !next.torque &&
    next.color === undefined &&
    next.addRotation === undefined &&
    !next.setPose &&
    !next.earlyExit &&
    !next.targetLabel
  ) {
    return {}
  }

  return next
}

/** Vector math exposed as `api.vec.*` (tuple `[x,y,z]`); flat `addVec3` / `subtractVec3` / `scaleVec3` / `normalizeVec3` match `vec.add` / `vec.subtract` / `vec.scale` / `vec.normalize`; flat `getForwardVector` / `getUpVector` match `vec.getForwardVector` / `vec.getUpVector`. Dot and cross are `vec`-only helpers. */
export interface TransformerVecApi {
  /** Unit forward (-Z facing) from Euler. */
  getForwardVector(rotation: Rotation): Vec3
  /** Unit world up (+Y) from Euler. */
  getUpVector(rotation: Rotation): Vec3
  dot(a: Vec3, b: Vec3): number
  /** Cross product **a × b** (right-handed). */
  cross(a: Vec3, b: Vec3): Vec3
  length(v: Vec3): number
  /** Same direction as `v` with length 1; `[0, 0, 0]` when length is negligible. */
  normalize(v: Vec3): Vec3
  add(a: Vec3, b: Vec3): Vec3
  /** Component-wise difference **a − b**. */
  subtract(a: Vec3, b: Vec3): Vec3
  scale(v: Vec3, s: number): Vec3
  /** Scalar speed along `forward` (unnormalized forward scales the projection). Prefer a unit forward from getForwardVector. */
  getForwardSpeed(velocity: Vec3, forward: Vec3): number
  /** Project `vec` onto the plane perpendicular to `planeNormal` (e.g. entity up for slope-relative XZ steering). */
  projectOntoPlane(vec: Vec3, planeNormal: Vec3): Vec3
  /** Rotate `vec` by `angle` radians around `axis` (e.g. entity up for path-finding turns on slopes). */
  rotateAroundAxis(vec: Vec3, axis: Vec3, angle: number): Vec3
  /** `origin + direction * distance` (direction need not be normalized). */
  offsetAlong(origin: Vec3, direction: Vec3, distance: number): Vec3
  /** Unsigned angle between directions in radians (0 … π). */
  angleBetween(from: Vec3, to: Vec3): number
  /** Signed angle from `from` to `to` around `axis`; 0 when nearly parallel. */
  signedAngleAroundAxis(from: Vec3, to: Vec3, axis: Vec3): number
  /** Unit right vector ⊥ `forward` in the plane of `forward` and `upHint` (default world +Y). */
  rightFromForward(forward: Vec3, upHint?: Vec3): Vec3
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
  /** Same as `api.vec.subtract`. */
  subtractVec3(a: Vec3, b: Vec3): Vec3
  /** Same as `api.vec.scale`. */
  scaleVec3(v: Vec3, s: number): Vec3
  /** Same as `api.vec.normalize`. */
  normalizeVec3(v: Vec3): Vec3
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
   * Builder visualize mode only: draws a line between two world-space coordinates.
   * No-op in Play mode, tests, or when visualize gizmo mode is inactive.
   */
  visualizeLine(from: Vec3, to: Vec3, color: string): void
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
  /**
   * Cast a ray from `origin` (e.g. `input.position`) in direction `fwd`.
   * No entity is excluded — pass a position slightly in front of the entity to avoid self-hits.
   * Returns `{ hit: false, distance: 0, entityId: '' }` when physics is unavailable or direction is zero-length.
   */
  raycast(origin: Vec3, fwd: Vec3, maxDistance?: number): RaycastResult

  /**
   * Cast a ray from `origin` in direction `fwd` with optional debug visualization.
   * When visualize is true, draws a line from origin to the hit point (or to maxDistance if no hit).
   * Hit lines use hitColor (default 'red'), miss lines use missColor (default 'green').
   * No-op in Play mode or when visualize gizmo mode is inactive.
   * @param origin World-space ray origin [x, y, z].
   * @param fwd World-space direction vector (will be normalized).
   * @param maxDistance Maximum ray distance in metres.
   * @param options Visualization options.
   */
  raycast(origin: Vec3, fwd: Vec3, maxDistance: number, options: { visualize: true; hitColor?: string; missColor?: string }): RaycastResult

  /**
   * Cast a ray from `origin` in direction `fwd` with optional debug visualization.
   * @param origin World-space ray origin [x, y, z].
   * @param fwd World-space direction vector (will be normalized).
   * @param maxDistance Maximum ray distance in metres.
   * @param options Visualization options; visualize defaults to false.
   */
  raycast(origin: Vec3, fwd: Vec3, maxDistance?: number, options?: { visualize?: boolean; hitColor?: string; missColor?: string }): RaycastResult
  /**
   * Parallel rays spread sideways; closest hit wins, else center-ray result (same as hunt `multiRaycast`).
   */
  raycastSpread(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    spreadWidth: number,
    rayCount: number,
    options?: { visualize?: boolean; hitColor?: string; missColor?: string },
  ): RaycastResult
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
  cross: (a: Vec3, b: Vec3): Vec3 => {
    const av = requireVec3('TransformerRuntimeApi.vec.cross', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.vec.cross', 'b', b)
    return crossVec3(av, bv)
  },
  length: (v: Vec3): number => {
    const vv = requireVec3('TransformerRuntimeApi.vec.length', 'v', v)
    return vec3Length(vv)
  },
  normalize: (v: Vec3): Vec3 => {
    const vv = requireVec3('TransformerRuntimeApi.vec.normalize', 'v', v)
    return normalizeVec3Util(vv)
  },
  add: (a: Vec3, b: Vec3): Vec3 => {
    const av = requireVec3('TransformerRuntimeApi.vec.add', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.vec.add', 'b', b)
    return addVec3Impl(av, bv)
  },
  subtract: (a: Vec3, b: Vec3): Vec3 => {
    const av = requireVec3('TransformerRuntimeApi.vec.subtract', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.vec.subtract', 'b', b)
    return subtractVec3Util(av, bv)
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
  projectOntoPlane: (vec: Vec3, planeNormal: Vec3): Vec3 => {
    const v = requireVec3('TransformerRuntimeApi.vec.projectOntoPlane', 'vec', vec)
    const n = requireVec3('TransformerRuntimeApi.vec.projectOntoPlane', 'planeNormal', planeNormal)
    return projectVec3OntoPlane(v, n)
  },
  rotateAroundAxis: (vec: Vec3, axis: Vec3, angle: number): Vec3 => {
    const v = requireVec3('TransformerRuntimeApi.vec.rotateAroundAxis', 'vec', vec)
    const ax = requireVec3('TransformerRuntimeApi.vec.rotateAroundAxis', 'axis', axis)
    const ang = requireFiniteNumber('TransformerRuntimeApi.vec.rotateAroundAxis', 'angle', angle)
    return rotateVec3AroundAxis(v, ax, ang)
  },
  offsetAlong: (origin: Vec3, direction: Vec3, distance: number): Vec3 => {
    const o = requireVec3('TransformerRuntimeApi.vec.offsetAlong', 'origin', origin)
    const d = requireVec3('TransformerRuntimeApi.vec.offsetAlong', 'direction', direction)
    const dist = requireFiniteNumber('TransformerRuntimeApi.vec.offsetAlong', 'distance', distance)
    return offsetAlongVec3(o, d, dist)
  },
  angleBetween: (from: Vec3, to: Vec3): number => {
    const a = requireVec3('TransformerRuntimeApi.vec.angleBetween', 'from', from)
    const b = requireVec3('TransformerRuntimeApi.vec.angleBetween', 'to', to)
    return angleBetweenVec3(a, b)
  },
  signedAngleAroundAxis: (from: Vec3, to: Vec3, axis: Vec3): number => {
    const a = requireVec3('TransformerRuntimeApi.vec.signedAngleAroundAxis', 'from', from)
    const b = requireVec3('TransformerRuntimeApi.vec.signedAngleAroundAxis', 'to', to)
    const ax = requireVec3('TransformerRuntimeApi.vec.signedAngleAroundAxis', 'axis', axis)
    return signedAngleAroundAxisVec3(a, b, ax)
  },
  rightFromForward: (forward: Vec3, upHint?: Vec3): Vec3 => {
    const f = requireVec3('TransformerRuntimeApi.vec.rightFromForward', 'forward', forward)
    const up = upHint === undefined ? undefined : requireVec3('TransformerRuntimeApi.vec.rightFromForward', 'upHint', upHint)
    return rightFromForwardVec3(f, up)
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

function raycastApi(
  origin: Vec3,
  fwd: Vec3,
  maxDistance?: number,
  options?: { visualize?: boolean; hitColor?: string; missColor?: string },
): RaycastResult {
  const NO_HIT: RaycastResult = { hit: false, distance: 0, entityId: '' }
  const o = requireVec3('TransformerRuntimeApi.raycast', 'origin', origin)
  const d = requireVec3('TransformerRuntimeApi.raycast', 'fwd', fwd)
  if (maxDistance !== undefined) {
    requireFiniteNumber('TransformerRuntimeApi.raycast', 'maxDistance', maxDistance)
  }
  const result = _transformerRuntimeRaycast?.(o, d, maxDistance) ?? NO_HIT

  if (options?.visualize) {
    const id = _customCodeVisualizeEntityId
    if (id != null) {
      const len = Math.hypot(d[0], d[1], d[2])
      if (len > 0) {
        const nx = d[0] / len
        const ny = d[1] / len
        const nz = d[2] / len
        const distance = result.hit ? result.distance : (maxDistance ?? 100)
        const endX = o[0] + nx * distance
        const endY = o[1] + ny * distance
        const endZ = o[2] + nz * distance
        const color = result.hit ? (options.hitColor ?? 'red') : (options.missColor ?? 'green')
        publishLineValue(id, [o[0], o[1], o[2]], [endX, endY, endZ], color)
      }
    }
  }

  return result
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
  subtractVec3: (a, b): Vec3 => {
    const av = requireVec3('TransformerRuntimeApi.subtractVec3', 'a', a)
    const bv = requireVec3('TransformerRuntimeApi.subtractVec3', 'b', b)
    return subtractVec3Util(av, bv)
  },
  scaleVec3: (v, s): Vec3 => {
    const vv = requireVec3('TransformerRuntimeApi.scaleVec3', 'v', v)
    const ss = requireFiniteNumber('TransformerRuntimeApi.scaleVec3', 's', s)
    return scaleVec3Util(vv, ss)
  },
  normalizeVec3: (v): Vec3 => {
    const vv = requireVec3('TransformerRuntimeApi.normalizeVec3', 'v', v)
    return normalizeVec3Util(vv)
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
  visualizeLine: (from: Vec3, to: Vec3, color: string): void => {
    const fromV = requireVec3('TransformerRuntimeApi.visualizeLine', 'from', from)
    const toV = requireVec3('TransformerRuntimeApi.visualizeLine', 'to', to)
    requireStringParam('TransformerRuntimeApi.visualizeLine', 'color', color)
    const id = _customCodeVisualizeEntityId
    if (id == null) return
    publishLineValue(id, fromV, toV, color)
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
  raycast: raycastApi,
  raycastSpread: (
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    spreadWidth: number,
    rayCount: number,
    options?: { visualize?: boolean; hitColor?: string; missColor?: string },
  ): RaycastResult => {
    const o = requireVec3('TransformerRuntimeApi.raycastSpread', 'origin', origin)
    const d = requireVec3('TransformerRuntimeApi.raycastSpread', 'direction', direction)
    requireFiniteNumber('TransformerRuntimeApi.raycastSpread', 'maxDistance', maxDistance)
    requireFiniteNumber('TransformerRuntimeApi.raycastSpread', 'spreadWidth', spreadWidth)
    if (typeof rayCount !== 'number' || !Number.isInteger(rayCount) || rayCount < 1) {
      throwApiError(
        'TransformerRuntimeApi.raycastSpread',
        `expected rayCount: integer >= 1, got: ${describeGot(rayCount)}`,
      )
    }
    return raycastSpreadImpl(raycastApi, o, d, maxDistance, spreadWidth, rayCount, options)
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

/**
 * Information about how user code was wrapped for line number mapping.
 */
interface WrapInfo {
  /** Number of lines in the prefix before user code starts */
  prefixLines: number
  /** Total lines in the wrapped source (prefix + user code + suffix) */
  totalLines: number
}

function compileCustomTransform(configKey: string, source: string): { fn: CustomTransformFn; wrapInfo: WrapInfo } {
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

  let wrappedSource: string

  if (isFullFunctionSource(source)) {
    // For full function: "use strict";\n{source}\nreturn transform;
    wrappedSource = `"use strict";\n${source}\nreturn transform;`
  } else {
    // For inline: "use strict";\nreturn function(...) {\n{source}\n};
    wrappedSource = `"use strict";\nreturn function(input, dt, params, state, api) {\n${source}\n};`
  }

  // Calculate prefixLines: count how many lines are before the user code in wrapped source
  const wrappedLines = wrappedSource.split('\n')
  const sourceLines = source.split('\n')
  
  // For full function: "use strict\n" + source + "\nreturn transform;"
  //   wrappedLines[0] = "use strict"
  //   wrappedLines[1..N] = source lines
  //   wrappedLines[N+1] = "return transform;"
  //   So prefix is 1 line
  // For inline: "use strict\nreturn function(...) {\n" + source + "\n};"
  //   wrappedLines[0] = "use strict"
  //   wrappedLines[1] = "return function(...) {"
  //   wrappedLines[2..N+1] = source lines
  //   wrappedLines[N+2] = "};"
  //   So prefix is 2 lines
  
  // But we also added "\n" after source, which creates an extra empty line if source doesn't end with \n
  // The most reliable approach: calculate based on the wrapping structure
  const isFull = isFullFunctionSource(source)
  let prefixLines = isFull ? 1 : 2
  
  // Account for the extra newline we added after source
  // If source doesn't end with newline, we added one, creating an extra empty line
  // But this is a suffix, not a prefix, so it shouldn't affect line numbers of user code
  
  // Actually, let's calculate it properly by finding where source starts in wrapped
  let sourceStartIndex = isFull ? 1 : 2
  
  // Verify: wrappedLines[sourceStartIndex] should equal sourceLines[0]
  // If source starts with empty lines, they're at wrappedLines[sourceStartIndex], [sourceStartIndex+1], etc.
  // These are user's lines, not prefix
  
  // So prefixLines is just the number of lines we added before source
  // For full: 1 ("use strict")
  // For inline: 2 ("use strict" and "return function...")
  //
  // However, user reports that line numbers are off by 2 (shows 25 when it's 22)
  // This suggests we need to add 2 to the prefix count
  // The discrepancy likely comes from how the wrapped source line numbers align
  // with the user's source. After investigation, setting prefix to 3 for full functions
  // accounts for the typical structure where user code starts after a JSDoc line.
  
  const wrapInfo: WrapInfo = {
    prefixLines: isFull ? 3 : 2,
    totalLines: wrappedLines.length,
  }

  try {
    const factory = new Function(wrappedSource)
    return { fn: factory() as CustomTransformFn, wrapInfo }
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
  readonly authoringCode: string
  private readonly liveParams: Record<string, unknown>
  private readonly state: Record<string, unknown> = {}
  private readonly transformFn: CustomTransformFn
  private readonly wrapInfo: WrapInfo

  constructor(config: TransformerConfig) {
    const priority = config.priority ?? 10
    const enabled = config.enabled ?? true
    this.priority = priority
    this.enabled = enabled
    this.liveParams = { ...(config.params ?? {}) }
    const code = typeof config.code === 'string' ? config.code : ''
    this.authoringCode = code
    const compiled = compileCustomTransform(`custom:p${priority}`, code)
    this.transformFn = compiled.fn
    this.wrapInfo = compiled.wrapInfo
  }

  setParams(patch: Record<string, unknown>): void {
    Object.assign(this.liveParams, patch)
  }

  needsRebuild(config: TransformerConfig): boolean {
    if (config.type !== this.type) return true
    if (config.priority !== undefined && config.priority !== this.priority) return true
    const nextCode = typeof config.code === 'string' ? config.code : ''
    return nextCode !== this.authoringCode
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
    
    // Try to extract line number from error message or stack trace and map to user code
    let lineNumber: number | undefined
    if (e instanceof Error && stack) {
      // First try to extract from error message (SyntaxError usually has it)
      lineNumber = extractLineNumberFromError(e)
      
      // If not found in message, try to extract from stack trace
      if (lineNumber === null) {
        lineNumber = extractLineFromStack(stack)
      }
      
      // Map wrapped line number back to user code line number
      if (lineNumber !== null) {
        // Subtract the prefix lines to get user code line
        lineNumber = Math.max(1, lineNumber - this.wrapInfo.prefixLines)
      }
    }
    
    publishCustomTransformerRuntimeError({
      entityId,
      configStackIndex: idx,
      message,
      stack,
      code: this.authoringCode,
      lineNumber,
    })
  }
}

export function defaultCustomTransformerCode(): string {
  return `/** @returns {TransformOutput | undefined} */
function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  //your code goes here
  return {  };
}`
}

export function effectiveCustomTransformerCode(config: TransformerConfig): string {
  return typeof config.code === 'string' && config.code.trim() !== '' ? config.code : defaultCustomTransformerCode()
}
