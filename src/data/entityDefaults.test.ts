import { describe, it, expect } from 'vitest'
import { createDefaultEntity, getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import { validateWorldDocument } from '@/schema/validate'
import type { RennWorld } from '@/types/world'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

function minimalWorld(entities: RennWorld['entities']): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -9.81, 0], camera: { control: 'free', mode: 'follow', target: '', distance: 10, height: 2 } },
    entities,
  }
}

describe('createDefaultEntity', () => {
  it.each(ADDABLE_SHAPE_TYPES)('creates valid entity for shape type %s', (shapeType) => {
    const entity = createDefaultEntity(shapeType)
    expect(entity.id).toBeDefined()
    // Updated regex to match new ID format: entity_timestamp_randomstring
    expect(entity.id).toMatch(/^entity_\d+_[a-z0-9]+$/)
    expect(entity.name).toMatch(new RegExp(`^${shapeType} [a-z]+ \\d+$`))
    expect(entity.shape).toBeDefined()
    expect(entity.shape?.type).toBe(shapeType)
    expect(entity.position[0]).toBeGreaterThanOrEqual(-0.35)
    expect(entity.position[0]).toBeLessThanOrEqual(0.35)
    expect(entity.position[1]).toBeGreaterThanOrEqual(0)
    expect(entity.position[1]).toBeLessThanOrEqual(0.35)
    expect(entity.position[2]).toBeGreaterThanOrEqual(-0.35)
    expect(entity.position[2]).toBeLessThanOrEqual(0.35)
    expect(entity.rotation).toEqual([0, 0, 0, 1])
    entity.scale.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0.6)
      expect(value).toBeLessThanOrEqual(1.4)
    })
    entity.material.color.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0.1)
      expect(value).toBeLessThanOrEqual(0.95)
    })
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
