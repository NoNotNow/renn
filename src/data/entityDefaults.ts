import type { Entity, Shape } from '@/types/world'
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

const SCALE_RANGE: [number, number] = [0.6, 1.4]
const DISPLACEMENT_RANGE: [number, number] = [-0.35, 0.35]
const DISPLACEMENT_Y_RANGE: [number, number] = [0, 0.35]
const COLOR_PALETTE = [
  { name: 'red', color: [0.86, 0.2, 0.2] as const },
  { name: 'orange', color: [0.92, 0.45, 0.1] as const },
  { name: 'yellow', color: [0.95, 0.82, 0.2] as const },
  { name: 'green', color: [0.22, 0.72, 0.35] as const },
  { name: 'blue', color: [0.2, 0.45, 0.9] as const },
  { name: 'purple', color: [0.55, 0.35, 0.85] as const },
  { name: 'pink', color: [0.9, 0.35, 0.62] as const },
] as const

const nameCounters = new Map<string, number>()

function randomInRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min)
}

function pickRandomColor() {
  const index = Math.floor(Math.random() * COLOR_PALETTE.length)
  return COLOR_PALETTE[index]
}

export function createDefaultEntity(shapeType: AddableShapeType): Entity {
  const id = generateEntityId()
  const scale = randomInRange(SCALE_RANGE)
  const { name: colorName, color } = pickRandomColor()
  const nameKey = `${shapeType}-${colorName}`
  const entityNumber = (nameCounters.get(nameKey) ?? 0) + 1
  nameCounters.set(nameKey, entityNumber)
  return {
    id,
    name: `${shapeType} ${colorName} ${entityNumber}`,
    bodyType: 'static',
    shape: { ...DEFAULT_SHAPES[shapeType] },
    position: [
      DEFAULT_POSITION[0] + randomInRange(DISPLACEMENT_RANGE),
      DEFAULT_POSITION[1] + randomInRange(DISPLACEMENT_Y_RANGE),
      DEFAULT_POSITION[2] + randomInRange(DISPLACEMENT_RANGE),
    ],
    rotation: [...DEFAULT_ROTATION],
    scale: [DEFAULT_SCALE[0] * scale, DEFAULT_SCALE[1] * scale, DEFAULT_SCALE[2] * scale],
    material: { color: [...color] },
  }
}

export function getDefaultShapeForType(shapeType: AddableShapeType): Shape {
  return { ...DEFAULT_SHAPES[shapeType] }
}
