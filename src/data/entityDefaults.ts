import type { Entity, Shape, Color, Vec3, Quat } from '@/types/world'
import { DEFAULT_POSITION, DEFAULT_ROTATION, DEFAULT_SCALE } from '@/types/world'
import { generateEntityId } from '@/utils/idGenerator'

export type AddableShapeType = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'plane' | 'trimesh'

const DEFAULT_SHAPES: Record<AddableShapeType, Shape> = {
  box: { type: 'box', width: 1, height: 1, depth: 1 },
  sphere: { type: 'sphere', radius: 0.5 },
  cylinder: { type: 'cylinder', radius: 0.5, height: 1 },
  capsule: { type: 'capsule', radius: 0.25, height: 1 },
  plane: { type: 'plane' },
  trimesh: { type: 'trimesh', model: '' },
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

export function randomInRangeUtil(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pickRandomColor() {
  const index = Math.floor(Math.random() * COLOR_PALETTE.length)
  return COLOR_PALETTE[index]
}

export function pickRandomColorUtil(): { name: string; color: readonly [number, number, number] } {
  return pickRandomColor()
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

export interface BulkEntityParams {
  count: number
  shape: AddableShapeType | 'random'
  bodyType: 'static' | 'dynamic' | 'kinematic' | 'random'
  size: { mode: 'fixed'; value: number } | { mode: 'random'; min: number; max: number }
  position: { mode: 'fixed'; x: number; y: number; z: number } | { mode: 'random'; radius: number; yMin?: number; yMax?: number }
  color: { mode: 'fixed'; value: Color } | { mode: 'random' }
  rotation: { mode: 'default' } | { mode: 'random' }
  physics: {
    mass?: { mode: 'fixed'; value: number } | { mode: 'random'; min: number; max: number }
    friction?: { mode: 'fixed'; value: number } | { mode: 'random'; min: number; max: number }
    restitution?: { mode: 'fixed'; value: number } | { mode: 'random'; min: number; max: number }
  }
}

export function generateRandomPosition(radius: number, yMin: number = 0, yMax?: number): Vec3 {
  // Use circular distribution for x-z plane
  const angle = Math.random() * Math.PI * 2
  const distance = Math.random() * radius
  const x = Math.cos(angle) * distance
  const z = Math.sin(angle) * distance
  // If yMax is provided, randomize Y between yMin and yMax, otherwise use yMin
  const y = yMax !== undefined ? randomInRangeUtil(yMin, yMax) : yMin
  return [x, y, z]
}

export function generateRandomRotation(): Quat {
  // Generate random quaternion
  const u1 = Math.random()
  const u2 = Math.random()
  const u3 = Math.random()
  
  const sqrt1MinusU1 = Math.sqrt(1 - u1)
  const sqrtU1 = Math.sqrt(u1)
  
  return [
    sqrt1MinusU1 * Math.sin(2 * Math.PI * u2),
    sqrt1MinusU1 * Math.cos(2 * Math.PI * u2),
    sqrtU1 * Math.sin(2 * Math.PI * u3),
    sqrtU1 * Math.cos(2 * Math.PI * u3),
  ]
}

function pickRandomShape(): AddableShapeType {
  const shapes: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule']
  return shapes[Math.floor(Math.random() * shapes.length)]
}

function pickRandomBodyType(): 'static' | 'dynamic' | 'kinematic' {
  const types: ('static' | 'dynamic' | 'kinematic')[] = ['static', 'dynamic', 'kinematic']
  return types[Math.floor(Math.random() * types.length)]
}

export function createBulkEntities(params: BulkEntityParams): Entity[] {
  const entities: Entity[] = []
  const nameCounters = new Map<string, number>()

  for (let i = 0; i < params.count; i++) {
    const id = generateEntityId()
    
    // Determine shape
    const shapeType = params.shape === 'random' ? pickRandomShape() : params.shape
    const shape = { ...DEFAULT_SHAPES[shapeType] }
    
    // Determine body type
    const bodyType = params.bodyType === 'random' ? pickRandomBodyType() : params.bodyType
    
    // Determine size/scale
    let scale: Vec3
    if (params.size.mode === 'fixed') {
      scale = [params.size.value, params.size.value, params.size.value]
    } else {
      const scaleValue = randomInRangeUtil(params.size.min, params.size.max)
      scale = [scaleValue, scaleValue, scaleValue]
    }
    
    // Determine position
    let position: Vec3
    if (params.position.mode === 'fixed') {
      position = [params.position.x, params.position.y, params.position.z]
    } else {
      position = generateRandomPosition(
        params.position.radius, 
        params.position.yMin ?? 0,
        params.position.yMax
      )
    }
    
    // Determine rotation
    const rotation: Quat = params.rotation.mode === 'default' 
      ? [...DEFAULT_ROTATION] 
      : generateRandomRotation()
    
    // Determine color
    let color: Color
    let colorName: string
    if (params.color.mode === 'fixed') {
      color = [...params.color.value] as Color
      colorName = 'custom'
    } else {
      const { name, color: randomColor } = pickRandomColorUtil()
      color = [...randomColor] as Color
      colorName = name
    }
    const nameKey = `${shapeType}-${colorName}`
    const entityNumber = (nameCounters.get(nameKey) ?? 0) + 1
    nameCounters.set(nameKey, entityNumber)
    
    // Build entity
    const entity: Entity = {
      id,
      name: `${shapeType} ${colorName} ${entityNumber}`,
      bodyType,
      shape,
      position,
      rotation,
      scale,
      material: { color },
    }
    
    // Add physics properties if specified
    if (params.physics.mass) {
      entity.mass = params.physics.mass.mode === 'fixed' 
        ? params.physics.mass.value 
        : randomInRangeUtil(params.physics.mass.min, params.physics.mass.max)
    }
    
    if (params.physics.friction !== undefined) {
      entity.friction = params.physics.friction.mode === 'fixed'
        ? params.physics.friction.value
        : randomInRangeUtil(params.physics.friction.min, params.physics.friction.max)
    }
    
    if (params.physics.restitution !== undefined) {
      entity.restitution = params.physics.restitution.mode === 'fixed'
        ? params.physics.restitution.value
        : randomInRangeUtil(params.physics.restitution.min, params.physics.restitution.max)
    }
    
    entities.push(entity)
  }
  
  return entities
}
