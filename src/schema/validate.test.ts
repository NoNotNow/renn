import { describe, it, expect } from 'vitest'
import { validateWorldDocument, getValidationErrors } from '@/schema/validate'
import { sampleWorld } from '@/data/sampleWorld'
import { createDefaultEntity, type AddableShapeType } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'

function worldWithOneEntityPerShape(): RennWorld {
  const types: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']
  const entities = types.map((t) => createDefaultEntity(t))
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      camera: { mode: 'follow', target: entities[0].id, distance: 10, height: 2 },
    },
    entities,
  }
}

describe('validateWorldDocument', () => {
  it('does not throw for sampleWorld', () => {
    expect(() => validateWorldDocument(sampleWorld)).not.toThrow()
  })

  it('does not throw for world with one entity per addable shape type', () => {
    const world = worldWithOneEntityPerShape()
    expect(() => validateWorldDocument(world)).not.toThrow()
  })

  it('throws for payload missing required "id" on entity', () => {
    const invalid = {
      version: '1.0',
      world: { camera: { mode: 'follow', target: '' } },
      entities: [{ bodyType: 'static' }],
    }
    expect(() => validateWorldDocument(invalid)).toThrow(/Invalid world/)
  })

  it('throws for invalid entity shape structure', () => {
    const invalid: unknown = {
      version: '1.0',
      world: { camera: { mode: 'follow', target: '' } },
      entities: [
        {
          id: 'bad',
          shape: { type: 'box', width: 1 },
          // missing height, depth for box
        },
      ],
    }
    expect(() => validateWorldDocument(invalid)).toThrow(/Invalid world/)
  })
})

describe('getValidationErrors', () => {
  it('returns empty array for valid world', () => {
    const errors = getValidationErrors(sampleWorld)
    expect(errors).toEqual([])
  })

  it('returns error messages for invalid world', () => {
    const invalid = { version: '1.0', world: {}, entities: [{}] }
    const errors = getValidationErrors(invalid)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('id') || e.includes('required'))).toBe(true)
  })
})
