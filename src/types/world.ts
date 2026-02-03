/** Vec3: position, scale, or Euler (when used for display). */
export type Vec3 = [number, number, number]

/** Quat: rotation as quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number]

/** Color: [r, g, b] or [r, g, b, a] 0–1. */
export type Color = [number, number, number] | [number, number, number, number]

export type CameraMode = 'firstPerson' | 'thirdPerson' | 'follow'

export type CameraControl = 'free' | 'follow' | 'top' | 'front' | 'right'

export interface CameraConfig {
  control?: CameraControl
  mode: CameraMode
  target: string
  distance?: number
  height?: number
  fov?: number
  defaultPosition?: Vec3
  defaultRotation?: Quat
}

export interface DirectionalLightConfig {
  direction?: Vec3
  color?: Color
  intensity?: number
}

export interface WorldSettings {
  gravity?: Vec3
  ambientLight?: Color
  directionalLight?: DirectionalLightConfig
  skyColor?: Color
  skybox?: string
  camera?: CameraConfig
}

export interface AssetRef {
  path?: string
  type?: 'texture' | 'model' | 'cubeTexture'
}

export interface TrimeshSimplificationConfig {
  enabled?: boolean  // Whether to enable simplification
  maxTriangles?: number  // Maximum triangles (e.g., 5000)
  targetReduction?: number  // Alternative: percentage to reduce (0.0-1.0, e.g., 0.5 = 50% reduction)
}

export type Shape =
  | { type: 'box'; width: number; height: number; depth: number }
  | { type: 'sphere'; radius: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'capsule'; radius: number; height: number }
  | { type: 'plane'; normal?: Vec3 }
  | { type: 'trimesh'; model: string; simplification?: TrimeshSimplificationConfig }

export interface MaterialRef {
  color?: Color
  map?: string
  roughness?: number
  metalness?: number
  // Advanced texture properties
  mapRepeat?: Vec3  // [x, y] UV repeat
  mapWrapS?: 'repeat' | 'clampToEdge' | 'mirroredRepeat'
  mapWrapT?: 'repeat' | 'clampToEdge' | 'mirroredRepeat'
  mapRotation?: number  // rotation in radians
  mapOffset?: Vec3  // [x, y] UV offset
}

export interface EntityScripts {
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
  rotation?: Quat
  scale?: Vec3
  model?: string
  material?: MaterialRef
  mass?: number
  restitution?: number
  friction?: number
  scripts?: EntityScripts
  locked?: boolean
}

export interface RennWorld {
  version: string
  world: WorldSettings
  entities: Entity[]
  assets?: Record<string, AssetRef>
  scripts?: Record<string, string>
}

export const DEFAULT_GRAVITY: Vec3 = [0, -9.81, 0]
export const DEFAULT_POSITION: Vec3 = [0, 0, 0]
export const DEFAULT_ROTATION: Quat = [0, 0, 0, 1]
export const DEFAULT_SCALE: Vec3 = [1, 1, 1]

/**
 * Complete entity pose (position and rotation)
 */
export type EntityPose = { position: Vec3; rotation: Quat }

/**
 * Partial entity pose (either position or rotation, or both)
 */
export type PartialEntityPose = { position?: Vec3; rotation?: Quat }
