/** Vec3: position, scale, or Euler (when used for display). */
export type Vec3 = [number, number, number]

/** Rotation: Euler angles in radians [x, y, z]. */
export type Rotation = [number, number, number]

/** @deprecated Use Rotation instead. Kept for backwards compatibility during migration. */
export type Quat = Rotation

/** Color: [r, g, b] or [r, g, b, a] 0–1. */
export type Color = [number, number, number] | [number, number, number, number]

export type CameraMode = 'firstPerson' | 'thirdPerson' | 'follow' | 'tracking'

/** UI order for camera mode dropdown and Digit0 / Numpad0 cycle in Builder; Digit1 / Numpad1 cycle active play avatar (see AvatarSession). */
export const CAMERA_MODE_CYCLE_ORDER: readonly CameraMode[] = [
  'follow',
  'thirdPerson',
  'tracking',
  'firstPerson',
] as const

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  follow: 'Follow',
  thirdPerson: 'Third person',
  tracking: 'Tracking',
  firstPerson: 'First person',
}

export function cycleCameraMode(current: CameraMode): CameraMode {
  const order = CAMERA_MODE_CYCLE_ORDER
  const i = order.indexOf(current)
  const next = (i === -1 ? 0 : i + 1) % order.length
  return order[next]!
}

export type CameraControl = 'free' | 'follow' | 'top' | 'front' | 'right'

/** Last Builder free-fly / edit-navigation pose for restore after reload or save. */
export interface EditorFreePose {
  position: Vec3
  /** THREE quaternion [x, y, z, w]. */
  quaternion: [number, number, number, number]
}

export interface CameraConfig {
  control?: CameraControl
  mode: CameraMode
  target: string
  distance?: number
  height?: number
  fov?: number
  defaultPosition?: Vec3
  defaultRotation?: Rotation
  editorFreePose?: EditorFreePose
}

/**
 * Play session snapshot of follow / orbit / first-person camera for one avatar.
 * Used only in memory when switching avatars (not persisted to world JSON).
 */
export interface AvatarFocusSnapshot {
  control: CameraControl
  mode: CameraMode
  target: string
  distance?: number
  height?: number
  fov?: number
  orbitYaw: number
  orbitPitch: number
  orbitDistance: number
  /** Live PerspectiveCamera.fov in degrees (first person); kept for restore. */
  effectiveFovDegrees: number
}

/**
 * Persisted preferred camera for an avatar (subset of {@link CameraConfig} plus orbit saved from the live view).
 */
export interface EntityPreferredCamera extends Partial<CameraConfig> {
  orbitYaw?: number
  orbitPitch?: number
  orbitDistance?: number
}

/** Optional: entity can be selected as play avatar (+ / − cycle, scripts). */
export interface EntityAvatarConfig {
  /** Default true when `avatar` is present. Set false to omit from the avatar roster. */
  enabled?: boolean
  /** First-time focus defaults when no session snapshot exists for this entity. */
  preferredCamera?: EntityPreferredCamera
}

export interface DirectionalLightConfig {
  direction?: Vec3
  color?: Color
  intensity?: number
}

/** Rapier-style sleep tuning: negative linearThreshold or angularThreshold disables that velocity check. */
export interface WorldSleepingSettings {
  linearThreshold: number
  angularThreshold: number
  timeUntilSleep: number
}

/** Defaults aligned with Rapier docs (~normalized linear 0.4, angular 0.5 rad/s, 2s). */
export const RECOMMENDED_SLEEPING_SETTINGS: WorldSleepingSettings = {
  linearThreshold: 0.4,
  angularThreshold: 0.5,
  timeUntilSleep: 2.0,
}

/** Distance-based hide + optional physics/script sleep; see `applyDistanceCulling`. */
export interface DistanceCullingSettings {
  maxDistance: number
  minSizeDistanceRatio: number
  /** When true, freeze Rapier bodies and skip scripts for culled entities. */
  sleepCulled?: boolean
}

/** Engine defaults when `distanceCulling` is omitted. */
export const DEFAULT_DISTANCE_CULLING: DistanceCullingSettings = {
  maxDistance: 2000,
  minSizeDistanceRatio: 0.02,
}

/**
 * `undefined` → defaults (culling on). `false` → off. Object is merged over defaults.
 */
export function resolveDistanceCullingSettings(
  raw: false | DistanceCullingSettings | undefined,
): DistanceCullingSettings | null {
  if (raw === false) return null
  if (raw == null) return { ...DEFAULT_DISTANCE_CULLING }
  return { ...DEFAULT_DISTANCE_CULLING, ...raw }
}

/** Fixed-step bounds: 15 Hz … 240 Hz (seconds per step). */
export const SIMULATION_FIXED_DT_MIN = 1 / 240
export const SIMULATION_FIXED_DT_MAX = 1 / 15

export const SIMULATION_MAX_STEPS_MIN = 1
export const SIMULATION_MAX_STEPS_MAX = 10

export const SIMULATION_TIME_SCALE_MIN = 0.1
export const SIMULATION_TIME_SCALE_MAX = 5

/** Semi-fixed timestep tuning; see `resolveSimulationSettings` and SceneView accumulator. */
export interface SimulationSettings {
  /** Simulation step in seconds. Default 1/60. Clamped to {@link SIMULATION_FIXED_DT_MIN}…{@link SIMULATION_FIXED_DT_MAX}. */
  fixedDt?: number
  /** Max physics/transformer steps per render frame (spiral-of-death guard). Default 4. Clamped 1…10. */
  maxStepsPerFrame?: number
  /** Simulation speed multiplier. 1 = real time, 2 = double speed, 0.5 = half speed. Default 1. Clamped 0.1…5. */
  timeScale?: number
}

export const DEFAULT_SIMULATION: Required<SimulationSettings> = {
  fixedDt: 1 / 60,
  maxStepsPerFrame: 4,
  timeScale: 1,
}

export function resolveSimulationSettings(raw?: SimulationSettings): Required<SimulationSettings> {
  const fixedDt = raw?.fixedDt ?? DEFAULT_SIMULATION.fixedDt
  const maxStepsPerFrame = raw?.maxStepsPerFrame ?? DEFAULT_SIMULATION.maxStepsPerFrame
  const timeScale = raw?.timeScale ?? DEFAULT_SIMULATION.timeScale
  return {
    fixedDt: Math.min(SIMULATION_FIXED_DT_MAX, Math.max(SIMULATION_FIXED_DT_MIN, fixedDt)),
    maxStepsPerFrame: Math.min(
      SIMULATION_MAX_STEPS_MAX,
      Math.max(SIMULATION_MAX_STEPS_MIN, Math.floor(maxStepsPerFrame)),
    ),
    timeScale: Math.min(SIMULATION_TIME_SCALE_MAX, Math.max(SIMULATION_TIME_SCALE_MIN, timeScale)),
  }
}

export interface WorldSettings {
  gravity?: Vec3
  wind?: Vec3
  /** Optional custom sleep timer applied in PhysicsWorld when set. */
  sleeping?: WorldSleepingSettings
  /**
   * Omitted = enabled with {@link DEFAULT_DISTANCE_CULLING}. `false` = disabled.
   * Legacy `radius` / `minSize` are migrated to `maxDistance` / `minSizeDistanceRatio`.
   */
  distanceCulling?: false | DistanceCullingSettings
  sound?: SoundSettings
  ambientLight?: Color
  directionalLight?: DirectionalLightConfig
  skyColor?: Color
  skybox?: string
  camera?: CameraConfig
  /** Semi-fixed timestep (accumulator); omit for {@link DEFAULT_SIMULATION}. */
  simulation?: SimulationSettings
  /** When true, show last-frame ms / fps overlay on the scene canvas. */
  showFrameStats?: boolean
}

export interface SoundSettings {
  assetId?: string
  volume?: number
  loop?: boolean
  autoplay?: boolean
}

export interface AssetRef {
  path?: string
  type?: 'texture' | 'model' | 'cubeTexture' | 'audio' | 'video'
}

/** Mesh decimation backend; `meshoptimizer` is higher quality, `simplifyModifier` is the legacy Three.js path. */
export type SimplificationAlgorithm = 'meshoptimizer' | 'simplifyModifier'

export interface TrimeshSimplificationConfig {
  enabled?: boolean  // Whether to enable simplification
  maxTriangles?: number  // Maximum triangles (e.g., 5000)
  targetReduction?: number  // Alternative: percentage to reduce (0.0-1.0, e.g., 0.5 = 50% reduction)
  /** Default `meshoptimizer`. */
  algorithm?: SimplificationAlgorithm
  /**
   * Meshoptimizer relative error vs mesh extent; default 0.01 (≈1%). Not multiplied by `getScale()`.
   * Larger values allow more aggressive decimation; schema minimum 0.0001, no maximum.
   */
  maxError?: number
}

export type Shape =
  | { type: 'box'; width: number; height: number; depth: number }
  | { type: 'sphere'; radius: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'capsule'; radius: number; height: number }
  | { type: 'cone'; radius: number; height: number }
  | { type: 'pyramid'; baseSize: number; height: number }
  | { type: 'ring'; innerRadius: number; outerRadius: number; height?: number }
  | { type: 'plane'; normal?: Vec3 }
  | { type: 'trimesh'; model: string; simplification?: TrimeshSimplificationConfig }

export interface MaterialRef {
  color?: Color
  map?: string
  roughness?: number
  metalness?: number
  /** Opacity 0–1; default 1 (fully opaque). When below 1, renderer uses transparent blending. */
  opacity?: number
  // Advanced texture properties
  mapRepeat?: Vec3  // [x, y] UV repeat
  mapWrapS?: 'repeat' | 'clampToEdge' | 'mirroredRepeat'
  mapWrapT?: 'repeat' | 'clampToEdge' | 'mirroredRepeat'
  mapRotation?: number  // rotation in radians
  mapOffset?: Vec3  // [x, y] UV offset
}

/** Event types for entity scripts. Each script declares one event. */
export type ScriptEvent = 'onSpawn' | 'onUpdate' | 'onCollision' | 'onTimer'

/** Script definition: event-bound at data level. onTimer requires interval (seconds). */
export type ScriptDef =
  | { event: 'onSpawn' | 'onUpdate' | 'onCollision'; source: string }
  | { event: 'onTimer'; interval: number; source: string }

/**
 * Legacy entity scripts format (event → script ID). Used only for migration from old world JSON.
 * @internal
 */
export interface EntityScriptsLegacy {
  onSpawn?: string
  onUpdate?: string
  onCollision?: string
  [key: string]: string | undefined
}

export interface Entity {
  id: string
  name?: string
  bodyType?: 'static' | 'dynamic' | 'kinematic'
  shape?: Shape
  position?: Vec3
  rotation?: Rotation
  scale?: Vec3
  model?: string
  /** Euler [x,y,z] radians applied to the 3D model/trimesh only (relative to item). */
  modelRotation?: Rotation
  /** Scale [x,y,z] applied to the 3D model/trimesh only (relative to item). */
  modelScale?: Vec3
  /**
   * When true and entity uses a visual model on a primitive shape, render an edge
   * overlay of the physics primitive (not GLTF triangles). Ignored for trimesh.
   */
  showShapeWireframe?: boolean
  /**
   * Mesh decimation for the **visual** GLTF when `model` is set on a non-trimesh shape.
   * Collision stays the primitive; only rendering is reduced. Trimesh bodies use `shape.simplification` instead.
   */
  modelSimplification?: TrimeshSimplificationConfig
  material?: MaterialRef
  mass?: number
  restitution?: number
  friction?: number
  linearDamping?: number
  angularDamping?: number
  /** Script IDs from world.scripts. Each script declares its own event type. */
  scripts?: string[]
  locked?: boolean
  transformers?: import('./transformer').TransformerConfig[]
  /** When set, entity may be the play avatar (input + camera); see EntityAvatarConfig. */
  avatar?: EntityAvatarConfig
}

/**
 * Global (cross-project) preset: visual model + material + shape + entity scale.
 * Stored in IndexedDB `modelPresets` store, not in RennWorld.
 */
export interface ModelPreset {
  id: string
  name: string
  createdAt: number
  model?: string
  modelRotation?: Rotation
  modelScale?: Vec3
  modelSimplification?: TrimeshSimplificationConfig
  material?: MaterialRef
  shape?: Shape
  scale?: Vec3
}

export interface RennWorld {
  version: string
  world: WorldSettings
  entities: Entity[]
  assets?: Record<string, AssetRef>
  scripts?: Record<string, ScriptDef>
}

export const DEFAULT_GRAVITY: Vec3 = [0, -9.81, 0]
export const DEFAULT_POSITION: Vec3 = [0, 0, 0]
export const DEFAULT_ROTATION: Rotation = [0, 0, 0]
export const DEFAULT_SCALE: Vec3 = [1, 1, 1]

/**
 * Complete entity pose (position and rotation)
 */
export type EntityPose = { position: Vec3; rotation: Rotation }

/**
 * Partial entity pose (either position or rotation, or both)
 */
export type PartialEntityPose = { position?: Vec3; rotation?: Rotation }
