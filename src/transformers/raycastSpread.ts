import type { RaycastResult } from '@/physics/rapierPhysics'
import type { Vec3 } from '@/types/world'
import { rightFromForwardVec3, scaleVec3 } from '@/utils/vec3'

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export type TransformerRaycastFn = (
  origin: Vec3,
  direction: Vec3,
  maxDistance?: number,
  options?: { visualize?: boolean; hitColor?: string; missColor?: string },
) => RaycastResult

/**
 * Cast parallel rays spread sideways; returns closest hit or center-ray fallback (hunt multiRaycast behavior).
 */
export function raycastSpreadImpl(
  raycast: TransformerRaycastFn,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  spreadWidth: number,
  rayCount: number,
  options?: { visualize?: boolean; hitColor?: string; missColor?: string },
): RaycastResult {
  const right = rightFromForwardVec3(direction)
  const hits: RaycastResult[] = []

  for (let i = 0; i < rayCount; i++) {
    const t = rayCount === 1 ? 0 : (i / (rayCount - 1)) * 2 - 1
    const offset = scaleVec3(right, t * spreadWidth)
    const rayOrigin = addVec3(origin, offset)
    const cast = raycast(rayOrigin, direction, maxDistance, options)
    if (cast.hit) hits.push(cast)
  }

  hits.sort((a, b) => a.distance - b.distance)
  return hits[0] ?? raycast(origin, direction, maxDistance, options)
}
