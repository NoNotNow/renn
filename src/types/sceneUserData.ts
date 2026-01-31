import type * as THREE from 'three'
import type { RennWorld, Vec3, CameraConfig } from './world'

/**
 * Typed userData for Three.js Scene objects.
 * This provides type safety for accessing scene.userData properties.
 */
export interface SceneUserData {
  gravity?: Vec3
  directionalLight?: THREE.DirectionalLight
  camera?: CameraConfig
  world?: RennWorld
}

/**
 * Type guard to safely access scene userData
 */
export function getSceneUserData(scene: THREE.Scene): SceneUserData {
  return scene.userData as SceneUserData
}

/**
 * Typed userData for Three.js mesh objects representing entities.
 */
export interface EntityMeshUserData {
  entityId: string
}

/**
 * Type guard to check if an object has entity userData
 */
export function hasEntityId(userData: Record<string, unknown>): userData is EntityMeshUserData {
  return typeof userData.entityId === 'string'
}
