import type { Vec3 } from '@/types/world'

const DEG = Math.PI / 180

/** Default direction when input is zero-length. */
const DEFAULT_DIRECTION: Vec3 = [1, 2, 1]

/**
 * Convert direction Vec3 to spherical angles in degrees.
 * Azimuth 0° = +Z, 90° = +X. Elevation 0° = horizon, 90° = overhead.
 */
export function directionToSpherical(direction: Vec3): { azimuth: number; elevation: number } {
  const [x, y, z] = direction
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < 1e-6) {
    const def = directionToSpherical(DEFAULT_DIRECTION)
    return def
  }
  const elevation = Math.asin(Math.max(-1, Math.min(1, y / len))) / DEG
  let azimuth = Math.atan2(x, z) / DEG
  if (azimuth < 0) azimuth += 360
  return { azimuth, elevation }
}

/**
 * Convert azimuth and elevation (degrees) to direction Vec3.
 * Azimuth 0° = +Z, 90° = +X. Elevation 0° = horizon, 90° = overhead.
 */
export function sphericalToDirection(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const cosEl = Math.cos(el)
  const x = cosEl * Math.sin(az)
  const z = cosEl * Math.cos(az)
  const y = Math.sin(el)
  return [x, y, z]
}
