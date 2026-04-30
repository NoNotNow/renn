import * as THREE from 'three'

export function clampInterpolationAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1
  return Math.min(1, Math.max(0, alpha))
}

export function interpolateVisualPose(
  outPosition: THREE.Vector3,
  outRotation: THREE.Quaternion,
  previousPosition: THREE.Vector3,
  currentPosition: THREE.Vector3,
  previousRotation: THREE.Quaternion,
  currentRotation: THREE.Quaternion,
  alpha: number,
): void {
  const t = clampInterpolationAlpha(alpha)
  outPosition.lerpVectors(previousPosition, currentPosition, t)
  outRotation.slerpQuaternions(previousRotation, currentRotation, t)
}
