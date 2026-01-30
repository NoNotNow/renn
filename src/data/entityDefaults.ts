import type { Entity, Shape } from '@/types/world'
import { DEFAULT_POSITION, DEFAULT_ROTATION, DEFAULT_SCALE } from '@/types/world'

export type AddableShapeType = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'plane'

const DEFAULT_SHAPES: Record<AddableShapeType, Shape> = {
  box: { type: 'box', width: 1, height: 1, depth: 1 },
  sphere: { type: 'sphere', radius: 0.5 },
  cylinder: { type: 'cylinder', radius: 0.5, height: 1 },
  capsule: { type: 'capsule', radius: 0.25, height: 1 },
  plane: { type: 'plane' },
}

export function createDefaultEntity(shapeType: AddableShapeType): Entity {
  const id = `entity_${Date.now()}`
  return {
    id,
    bodyType: 'static',
    shape: { ...DEFAULT_SHAPES[shapeType] },
    position: [...DEFAULT_POSITION],
    rotation: [...DEFAULT_ROTATION],
    scale: [...DEFAULT_SCALE],
    material: { color: [0.7, 0.7, 0.7] },
  }
}

export function getDefaultShapeForType(shapeType: AddableShapeType): Shape {
  return { ...DEFAULT_SHAPES[shapeType] }
}
