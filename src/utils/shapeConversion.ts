import type { Shape } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'

const MIN_SIZE = 0.01

const SIZED_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule']

/**
 * Returns a single "characteristic size" for box/sphere/cylinder/capsule so that
 * when switching shape type we can preserve relative scale. Returns null for plane/trimesh.
 */
export function getCharacteristicSize(shape: Shape | undefined): number | null {
  if (!shape) return null
  switch (shape.type) {
    case 'box':
      return Math.pow(shape.width * shape.height * shape.depth, 1 / 3)
    case 'sphere':
      return shape.radius
    case 'cylinder':
      return Math.pow(shape.radius * shape.radius * shape.height, 1 / 3)
    case 'capsule':
      return Math.pow(shape.radius * shape.radius * (shape.height + 2 * shape.radius), 1 / 3)
    case 'plane':
    case 'trimesh':
      return null
  }
}

function clampSize(size: number): number {
  return Math.max(MIN_SIZE, size)
}

/**
 * Returns the new shape for the given type, preserving characteristic size when
 * switching between box/sphere/cylinder/capsule. Uses default shape for plane/trimesh
 * or when current shape has no size.
 */
export function shapeWithPreservedSize(
  currentShape: Shape | undefined,
  newType: AddableShapeType
): Shape {
  const size = getCharacteristicSize(currentShape)
  if (size === null || !SIZED_TYPES.includes(newType)) {
    return getDefaultShapeForType(newType)
  }
  const s = clampSize(size)
  switch (newType) {
    case 'box':
      return { type: 'box', width: s, height: s, depth: s }
    case 'sphere':
      return { type: 'sphere', radius: s }
    case 'cylinder':
      return { type: 'cylinder', radius: s, height: s }
    case 'capsule':
      return { type: 'capsule', radius: s / 2, height: s }
    case 'plane':
    case 'trimesh':
      return getDefaultShapeForType(newType)
  }
}
