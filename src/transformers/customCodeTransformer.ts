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
  return `// ─── Custom Transformer ────────────────────────────────────────────────────
// Your code is the BODY of: function(input, dt, params, state, api) { ... }
// Called every physics frame. Return a TransformOutput object (or {} for none).
//
// ── Arguments ───────────────────────────────────────────────────────────────
//
// input : TransformInput
//   .actions               Record<string, number>
//     Mapped keyboard/wheel values, typically 0–1 or -1–1.
//     Populated by an 'input' transformer earlier in the stack.
//     Safe read: api.getAction(input, 'thrust')  →  number (0 if absent)
//   .position              Vec3  [x, y, z]   world-space position (metres)
//   .rotation              Vec3  [x, y, z]   Euler angles (radians, Three.js -Z = forward)
//   .velocity              Vec3              world-space linear velocity (m/s)
//   .angularVelocity       Vec3              world-space angular velocity (rad/s)
//   .accumulatedForce      Vec3              forces already added by earlier transformers
//   .accumulatedTorque     Vec3              torques already added by earlier transformers
//   .environment.isTouchingObject  boolean   true when collider has any contact
//   .environment.isGrounded        boolean   true when on a ground surface
//   .environment.groundNormal      Vec3      surface normal at ground contact
//   .environment.supportVelocity  Vec3       velocity of the supporting surface
//   .environment.wind              Vec3       optional ambient wind vector
//   .deltaTime             number            same value as dt (seconds)
//   .entityId              string            owning entity id
//   .target                { pose: { position, rotation }, speed }
//     Optional movement intent written by targetPoseInput transformer.
//
// dt : number
//   Frame delta time in seconds (≈ 0.016 at 60 fps). Use this to make
//   forces and impulses frame-rate independent.
//
// params : Record<string, unknown>
//   JSON values from the "Params" field in the Code tab — live-editable without reload.
//   Always cast before use:  const power = Number(params.power ?? 0);
//
// state : Record<string, unknown>
//   Mutable object that persists across frames for this transformer instance only.
//   Reset when the world reloads or the transformer is recreated.
//   Example:  state.elapsed = ((state.elapsed as number) ?? 0) + dt;
//
// api : TransformerRuntimeApi  (frozen singleton — no imports available)
//   .getAction(input, name)                      → number  (0 when action absent)
//   .getForwardVector(rotation)                  → Vec3    (-Z from Euler)
//   .getUpVector(rotation)                       → Vec3    (+Y from Euler)
//   .addVec3(a, b)                               → Vec3    component-wise sum
//   .scaleVec3(v, s)                             → Vec3    v * s
//   .clamp(value, min, max)                      → number  inclusive clamp
//   .eulerDeltaAroundAxis(rotation, axis, angle) → Rotation  Euler delta for yaw turns
//
// ── Return : TransformOutput ─────────────────────────────────────────────────
//   Return {} for no effect. All fields are optional.
//   Non-finite numbers are silently stripped by the runtime.
//
//   .force?       Vec3              continuous force added this frame (world-space, N)
//   .impulse?     Vec3              instantaneous impulse (world-space, N·s)
//   .torque?      Vec3              continuous torque added this frame (world-space)
//   .color?       Vec3  [r, g, b]   mesh color override, channels 0–1
//   .addRotation? Vec3 | null       Euler delta added to rotation this frame (rad)
//   .setPose?     { position: Vec3, rotation: Vec3 }
//     Teleport body to exact pose. Last-wins in chain; zeroes linear/angular velocity.
//     Only meaningful on kinematic bodies.
//   .earlyExit?   boolean           stop processing the transformer chain after this step
//
// ─────────────────────────────────────────────────────────────────────────────
const power = Number(params.power ?? 0);
if (!input.environment.isTouchingObject || power === 0) return {};

const forward = api.getForwardVector(input.rotation);
return { impulse: api.scaleVec3(forward, power * dt) };`
}

export function effectiveCustomTransformerCode(config: TransformerConfig): string {
  return typeof config.code === 'string' && config.code.trim() !== '' ? config.code : defaultCustomTransformerCode()
}
