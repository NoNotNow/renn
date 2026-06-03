import * as THREE from 'three'
import type { Vec3 } from '@/types/world'

/** Scale a vector by a scalar. Returns a new Vec3. */
export function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/** Dot product of two Vec3 tuples. */
export function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** Component-wise difference **a − b**. */
export function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Cross product **a × b** (right-handed). */
export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Signed forward speed: velocity along forward axis (subtracts sideways).
 * Returns dot(velocity, forward); positive = forward, negative = backward.
 */
export function getForwardSpeed(velocity: Vec3, forward: Vec3): number {
  return dotVec3(velocity, forward)
}

const STEERING_TORQUE_SCALE = 40

export function computeSteeringTorqueMagnitude(
  speed: number,
  wheelAngle: number,
  scale = STEERING_TORQUE_SCALE,
): number {
  return speed * wheelAngle * scale
}

export function vec3Length(i:Vec3): number {
  const x = i[0]
  const y = i[1]
  const z = i[2]
  return Math.sqrt(x * x + y * y + z * z)
}

/** Treat direction as zero when length falls below this (normalize, torque on axis). */
const VEC3_NORMALIZE_EPS = 1e-10

/** Unit vector in the direction of `v`; `[0, 0, 0]` when length is negligible (below ~1e-10). */
export function normalizeVec3(v: Vec3): Vec3 {
  const len = vec3Length(v)
  if (len < VEC3_NORMALIZE_EPS) return [0, 0, 0]
  return scaleVec3(v, 1 / len)
}

/**
 * Create a torque vector that rotates around `axis`.
 * `axis` is treated as a direction and normalized internally.
 */
export function createTorqueAroundAxis(axis: Vec3, torqueMagnitude: number): Vec3 {
  const axisLen = vec3Length(axis)
  if (axisLen < VEC3_NORMALIZE_EPS) return [0, 0, 0]
  return scaleVec3(axis, torqueMagnitude / axisLen)
}

/**
 * Project `vec` onto the plane perpendicular to `planeNormal` (normal is normalized internally).
 * When `planeNormal` is negligible, returns a copy of `vec`.
 */
export function projectVec3OntoPlane(vec: Vec3, planeNormal: Vec3): Vec3 {
  const n = normalizeVec3(planeNormal)
  if (n[0] === 0 && n[1] === 0 && n[2] === 0) {
    return [vec[0], vec[1], vec[2]]
  }
  const alongNormal = dotVec3(vec, n)
  return subtractVec3(vec, scaleVec3(n, alongNormal))
}

/**
 * Rotate `vec` by `angleRad` radians around `axis` (axis direction normalized internally).
 * Returns `[0, 0, 0]` when axis length is negligible.
 */
export function rotateVec3AroundAxis(vec: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const axisLen = vec3Length(axis)
  if (axisLen < VEC3_NORMALIZE_EPS) return [0, 0, 0]
  const v = new THREE.Vector3(vec[0], vec[1], vec[2])
  const ax = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize()
  v.applyAxisAngle(ax, angleRad)
  return [v.x, v.y, v.z]
}
