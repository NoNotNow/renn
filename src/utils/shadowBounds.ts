import type { Entity } from '@/types/world'

const PLANE_GEOMETRY_SIZE = 100
/**
 * Directional light shadows use an orthographic camera with `left/right/top/bottom`
 * defining the 2D extent in light-space. We approximate the needed extent by
 * using the visual plane geometry's X/Z span.
 *
 * PlaneGeometry in `createPrimitive` is `PlaneGeometry(size * 2, size * 2)` where
 * `size = 100`, then the mesh is rotated to lie flat on the XZ (ground) plane.
 * So:
 * - half-width along world X ~= 100 * abs(scale.x)
 * - half-width along world Z ~= 100 * abs(scale.y)  (because local Y maps to world Z)
 */
export function computeDirectionalShadowCameraExtent(
  entities: Entity[],
  opts?: {
    paddingMultiplier?: number
    minExtent?: number
  },
): number {
  const paddingMultiplier = opts?.paddingMultiplier ?? 1.1
  const minExtent = opts?.minExtent ?? 40

  let maxBound = 0

  for (const entity of entities) {
    if (entity.shape?.type !== 'plane') continue

    const [px, _py, pz] = entity.position ?? [0, 0, 0]
    const [sx, sy] = entity.scale ?? [1, 1, 1]

    const halfX = PLANE_GEOMETRY_SIZE * Math.abs(sx)
    const halfZ = PLANE_GEOMETRY_SIZE * Math.abs(sy)

    const boundX = Math.abs(px) + halfX
    const boundZ = Math.abs(pz) + halfZ
    const bound = Math.max(boundX, boundZ)

    if (bound > maxBound) maxBound = bound
  }

  const padded = maxBound * paddingMultiplier
  return Math.max(padded || 0, minExtent)
}

