import { describe, it, expect } from 'vitest'
import { validateWorldDocument, getValidationErrors } from '@/schema/validate'
import { sampleWorld } from '@/data/sampleWorld'
import { createDefaultEntity, type AddableShapeType } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'

function worldWithOneEntityPerShape(): RennWorld {
  const types: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'cone', 'pyramid', 'ring', 'plane']
  const entities = types.map((t) => createDefaultEntity(t))
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      camera: { control: 'free', mode: 'follow', target: entities[0].id, distance: 10, height: 2 },
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
      world: { camera: { control: 'free', mode: 'follow', target: '' } },
      entities: [{ bodyType: 'static' }],
    }
    expect(() => validateWorldDocument(invalid)).toThrow(/Invalid world/)
  })

  it('throws for invalid entity shape structure', () => {
    const invalid: unknown = {
      version: '1.0',
      world: { camera: { control: 'free', mode: 'follow', target: '' } },
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

  it('embeds failing instancePath and offending value for additionalProperties', () => {
    const invalid = structuredClone(sampleWorld) as unknown as any
    invalid.entities[0].material = { ...(invalid.entities[0].material ?? {}), bogus: 123 }

    expect(() => validateWorldDocument(invalid)).toThrow(/Invalid world/)
    expect(() => validateWorldDocument(invalid)).toThrow(/\/entities\/0\/material/)
    expect(() => validateWorldDocument(invalid)).toThrow(/value:/)
    expect(() => validateWorldDocument(invalid)).toThrow(/bogus/)
  })

  it('can tolerate additionalProperties by stripping unknown keys', () => {
    const invalid = structuredClone(sampleWorld) as unknown as any
    invalid.entities[0].material = { ...(invalid.entities[0].material ?? {}), bogus: 123 }

    expect(() =>
      validateWorldDocument(invalid, {
        tolerateAdditionalProperties: true,
        logAdditionalProperties: false,
      })
    ).not.toThrow()

    expect(invalid.entities[0].material).not.toHaveProperty('bogus')
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
