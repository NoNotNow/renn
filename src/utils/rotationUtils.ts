import * as THREE from 'three'
import type { Rotation } from '@/types/world'

/**
 * Convert Euler angles (in radians) to a Three.js Quaternion.
 * Uses XYZ rotation order (Three.js default).
 * 
 * @param euler - Euler angles [x, y, z] in radians
 * @returns Three.js Quaternion
 */
export function eulerToQuaternion(euler: Rotation): THREE.Quaternion {
  const [x, y, z] = euler
  const eulerObj = new THREE.Euler(x, y, z, 'XYZ')
  return new THREE.Quaternion().setFromEuler(eulerObj)
}

/**
 * Convert a Three.js Quaternion to Euler angles (in radians).
 * Uses XYZ rotation order (Three.js default).
 * 
 * @param quaternion - Three.js Quaternion
 * @returns Euler angles [x, y, z] in radians
 */
export function quaternionToEuler(quaternion: THREE.Quaternion): Rotation {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
  return [euler.x, euler.y, euler.z]
}

/**
 * Convert Euler angles array to Rapier quaternion format {x, y, z, w}.
 * 
 * @param euler - Euler angles [x, y, z] in radians
 * @returns Rapier quaternion object
 */
export function eulerToRapierQuaternion(euler: Rotation): { x: number; y: number; z: number; w: number } {
  const quat = eulerToQuaternion(euler)
  return { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
}

/**
 * Convert Rapier quaternion format {x, y, z, w} to Euler angles.
 * 
 * @param quat - Rapier quaternion object
 * @returns Euler angles [x, y, z] in radians
 */
export function rapierQuaternionToEuler(quat: { x: number; y: number; z: number; w: number }): Rotation {
  const threeQuat = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w)
  return quaternionToEuler(threeQuat)
}
