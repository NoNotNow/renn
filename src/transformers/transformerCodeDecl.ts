/**
 * Monaco `.d.ts` content for custom transformer authoring (matches `customCodeTransformer` runner).
 *
 * IntelliSense combines:
 * - **Ambient types** (`TransformInput`, `TransformerRuntimeApi`, `TransformerVecApi`, `LiveWorldEntity`, …) from JSDoc on each `transform` parameter (inline `@type {TransformInput}` before `input`, same for `api`, or a full `@param` block). Without that, a named `function transform(input, …)` keeps parameters as implicit `any` and hides `input.` / `api.` completions — local params shadow the `declare const` globals below.
 * - **`declare const`** for legacy body-only snippets that never declare `function transform(...)`.
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
  /**
   * World-space linear velocity (m/s), tuple [x, y, z]. Use v[0]–v[2] or \`api.vec.*\` helpers (e.g. getForwardSpeed with \`api.vec.getForwardVector(input.rotation)\`).
   */
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

/** Grouped vector helpers for tuple Vec3; use \`api.vec\` after typing \`api\` as \`TransformerRuntimeApi\`. */
interface TransformerVecApi {
  /** Unit forward (-Z facing) from Euler. */
  getForwardVector(rotation: Rotation): Vec3;
  /** Unit world up (+Y) from Euler. */
  getUpVector(rotation: Rotation): Vec3;
  dot(a: Vec3, b: Vec3): number;
  /** Cross product **a × b** (right-handed). */
  cross(a: Vec3, b: Vec3): Vec3;
  length(v: Vec3): number;
  /** Same direction as \`v\` with length 1; \`[0, 0, 0]\` when length is negligible. */
  normalize(v: Vec3): Vec3;
  add(a: Vec3, b: Vec3): Vec3;
  /** Component-wise difference **a − b**. */
  subtract(a: Vec3, b: Vec3): Vec3;
  scale(v: Vec3, s: number): Vec3;
  /** Signed scalar speed along \`forward\` (dot product); prefer unit forward from getForwardVector. */
  getForwardSpeed(velocity: Vec3, forward: Vec3): number;
  /**
   * Project \`vec\` onto the plane perpendicular to \`planeNormal\`.
   * Use entity up (\`api.getUpVector(input.rotation)\`) for slope-relative horizontal steering; \`[0, 1, 0]\` for world XZ.
   */
  projectOntoPlane(vec: Vec3, planeNormal: Vec3): Vec3;
  /**
   * Rotate \`vec\` by \`angle\` radians around \`axis\` (e.g. entity up for obstacle-avoidance turns on slopes).
   */
  rotateAroundAxis(vec: Vec3, axis: Vec3, angle: number): Vec3;
  /** \`origin + direction * distance\` (direction need not be normalized). */
  offsetAlong(origin: Vec3, direction: Vec3, distance: number): Vec3;
  /** Unsigned angle between directions in radians (0 … π). */
  angleBetween(from: Vec3, to: Vec3): number;
  /** Signed angle from \`from\` to \`to\` around \`axis\`; 0 when nearly parallel. */
  signedAngleAroundAxis(from: Vec3, to: Vec3, axis: Vec3): number;
  /** Unit right vector ⊥ \`forward\` in the plane of \`forward\` and \`upHint\` (default world +Y). */
  rightFromForward(forward: Vec3, upHint?: Vec3): Vec3;
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

/** Result of \`api.raycast()\`. */
interface RaycastResult {
  hit: boolean;
  /** Distance along the ray to the hit point. 0 when no hit. */
  distance: number;
  /** Id of the hit entity. Empty string when no hit. */
  entityId: string;
}

/** RGB or RGBA channels 0–1. */
type Color = [number, number, number] | [number, number, number, number];

type Shape =
  | { type: 'box'; width: number; height: number; depth: number }
  | { type: 'sphere'; radius: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'capsule'; radius: number; height: number }
  | { type: 'cone'; radius: number; height: number }
  | { type: 'pyramid'; baseSize: number; height: number }
  | { type: 'plane'; normal?: Vec3 }
  | { type: 'trimesh'; model: string; simplification?: TrimeshSimplificationConfig };

type SimplificationAlgorithm = 'meshoptimizer' | 'simplifyModifier';

interface TrimeshSimplificationConfig {
  enabled?: boolean;
  maxTriangles?: number;
  targetReduction?: number;
  algorithm?: SimplificationAlgorithm;
  maxError?: number;
}

interface MaterialRef {
  color?: Color;
  map?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  mapRepeat?: Vec3;
  mapWrapS?: 'repeat' | 'clampToEdge' | 'mirroredRepeat';
  mapWrapT?: 'repeat' | 'clampToEdge' | 'mirroredRepeat';
  mapRotation?: number;
  mapOffset?: Vec3;
}

interface EntityPreferredCamera {
  control?: string;
  mode?: string;
  target?: string;
  distance?: number;
  height?: number;
  targetVerticalAngle?: number;
  fov?: number;
  defaultPosition?: Vec3;
  defaultRotation?: Rotation;
  editorFreePose?: unknown;
  orbitYaw?: number;
  orbitPitch?: number;
  orbitDistance?: number;
}

interface EntityAvatarConfig {
  enabled?: boolean;
  preferredCamera?: EntityPreferredCamera;
}

/** Serialized transformer row from world JSON; \`inputMapping\` depends on \`type\`. */
interface TransformerConfig {
  type: string;
  name?: string;
  priority?: number;
  enabled?: boolean;
  inputMapping?: unknown;
  params?: Record<string, unknown>;
  code?: string;
}

/**
 * Persisted world entity (same fields as \`Entity\` in src/types/world.ts).
 * Named \`WorldEntity\` here to avoid clashing with the DOM \`Entity\` type when lib.dom is loaded.
 */
interface WorldEntity {
  id: string;
  name?: string;
  bodyType?: 'static' | 'dynamic' | 'kinematic';
  shape?: Shape;
  position?: Vec3;
  rotation?: Rotation;
  scale?: Vec3;
  model?: string;
  modelRotation?: Rotation;
  modelScale?: Vec3;
  showShapeWireframe?: boolean;
  modelSimplification?: TrimeshSimplificationConfig;
  doubleSided?: boolean;
  material?: MaterialRef;
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
  scripts?: string[];
  locked?: boolean;
  transformers?: TransformerConfig[];
  avatar?: EntityAvatarConfig;
}

/**
 * Result of \`api.getEntity(id)\`: world JSON fields (shallow) plus live pose query.
 * For hot paths use \`api.getWorldPosition(id)\` / \`api.getStartPosition(id)\` (no snapshot object). Prefer \`getLivePosition()\` over \`position\` on this snapshot for dynamic bodies — serialized \`position\` may lag the physics mesh.
 */
interface LiveWorldEntity extends WorldEntity {
  getLivePosition(): Vec3 | null;
}

/** Frozen singleton; no imports inside saved transformer code — use api.* helpers. Invalid arguments throw at runtime with message prefix [TransformerRuntimeApi.…]. */
interface TransformerRuntimeApi {
  /** input.actions[name] ?? 0. */
  getAction(input: TransformInput, name: string): number;
  /** Unit forward (-Z facing) from Euler; same as \`api.vec.getForwardVector\`. */
  getForwardVector(rotation: Rotation): Vec3;
  /** Unit world up (+Y) from Euler; same as \`api.vec.getUpVector\`. */
  getUpVector(rotation: Rotation): Vec3;
  /** Component-wise sum; same as \`api.vec.add\`. */
  addVec3(a: Vec3, b: Vec3): Vec3;
  /** Component-wise difference; same as \`api.vec.subtract\`. */
  subtractVec3(a: Vec3, b: Vec3): Vec3;
  /** Multiply each component of v by scalar s; same as \`api.vec.scale\`. */
  scaleVec3(v: Vec3, s: number): Vec3;
  /** Same as \`api.vec.normalize\`. */
  normalizeVec3(v: Vec3): Vec3;
  /** Dot, length, normalize, add, subtract, scale, basis vectors from Euler, cross, getForwardSpeed — grouped Vec3 tuple helpers. */
  vec: TransformerVecApi;
  /** Clamp value inclusively between min and max. */
  clamp(value: number, min: number, max: number): number;
  /** Euler rotation delta for yaw-like turn around arbitrary world axis (radians). */
  eulerDeltaAroundAxis(currentRotation: Rotation, axis: Vec3, angleRad: number): Rotation;
  /** Show message on play snackbar via ScriptSnackbar; default durationSeconds 4. No-op when unwired (e.g. tests). */
  log(message: string, durationSeconds?: number): void;
  /**
   * Builder visualize mode: push one numeric sample to the variable overlay (selected entity, overlay wired).
   * Bar fill uses the color parameter; the name label is always white. Requires finite value, string color/name, integer index 1–16; otherwise throws [TransformerRuntimeApi.visualize]. No-op in Play/tests or when overlay is unwired after validation.
   */
  visualize(value: number, color: string, name: string, index: number): void;
  /**
   * Builder visualize mode: draw a line between two world-space coordinates.
   * Useful for visualizing targets, waypoints, or direction vectors. No-op in Play/tests or when overlay is unwired.
   * @param from World-space [x, y, z] start point.
   * @param to World-space [x, y, z] end point.
   * @param color CSS color string (e.g. 'blue', '#ff0000').
   */
  visualizeLine(from: Vec3, to: Vec3, color: string): void;
  /**
   * Live world position from physics cache or mesh during transformer execution (same source as registry \`getPosition\`).
   * Null when unwired or unavailable. No entity snapshot allocation.
   */
  getWorldPosition(id: string): Vec3 | null;
  /**
   * Persisted \`entity.position\` from world JSON for \`id\` (spawn/start pose). May differ from live pose for dynamic bodies.
   * Null when unwired, unknown id, or invalid/absent position.
   */
  getStartPosition(id: string): Vec3 | null;
  /**
   * Shallow snapshot of the persisted entity plus \`getLivePosition()\` (physics cache / mesh when hooks are wired).
   * Undefined when the id is unknown or the entity lookup hook is unwired.
   */
  getEntity(id: string): LiveWorldEntity | undefined;
  /**
   * Cast a ray from \`origin\` (e.g. \`input.position\`) in direction \`fwd\`.
   * No entity is automatically excluded — offset the origin or filter \`result.entityId\` in your code if needed.
   * Returns \`{ hit: false, distance: 0, entityId: '' }\` when physics is unavailable or direction is zero-length.
   */
  raycast(origin: Vec3, fwd: Vec3, maxDistance?: number): RaycastResult;

  /**
   * Cast a ray from \`origin\` in direction \`fwd\` with optional debug visualization.
   * When visualize is true, draws a line from origin to the hit point (or to maxDistance if no hit).
   * Hit lines use hitColor (default 'red'), miss lines use missColor (default 'green').
   * No-op in Play mode or when visualize gizmo mode is inactive.
   * @param origin World-space ray origin [x, y, z].
   * @param fwd World-space direction vector (will be normalized).
   * @param maxDistance Maximum ray distance in metres.
   * @param options Visualization and filtering options.
   */
  raycast(origin: Vec3, fwd: Vec3, maxDistance: number, options: { visualize: true; hitColor?: string; missColor?: string }): RaycastResult;

  /**
   * Cast a ray from \`origin\` in direction \`fwd\` with optional debug visualization.
   * @param origin World-space ray origin [x, y, z].
   * @param fwd World-space direction vector (will be normalized).
   * @param maxDistance Maximum ray distance in metres.
   * @param options Visualization and filtering options; visualize defaults to false.
   */
  raycast(origin: Vec3, fwd: Vec3, maxDistance?: number, options?: { visualize?: boolean; hitColor?: string; missColor?: string }): RaycastResult;

  /**
   * Cast parallel rays spread sideways; closest hit wins, else center-ray result.
   * @param spreadWidth Total sideways span (rays from -width/2 to +width/2 along right axis).
   * @param rayCount Number of parallel rays (including center); must be integer >= 1.
   */
  raycastSpread(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    spreadWidth: number,
    rayCount: number,
    options?: { visualize?: boolean; hitColor?: string; missColor?: string },
  ): RaycastResult;
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
 * Full-function authoring: name it \`transform\` and add JSDoc @type (or @param) on each parameter so \`input\` / \`api\` are not implicit any.
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
