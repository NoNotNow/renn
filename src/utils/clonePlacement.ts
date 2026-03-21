import type { Entity, Vec3, Rotation } from '@/types/world'
import { DEFAULT_SCALE } from '@/types/world'
import { eulerRotateLocalVector } from '@/utils/rotationUtils'

/** Gap between clone and source along the horizontal offset (world units). */
export const CLONE_PLANE_GAP = 0.03

const FLATTEN_EPS = 1e-6

function normalizeXZ(x: number, z: number): { x: number; z: number } | null {
  const len = Math.hypot(x, z)
  if (len < FLATTEN_EPS) return null
  return { x: x / len, z: z / len }
}

/**
 * Unit direction in the XZ plane for placing a clone beside the source: local +X, else +Z, else world +X.
 */
export function horizontalCloneSideDirection(rotation: Rotation): { x: number; z: number } {
  const right = eulerRotateLocalVector(rotation, [1, 0, 0])
  let flat = normalizeXZ(right[0], right[2])
  if (flat) return flat

  const forwardZ = eulerRotateLocalVector(rotation, [0, 0, 1])
  flat = normalizeXZ(forwardZ[0], forwardZ[2])
  if (flat) return flat

  return { x: 1, z: 0 }
}

/**
 * Conservative horizontal half-extent for clone spacing (same shape/scale as source).
 */
export function estimateHorizontalHalfExtent(entity: Entity): number {
  const sx = entity.scale?.[0] ?? DEFAULT_SCALE[0]
  const sz = entity.scale?.[2] ?? DEFAULT_SCALE[2]
  const shape = entity.shape

  if (!shape) return 0.5

  switch (shape.type) {
    case 'box':
      return 0.5 * Math.max(shape.width * sx, shape.depth * sz)
    case 'sphere':
      return shape.radius * Math.max(sx, sz)
    case 'cylinder':
    case 'capsule':
    case 'cone':
      return shape.radius * Math.max(sx, sz)
    case 'pyramid':
      return 0.5 * shape.baseSize * Math.max(sx, sz)
    case 'ring':
      return shape.outerRadius * Math.max(sx, sz)
    case 'plane':
      return 0.5
    case 'trimesh':
      return 0.5
    default:
      return 0.5
  }
}

/**
 * World position for a clone: same Y as pose, offset in XZ along the side direction.
 */
export function computeCloneWorldPosition(
  source: Entity,
  pose: { position: Vec3; rotation: Rotation },
): Vec3 {
  const [px, py, pz] = pose.position
  const dir = horizontalCloneSideDirection(pose.rotation)
  const r = estimateHorizontalHalfExtent(source)
  const separation = 2 * r + CLONE_PLANE_GAP
  return [px + dir.x * separation, py, pz + dir.z * separation]
}
