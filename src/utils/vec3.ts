import type { Vec3 } from '@/types/world'

/** Scale a vector by a scalar. Returns a new Vec3. */
export function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/**
 * Signed forward speed: velocity along forward axis (subtracts sideways).
 * Returns dot(velocity, forward); positive = forward, negative = backward.
 */
export function getForwardSpeed(velocity: Vec3, forward: Vec3): number {
  return velocity[0] * forward[0] + velocity[1] * forward[1] + velocity[2] * forward[2]
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

/**
 * Create a torque vector that rotates around `axis`.
 * `axis` is treated as a direction and normalized internally.
 */
export function createTorqueAroundAxis(axis: Vec3, torqueMagnitude: number): Vec3 {
  const axisLen = vec3Length(axis)
  if (axisLen < 1e-10) return [0, 0, 0]
  return scaleVec3(axis, torqueMagnitude / axisLen)
}
