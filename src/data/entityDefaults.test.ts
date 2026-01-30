import { describe, it, expect } from 'vitest'
import { createDefaultEntity, getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import { validateWorldDocument } from '@/schema/validate'
import type { RennWorld } from '@/types/world'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

function minimalWorld(entities: RennWorld['entities']): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -9.81, 0], camera: { mode: 'follow', target: '', distance: 10, height: 2 } },
    entities,
  }
}

describe('createDefaultEntity', () => {
  it.each(ADDABLE_SHAPE_TYPES)('creates valid entity for shape type %s', (shapeType) => {
    const entity = createDefaultEntity(shapeType)
    expect(entity.id).toBeDefined()
    expect(entity.id).toMatch(/^entity_\d+$/)
    expect(entity.shape).toBeDefined()
    expect(entity.shape?.type).toBe(shapeType)
    expect(entity.position).toEqual([0, 0, 0])
    expect(entity.rotation).toEqual([0, 0, 0, 1])
    expect(entity.scale).toEqual([1, 1, 1])
    expect(entity.material).toEqual({ color: [0.7, 0.7, 0.7] })
    expect(entity.bodyType).toBe('static')
  })

  it('produces entity that passes schema validation for each shape type', () => {
    for (const shapeType of ADDABLE_SHAPE_TYPES) {
      const entity = createDefaultEntity(shapeType)
      const world = minimalWorld([entity])
      expect(() => validateWorldDocument(world)).not.toThrow()
    }
  })
})

describe('getDefaultShapeForType', () => {
  it.each(ADDABLE_SHAPE_TYPES)('returns shape for %s', (shapeType) => {
    const shape = getDefaultShapeForType(shapeType)
    expect(shape.type).toBe(shapeType)
  })
})
