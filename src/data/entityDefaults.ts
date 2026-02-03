import type { Entity, Shape, MaterialRef } from '@/types/world'
import { DEFAULT_POSITION, DEFAULT_ROTATION, DEFAULT_SCALE } from '@/types/world'
import { generateEntityId } from '@/utils/idGenerator'

export type AddableShapeType = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'plane'

const DEFAULT_SHAPES: Record<AddableShapeType, Shape> = {
  box: { type: 'box', width: 1, height: 1, depth: 1 },
  sphere: { type: 'sphere', radius: 0.5 },
  cylinder: { type: 'cylinder', radius: 0.5, height: 1 },
  capsule: { type: 'capsule', radius: 0.25, height: 1 },
  plane: { type: 'plane' },
}

const COLOR_RANGE: [number, number] = [0.2, 0.9]
const SCALE_RANGE: [number, number] = [0.6, 1.4]
const DISPLACEMENT_RANGE: [number, number] = [-0.35, 0.35]
const DISPLACEMENT_Y_RANGE: [number, number] = [0, 0.35]

function randomInRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min)
}

export function createDefaultEntity(shapeType: AddableShapeType): Entity {
  const id = generateEntityId()
  const scale = randomInRange(SCALE_RANGE)
  return {
    id,
    bodyType: 'static',
    shape: { ...DEFAULT_SHAPES[shapeType] },
    position: [
      DEFAULT_POSITION[0] + randomInRange(DISPLACEMENT_RANGE),
      DEFAULT_POSITION[1] + randomInRange(DISPLACEMENT_Y_RANGE),
      DEFAULT_POSITION[2] + randomInRange(DISPLACEMENT_RANGE),
    ],
    rotation: [...DEFAULT_ROTATION],
    scale: [DEFAULT_SCALE[0] * scale, DEFAULT_SCALE[1] * scale, DEFAULT_SCALE[2] * scale],
    material: {
      color: [
        randomInRange(COLOR_RANGE),
        randomInRange(COLOR_RANGE),
        randomInRange(COLOR_RANGE),
      ],
    },
  }
}

export function getDefaultShapeForType(shapeType: AddableShapeType): Shape {
  return { ...DEFAULT_SHAPES[shapeType] }
}
