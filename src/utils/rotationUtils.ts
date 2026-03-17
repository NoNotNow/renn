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
 * World-space forward direction from Euler rotation (Three.js -Z axis).
 *
 * @param rotation - Euler angles [x, y, z] in radians
 * @returns Unit forward vector [x, y, z]
 */
export function getForwardVectorFromEuler(rotation: Rotation): [number, number, number] {
  const [rx, ry, rz] = rotation
  const euler = new THREE.Euler(rx, ry, rz, 'XYZ')
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(euler)
  return [fwd.x, fwd.y, fwd.z]
}

/**
 * World-space up direction from Euler rotation (Three.js Y axis).
 */
export function getUpVectorFromEuler(rotation: Rotation): [number, number, number] {
  const [rx, ry, rz] = rotation
  const euler = new THREE.Euler(rx, ry, rz, 'XYZ')
  const up = new THREE.Vector3(0, 1, 0).applyEuler(euler)
  return [up.x, up.y, up.z]
}

/**
 * Euler delta to rotate by angle (radians) around a world-space axis.
 * currentRotation + returned delta = rotation after applying the turn.
 */
export function eulerDeltaAroundAxis(
  currentRotation: Rotation,
  axis: [number, number, number],
  angleRad: number,
): Rotation {
  const currentQ = eulerToQuaternion(currentRotation)
  const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize()
  const deltaQ = new THREE.Quaternion().setFromAxisAngle(axisVec, angleRad)
  const newQ = deltaQ.clone().multiply(currentQ)
  const newEuler = quaternionToEuler(newQ)
  return [
    newEuler[0] - currentRotation[0],
    newEuler[1] - currentRotation[1],
    newEuler[2] - currentRotation[2],
  ]
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

/**
 * World-space up direction from a Rapier quaternion (body's local Y in world space).
 */
export function getUpVectorFromRapierQuaternion(quat: {
  x: number
  y: number
  z: number
  w: number
}): [number, number, number] {
  const q = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
  return [up.x, up.y, up.z]
}
