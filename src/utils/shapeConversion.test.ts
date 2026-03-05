import { describe, it, expect } from 'vitest'
import { getCharacteristicSize, shapeWithPreservedSize } from './shapeConversion'
import { getDefaultShapeForType } from '@/data/entityDefaults'
import type { Shape } from '@/types/world'

describe('getCharacteristicSize', () => {
  it('returns cube root of volume for box', () => {
    expect(getCharacteristicSize({ type: 'box', width: 5, height: 5, depth: 5 })).toBeCloseTo(5, 10)
    expect(getCharacteristicSize({ type: 'box', width: 2, height: 2, depth: 8 })).toBeCloseTo(Math.pow(32, 1 / 3), 5)
  })

  it('returns radius for sphere', () => {
    expect(getCharacteristicSize({ type: 'sphere', radius: 5 })).toBe(5)
  })

  it('returns volume^(1/3) for cylinder', () => {
    const r = 2
    const h = 4
    const expected = Math.pow(r * r * h, 1 / 3)
    expect(getCharacteristicSize({ type: 'cylinder', radius: r, height: h })).toBeCloseTo(expected, 5)
  })

  it('returns size for capsule', () => {
    const r = 1
    const h = 2
    const expected = Math.pow(r * r * (h + 2 * r), 1 / 3)
    expect(getCharacteristicSize({ type: 'capsule', radius: r, height: h })).toBeCloseTo(expected, 5)
  })

  it('returns null for plane and trimesh', () => {
    expect(getCharacteristicSize({ type: 'plane' })).toBeNull()
    expect(getCharacteristicSize({ type: 'trimesh', model: '' })).toBeNull()
  })

  it('returns null for undefined shape', () => {
    expect(getCharacteristicSize(undefined)).toBeNull()
  })
})

describe('shapeWithPreservedSize', () => {
  it('sphere radius 5 -> box 5×5×5', () => {
    const result = shapeWithPreservedSize({ type: 'sphere', radius: 5 }, 'box')
    expect(result.type).toBe('box')
    if (result.type === 'box') {
      expect(result.width).toBe(5)
      expect(result.height).toBe(5)
      expect(result.depth).toBe(5)
    }
  })

  it('box 8×8×8 -> sphere radius 8', () => {
    const result = shapeWithPreservedSize({ type: 'box', width: 8, height: 8, depth: 8 }, 'sphere')
    expect(result.type).toBe('sphere')
    if (result.type === 'sphere') {
      expect(result.radius).toBeCloseTo(8, 10)
    }
  })

  it('box 2×2×8 -> sphere has consistent size (cube root of 32)', () => {
    const result = shapeWithPreservedSize({ type: 'box', width: 2, height: 2, depth: 8 }, 'sphere')
    expect(result.type).toBe('sphere')
    if (result.type === 'sphere') {
      expect(result.radius).toBeCloseTo(Math.pow(32, 1 / 3), 5)
    }
  })

  it('sphere 3 -> cylinder radius 3 height 3', () => {
    const result = shapeWithPreservedSize({ type: 'sphere', radius: 3 }, 'cylinder')
    expect(result.type).toBe('cylinder')
    if (result.type === 'cylinder') {
      expect(result.radius).toBe(3)
      expect(result.height).toBe(3)
    }
  })

  it('sphere 4 -> capsule radius 2 height 4', () => {
    const result = shapeWithPreservedSize({ type: 'sphere', radius: 4 }, 'capsule')
    expect(result.type).toBe('capsule')
    if (result.type === 'capsule') {
      expect(result.radius).toBe(2)
      expect(result.height).toBe(4)
    }
  })

  it('returns default shape when switching to plane', () => {
    const result = shapeWithPreservedSize({ type: 'sphere', radius: 5 }, 'plane')
    expect(result).toEqual(getDefaultShapeForType('plane'))
  })

  it('returns default shape when switching to trimesh', () => {
    const result = shapeWithPreservedSize({ type: 'box', width: 1, height: 1, depth: 1 }, 'trimesh')
    expect(result).toEqual(getDefaultShapeForType('trimesh'))
  })

  it('returns default shape when current shape is plane', () => {
    const result = shapeWithPreservedSize({ type: 'plane' }, 'box')
    expect(result).toEqual(getDefaultShapeForType('box'))
  })

  it('returns default shape when current shape is undefined', () => {
    const result = shapeWithPreservedSize(undefined, 'sphere')
    expect(result).toEqual(getDefaultShapeForType('sphere'))
  })

  it('clamps very small size to minimum', () => {
    const result = shapeWithPreservedSize({ type: 'sphere', radius: 0.001 }, 'box')
    expect(result.type).toBe('box')
    if (result.type === 'box') {
      expect(result.width).toBeGreaterThanOrEqual(0.01)
      expect(result.height).toBeGreaterThanOrEqual(0.01)
      expect(result.depth).toBeGreaterThanOrEqual(0.01)
    }
  })
})
