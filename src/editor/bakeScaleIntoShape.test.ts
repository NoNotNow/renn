import { describe, it, expect } from 'vitest'
import { DEFAULT_SCALE } from '@/types/world'
import {
  bakeMeshScaleIntoModelScaleEntity,
  bakeScaleIntoPrimitiveShape,
} from '@/editor/bakeScaleIntoShape'
import type { Entity } from '@/types/world'

const baseEntity = (shape: Entity['shape']): Entity => ({
  id: 'e1',
  shape,
  scale: [1, 1, 1],
})

describe('bakeScaleIntoPrimitiveShape', () => {
  it('scales box dimensions per axis', () => {
    const e = baseEntity({ type: 'box', width: 2, height: 3, depth: 4 })
    const out = bakeScaleIntoPrimitiveShape(e, [2, 0.5, 1])
    expect(out?.scale).toEqual(DEFAULT_SCALE)
    expect(out?.shape?.type).toBe('box')
    if (out?.shape?.type === 'box') {
      expect(out.shape.width).toBe(4)
      expect(out.shape.height).toBe(1.5)
      expect(out.shape.depth).toBe(4)
    }
  })

  it('uses average scale for sphere radius', () => {
    const e = baseEntity({ type: 'sphere', radius: 2 })
    const out = bakeScaleIntoPrimitiveShape(e, [1, 2, 3])
    expect(out?.shape?.type).toBe('sphere')
    if (out?.shape?.type === 'sphere') {
      expect(out.shape.radius).toBeCloseTo(2 * 2) // avg = 2
    }
  })

  it('uses max(sx,sz) for cylinder radius and sy for height', () => {
    const e = baseEntity({ type: 'cylinder', radius: 1, height: 4 })
    const out = bakeScaleIntoPrimitiveShape(e, [2, 0.5, 1])
    expect(out?.shape?.type).toBe('cylinder')
    if (out?.shape?.type === 'cylinder') {
      expect(out.shape.radius).toBe(2)
      expect(out.shape.height).toBe(2)
    }
  })

  it('returns null for plane', () => {
    const e = baseEntity({ type: 'plane' })
    expect(bakeScaleIntoPrimitiveShape(e, [2, 2, 2])).toBeNull()
  })

  it('returns null for trimesh', () => {
    const e = baseEntity({ type: 'trimesh', model: 'm.glb' })
    expect(bakeScaleIntoPrimitiveShape(e, [2, 2, 2])).toBeNull()
  })
})

describe('bakeMeshScaleIntoModelScaleEntity', () => {
  it('multiplies modelScale by mesh scale and resets entity scale', () => {
    const e: Entity = {
      id: 'e1',
      shape: { type: 'trimesh', model: 'm.glb' },
      scale: [2, 1, 1],
      modelScale: [1, 2, 1],
    }
    const out = bakeMeshScaleIntoModelScaleEntity(e, [2, 0.5, 1])
    expect(out.scale).toEqual(DEFAULT_SCALE)
    expect(out.modelScale).toEqual([2, 1, 1])
  })
})
