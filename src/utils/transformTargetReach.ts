/**
 * Shared reach detection for waypoint / wanderer target logic.
 */

import type { Rotation, Vec3 } from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'

export function positionReached(a: Vec3, b: Vec3, eps: number): boolean {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= eps
}

export function rotationReached(a: Rotation, b: Rotation, epsRad: number): boolean {
  const qa = eulerToQuaternion(a)
  const qb = eulerToQuaternion(b)
  const dot = Math.min(1, Math.abs(qa.dot(qb)))
  const angle = 2 * Math.acos(dot)
  return angle <= epsRad
}

export function poseReached(
  pos: Vec3,
  rot: Rotation,
  target: { position: Vec3; rotation: Rotation },
  posEps: number,
  rotEps: number,
): boolean {
  return positionReached(pos, target.position, posEps) && rotationReached(rot, target.rotation, rotEps)
}
