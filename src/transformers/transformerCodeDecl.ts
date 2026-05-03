/**
 * Monaco `.d.ts` content for custom transformer authoring (matches `customCodeTransformer` runner).
 *
 * IntelliSense combines:
 * - **Ambient types** (`TransformInput`, `TransformerRuntimeApi`, …) resolved from JSDoc in the skeleton.
 * - **`declare const`** for legacy snippets that omit `function transform(...)`.
 */

export function transformerCtxDecl(): string {
  return `
/** World-space 3-vector [x, y, z] (metres) or normalized direction. */
type Vec3 = [number, number, number];

/** Euler angles [x, y, z] in radians. Same tuple shape as Vec3; Three.js: -Z = forward for facing. */
type Rotation = Vec3;

interface EnvironmentState {
  /** Optional ambient wind vector (world space). */
  wind?: Vec3;
  /** True when on a supported ground surface (runtime-defined semantics). */
  isGrounded?: boolean;
  /** Surface normal at ground contact when grounded. */
  groundNormal?: Vec3;
  /** True when this collider has at least one active contact with another collider. */
  isTouchingObject?: boolean;
  /**
   * World-space velocity of supporting surface averaged from solver contacts.
   * Present when grounded/touching; absent when airborne or unknown.
   */
  supportVelocity?: Vec3;
}

interface TransformTarget {
  /** Goal pose in world space. */
  pose: { position: Vec3; rotation: Rotation };
  /** Linear speed in m/s toward pose.position (not angular; not duration). */
  speed: number;
  /** Optional curve hint for easing; kinematic movers may treat motion as linear for now. */
  curve?: string;
  /** Optional world-space velocity hint for future force-based interpreters. */
  velocity?: Vec3;
}

interface TransformInput {
  /** Mapped keyboard/wheel values (0–1 or -1–1). Read safely with api.getAction(input, 'name'). */
  actions: Record<string, number>;
  /** World-space position [x, y, z] in metres. */
  position: Vec3;
  /** Euler angles [x, y, z] in radians. Three.js convention: -Z = forward. */
  rotation: Rotation;
  /** World-space linear velocity (m/s). */
  velocity: Vec3;
  /** World-space angular velocity (rad/s). */
  angularVelocity: Vec3;
  /** Accumulated force from earlier transformers this frame. */
  accumulatedForce: Vec3;
  /** Accumulated torque from earlier transformers this frame. */
  accumulatedTorque: Vec3;
  environment: EnvironmentState;
  /** Same value as dt parameter. */
  deltaTime: number;
  /** Owning entity id. */
  entityId: string;
  /** Movement intent from targetPoseInput (or similar earlier in chain). Last writer wins. */
  target?: TransformTarget;
}

interface TransformOutput {
  /** Continuous force added this frame (world-space, N). */
  force?: Vec3;
  /** Instantaneous impulse (world-space, N·s). */
  impulse?: Vec3;
  /** Continuous torque added this frame (world-space). */
  torque?: Vec3;
  /** Mesh color override [r, g, b], channels 0–1. */
  color?: Vec3;
  /** Euler delta added to rotation this frame (rad). Pass null to clear intent. */
  addRotation?: Rotation | null;
  /** Move body to pose; kinematic movers. Last wins; zeros linear/angular velocity in runtime. */
  setPose?: { position: Vec3; rotation: Rotation };
  /** Stop transformer chain after this step. */
  earlyExit?: boolean;
}

/** Frozen singleton; no imports inside saved transformer code — use api.* helpers. */
interface TransformerRuntimeApi {
  /** input.actions[name] ?? 0. */
  getAction(input: TransformInput, name: string): number;
  /** Unit forward (-Z facing) from Euler. */
  getForwardVector(rotation: Rotation): Vec3;
  /** Unit world up (+Y) from Euler. */
  getUpVector(rotation: Rotation): Vec3;
  /** Component-wise sum. */
  addVec3(a: Vec3, b: Vec3): Vec3;
  /** Multiply each component of v by scalar s. */
  scaleVec3(v: Vec3, s: number): Vec3;
  /** Clamp value inclusively between min and max. */
  clamp(value: number, min: number, max: number): number;
  /** Euler rotation delta for yaw-like turn around arbitrary world axis (radians). */
  eulerDeltaAroundAxis(currentRotation: Rotation, axis: Vec3, angleRad: number): Rotation;
  /** Show message on play snackbar via ScriptSnackbar; default durationSeconds 4. No-op when unwired (e.g. tests). */
  log(message: string, durationSeconds?: number): void;
}

/** Type alias for the canonical transform(...) callback (use with optional JSDoc @type referencing TransformFn). */
type TransformFn = (
  input: TransformInput,
  dt: number,
  params: Record<string, unknown>,
  state: Record<string, unknown>,
  api: TransformerRuntimeApi,
) => TransformOutput | undefined;

/**
 * Full-function authoring: name it \`transform\` and duplicate the skeleton JSDoc @param/@returns tags.
 * Legacy bare-return snippets still compile; globals below apply inside the implicit body wrapper.
 */

declare const input: TransformInput;
declare const dt: number;

/** Mutable copy of Params JSON from the transformer row; cast reads (e.g. Number(params.power ?? 0)). */
declare const params: Record<string, unknown>;

/** Per-instance frame-to-frame persistence; cleared when transformer is recreated. */
declare const state: Record<string, unknown>;

declare const api: TransformerRuntimeApi;

`
}

export const TRANSFORMER_CODE_EXTRA_LIB_URI = 'ts:transformer-custom.d.ts'
