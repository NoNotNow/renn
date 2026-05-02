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

declare const params: Record<string, unknown>;
/** Per-transformer-instance mutable object; survives across frames for this transformer only. */
declare const state: Record<string, unknown>;
declare const dt: number;
declare const input: TransformInput;

/**
 * Your code runs as the body of: function(input, dt, params, state) { ... }
 * Return a Partial<TransformOutput> or {} — invalid or non-finite numbers are stripped.
 */
`
}

export const TRANSFORMER_CODE_EXTRA_LIB_URI = 'ts:transformer-custom.d.ts'
