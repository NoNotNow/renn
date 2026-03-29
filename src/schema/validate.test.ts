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

  it('tolerates extra inputMapping.keyboard keys (e.g. arrow keys)', () => {
    const w = structuredClone(sampleWorld) as unknown as any
    w.entities[0].transformers = [
      {
        type: 'input',
        priority: 0,
        enabled: true,
        inputMapping: {
          keyboard: {
            w: 'pitch_forward',
            s: 'pitch_back',
            a: 'roll_left',
            d: 'roll_right',
            arrowUp: 'pitch_forward',
            arrowDown: 'pitch_back',
          },
        },
      },
    ]
    expect(() =>
      validateWorldDocument(w, { tolerateAdditionalProperties: true, logAdditionalProperties: false })
    ).not.toThrow()
    expect(w.entities[0].transformers[0].inputMapping.keyboard).not.toHaveProperty('arrowUp')
  })

  it('appends warningsOut when stripping unknown fields', () => {
    const invalid = structuredClone(sampleWorld) as unknown as any
    invalid.entities[0].material = { ...(invalid.entities[0].material ?? {}), bogus: 123 }
    const warnings: string[] = []
    validateWorldDocument(invalid, {
      tolerateAdditionalProperties: true,
      logAdditionalProperties: false,
      warningsOut: warnings,
    })
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/Unknown or deprecated fields/)
    expect(warnings[0]).toMatch(/bogus/)
  })

  it('accepts trimesh simplification maxError above 1', () => {
    const w = {
      version: '1.0' as const,
      world: { camera: { control: 'free' as const, mode: 'follow' as const, target: '', distance: 10, height: 2 } },
      entities: [
        {
          id: 'plane_trimesh',
          shape: {
            type: 'trimesh' as const,
            model: 'Neat_Model',
            simplification: {
              enabled: true,
              maxTriangles: 1057,
              algorithm: 'meshoptimizer' as const,
              maxError: 5,
            },
          },
        },
      ],
    }
    expect(() => validateWorldDocument(w)).not.toThrow()
    const shape = w.entities[0].shape as Extract<RennWorld['entities'][0]['shape'], { type: 'trimesh' }>
    expect(shape.simplification?.maxError).toBe(5)
  })

  it('tolerates extra keyboard keys even when parent objects are frozen (deep clone strip)', () => {
    const w = structuredClone(sampleWorld) as unknown as any
    const keyboard = { w: 'pitch_forward', arrowUp: 'pitch_forward' }
    Object.freeze(keyboard)
    w.entities[0].transformers = [
      {
        type: 'input',
        priority: 0,
        enabled: true,
        inputMapping: { keyboard },
      },
    ]
    Object.freeze(w.entities[0].transformers[0].inputMapping)
    expect(() =>
      validateWorldDocument(w, { tolerateAdditionalProperties: true, logAdditionalProperties: false })
    ).not.toThrow()
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
