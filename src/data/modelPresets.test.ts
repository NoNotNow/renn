import { describe, it, expect } from 'vitest'
import type { Entity, ModelPreset } from '@/types/world'
import { extractPresetFromEntity, applyPresetToEntity } from './modelPresets'

function baseEntity(): Entity {
  return {
    id: 'e1',
    name: 'Test',
    bodyType: 'dynamic',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [0, 0, 0],
  }
}

describe('extractPresetFromEntity', () => {
  it('builds preset with id, name, createdAt and only defined entity fields', () => {
    const entity: Entity = {
      ...baseEntity(),
      model: 'cube.glb',
      modelRotation: [0.1, 0.2, 0.3],
      modelScale: [2, 2, 2],
      material: { color: [0.5, 0.5, 0.5] },
      scale: [1, 2, 3],
    }

    const preset = extractPresetFromEntity(entity, 'My Cube', 12345)

    expect(typeof preset.id).toBe('string')
    expect(preset.id.length).toBeGreaterThan(0)
    expect(preset.name).toBe('My Cube')
    expect(preset.createdAt).toBe(12345)
    expect(preset.model).toBe('cube.glb')
    expect(preset.modelRotation).toEqual([0.1, 0.2, 0.3])
    expect(preset.modelScale).toEqual([2, 2, 2])
    expect(preset.material).toEqual({ color: [0.5, 0.5, 0.5] })
    expect(preset.shape).toEqual({ type: 'box', width: 1, height: 1, depth: 1 })
    expect(preset.scale).toEqual([1, 2, 3])
  })

  it('omits undefined entity fields from preset', () => {
    const entity = baseEntity()
    const preset = extractPresetFromEntity(entity, 'Plain')

    expect(preset.model).toBeUndefined()
    expect(preset.modelRotation).toBeUndefined()
    expect(preset.modelScale).toBeUndefined()
    expect(preset.material).toBeUndefined()
    expect(preset.scale).toBeUndefined()
    expect(preset.shape).toEqual({ type: 'box', width: 1, height: 1, depth: 1 })
    expect(preset).not.toHaveProperty('modelSimplification')
  })

  it('deep-clones array and object fields (no shared refs)', () => {
    const entity: Entity = {
      ...baseEntity(),
      modelRotation: [1, 2, 3],
      modelScale: [4, 5, 6],
      scale: [7, 8, 9],
      material: { color: [0.1, 0.2, 0.3] },
    }

    const preset = extractPresetFromEntity(entity, 'Refs')

    expect(preset.modelRotation).not.toBe(entity.modelRotation)
    expect(preset.modelScale).not.toBe(entity.modelScale)
    expect(preset.scale).not.toBe(entity.scale)
    expect(preset.material).not.toBe(entity.material)
    expect(preset.shape).not.toBe(entity.shape)
  })

  it('uses Date.now by default for createdAt', () => {
    const before = Date.now()
    const preset = extractPresetFromEntity(baseEntity(), 'auto')
    const after = Date.now()
    expect(preset.createdAt).toBeGreaterThanOrEqual(before)
    expect(preset.createdAt).toBeLessThanOrEqual(after)
  })
})

describe('applyPresetToEntity', () => {
  it('writes only fields present on preset, leaves others untouched', () => {
    const entity: Entity = {
      ...baseEntity(),
      mass: 5,
      friction: 0.8,
      material: { color: [1, 0, 0] },
    }
    const preset: ModelPreset = {
      id: 'p1',
      name: 'override',
      createdAt: 0,
      shape: { type: 'sphere', radius: 2 },
    }

    const next = applyPresetToEntity(entity, preset)

    expect(next.shape).toEqual({ type: 'sphere', radius: 2 })
    expect(next.mass).toBe(5)
    expect(next.friction).toBe(0.8)
    expect(next.material).toEqual({ color: [1, 0, 0] })
  })

  it('does not mutate the source entity', () => {
    const entity: Entity = {
      ...baseEntity(),
      material: { color: [1, 0, 0] },
    }
    const preset: ModelPreset = {
      id: 'p1',
      name: 'x',
      createdAt: 0,
      material: { color: [0, 1, 0] },
    }

    const next = applyPresetToEntity(entity, preset)

    expect(entity.material).toEqual({ color: [1, 0, 0] })
    expect(next.material).toEqual({ color: [0, 1, 0] })
    expect(next).not.toBe(entity)
  })

  it('removes entity fields when preset has the key set explicitly to undefined', () => {
    const entity: Entity = {
      ...baseEntity(),
      model: 'cube.glb',
      modelScale: [2, 2, 2],
    }
    const preset: ModelPreset = {
      id: 'p1',
      name: 'strip',
      createdAt: 0,
      model: undefined,
      modelScale: undefined,
    }

    const next = applyPresetToEntity(entity, preset)

    expect(next).not.toHaveProperty('model')
    expect(next).not.toHaveProperty('modelScale')
  })

  it('deep-clones written array/object fields', () => {
    const preset: ModelPreset = {
      id: 'p1',
      name: 'clone',
      createdAt: 0,
      modelRotation: [1, 2, 3],
      modelScale: [4, 5, 6],
      scale: [7, 8, 9],
      shape: { type: 'box', width: 2, height: 3, depth: 4 },
      material: { color: [0.5, 0.5, 0.5] },
    }

    const next = applyPresetToEntity(baseEntity(), preset)

    expect(next.modelRotation).not.toBe(preset.modelRotation)
    expect(next.modelScale).not.toBe(preset.modelScale)
    expect(next.scale).not.toBe(preset.scale)
    expect(next.shape).not.toBe(preset.shape)
    expect(next.material).not.toBe(preset.material)
  })

  it('round-trips: extract then apply yields equivalent entity for preset fields', () => {
    const entity: Entity = {
      ...baseEntity(),
      model: 'mesh.glb',
      modelRotation: [0.1, 0.2, 0.3],
      modelScale: [1.5, 1.5, 1.5],
      material: { color: [0.7, 0.7, 0.7], metalness: 0.4 },
      scale: [2, 2, 2],
    }
    const preset = extractPresetFromEntity(entity, 'rt')
    const restored = applyPresetToEntity(baseEntity(), preset)

    expect(restored.model).toBe(entity.model)
    expect(restored.modelRotation).toEqual(entity.modelRotation)
    expect(restored.modelScale).toEqual(entity.modelScale)
    expect(restored.material).toEqual(entity.material)
    expect(restored.scale).toEqual(entity.scale)
    expect(restored.shape).toEqual(entity.shape)
  })

  it('ignores keys that are not on the preset (own-property check)', () => {
    const entity = baseEntity()
    const preset: ModelPreset = {
      id: 'p1',
      name: 'only-name',
      createdAt: 0,
    }
    const next = applyPresetToEntity(entity, preset)
    expect(next).toEqual(entity)
  })
})
