import type { Entity, Shape } from '@/types/world'
import { DEFAULT_SCALE } from '@/types/world'

/** Default plane extent when the shape has no dimensions (matches test helper plane mesh). */
const PLANE_NOMINAL_SPAN = 10

/** Ring height fallback when omitted (see entityDefaults ring default). */
const RING_DEFAULT_HEIGHT = 0.1

/**
 * Max axis scale magnitude (uniform-ish multiplier for list filtering).
 */
function maxScaleAxis(scale: NonNullable<Entity['scale']>): number {
  return Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]))
}

/**
 * Largest local axis extent of the shape (before entity scale).
 */
function localCharacteristicLength(shape: Shape): number {
  switch (shape.type) {
    case 'box':
      return Math.max(shape.width, shape.height, shape.depth)
    case 'sphere':
      return 2 * shape.radius
    case 'cylinder':
    case 'capsule':
    case 'cone':
      return Math.max(2 * shape.radius, shape.height)
    case 'pyramid':
      return Math.max(shape.baseSize, shape.height)
    case 'ring': {
      const h = shape.height ?? RING_DEFAULT_HEIGHT
      return Math.max(2 * shape.outerRadius, h)
    }
    case 'plane':
      return PLANE_NOMINAL_SPAN
    case 'trimesh':
      return 1
  }
}

/**
 * Approximate max world extent for entity list filtering (not a physics AABB).
 * Trimesh and model-only entities without shape use scale only as a weak proxy.
 */
export function getEntityApproximateSize(entity: Entity): number {
  const scale = entity.scale ?? DEFAULT_SCALE
  const s = maxScaleAxis(scale)
  const shape = entity.shape
  if (!shape) {
    return s
  }
  return localCharacteristicLength(shape) * s
}
