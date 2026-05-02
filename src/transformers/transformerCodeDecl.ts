/**
 * Monaco `.d.ts` content for custom transformer authoring (matches `customCodeTransformer` runner).
 */

export function transformerCtxDecl(): string {
  return `
type Vec3 = [number, number, number];
type Rotation = Vec3;

interface EnvironmentState {
  wind?: Vec3;
  isGrounded?: boolean;
  groundNormal?: Vec3;
  isTouchingObject?: boolean;
  supportVelocity?: Vec3;
}

interface TransformTarget {
  pose: { position: Vec3; rotation: Rotation };
  speed: number;
  curve?: string;
  velocity?: Vec3;
}

interface TransformInput {
  actions: Record<string, number>;
  position: Vec3;
  rotation: Rotation;
  velocity: Vec3;
  angularVelocity: Vec3;
  accumulatedForce: Vec3;
  accumulatedTorque: Vec3;
  environment: EnvironmentState;
  deltaTime: number;
  entityId: string;
  target?: TransformTarget;
}

interface TransformOutput {
  force?: Vec3;
  impulse?: Vec3;
  torque?: Vec3;
  color?: Vec3;
  addRotation?: Rotation | null;
  setPose?: { position: Vec3; rotation: Rotation };
  earlyExit?: boolean;
}

/** Frozen singleton; same reference every frame — use api.* for math helpers (no imports in saved code). */
interface TransformerRuntimeApi {
  getAction(input: TransformInput, name: string): number;
  getForwardVector(rotation: Rotation): Vec3;
  getUpVector(rotation: Rotation): Vec3;
  addVec3(a: Vec3, b: Vec3): Vec3;
  scaleVec3(v: Vec3, s: number): Vec3;
  clamp(value: number, min: number, max: number): number;
  /** Euler delta: add result to current rotation for a turn around world-space axis (radians). */
  eulerDeltaAroundAxis(currentRotation: Rotation, axis: Vec3, angleRad: number): Rotation;
}

declare const params: Record<string, unknown>;
/** Per-transformer-instance mutable object; survives across frames for this transformer only. */
declare const state: Record<string, unknown>;
declare const dt: number;
declare const input: TransformInput;
declare const api: TransformerRuntimeApi;

/**
 * Your code runs as the body of:
 * function(input, dt, params, state, api) { ... }
 * Return a Partial<TransformOutput> or {} — invalid or non-finite numbers are stripped.
 */
`
}

export const TRANSFORMER_CODE_EXTRA_LIB_URI = 'ts:transformer-custom.d.ts'
