import * as THREE from 'three'
import {
  DEFAULT_HORIZONTAL_FOV_DEG,
  HORIZONTAL_FOV_MAX_DEG,
  HORIZONTAL_FOV_MIN_DEG,
} from '@/types/world'

/** Widest vertical FOV a single perspective camera can render (just under half-space). */
export const MAX_VERTICAL_FOV_DEG = 179.9

/**
 * Vertical FOV (deg) a horizontal span of `hDeg` implies on a camera with the given
 * (width/height) aspect. Above half space (> 180°) there is nothing left a single
 * perspective projection can show, so the result saturates at the widest render.
 */
export function horizontalFovToVerticalDeg(hDeg: number, aspect: number): number {
  if (hDeg >= 180) return MAX_VERTICAL_FOV_DEG
  const half = THREE.MathUtils.degToRad(Math.max(hDeg, HORIZONTAL_FOV_MIN_DEG) / 2)
  const halfV = Math.atan(Math.tan(half) / Math.max(aspect, 1e-6)) * (180 / Math.PI)
  return THREE.MathUtils.clamp(halfV * 2, 0.1, MAX_VERTICAL_FOV_DEG)
}

/**
 * Apply the world's horizontal FOV setting to a perspective camera (recomputing the
 * vertical FOV for the camera's current aspect). Room-safe to call every frame.
 */
export function applyCameraFov(
  camera: THREE.PerspectiveCamera,
  hFovDeg: number = DEFAULT_HORIZONTAL_FOV_DEG,
): void {
  const clamped = THREE.MathUtils.clamp(
    hFovDeg,
    HORIZONTAL_FOV_MIN_DEG,
    HORIZONTAL_FOV_MAX_DEG,
  )
  const v = horizontalFovToVerticalDeg(clamped, camera.aspect)
  if (Math.abs(camera.fov - v) < 1e-4) return
  camera.fov = v
  camera.updateProjectionMatrix()
}
