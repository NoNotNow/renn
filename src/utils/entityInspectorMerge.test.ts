import { describe, expect, it } from 'vitest'
import type { Entity } from '@/types/world'
import {
  mergeVec3,
  mergeShape,
  mergeMaterial,
  mergeBodyType,
  mergeName,
  deepEqual,
  allTrimeshOrAllPrimitiveModelLayout,
  mergeScale,
  mergeTransformers,
  mergeLocked,
  mergeNumber,
  mergeModelRef,
  allSameShapeTopology,
} from './entityInspectorMerge'

function e(partial: Partial<Entity>): Entity {
  return {
    id: partial.id ?? 'id',
    bodyType: partial.bodyType ?? 'static',
    shape: partial.shape ?? { type: 'box', width: 1, height: 1, depth: 1 },
    ...partial,
  }
}

describe('entityInspectorMerge', () => {
  it('mergeVec3 returns value when all match', () => {
    const entities = [e({ position: [1, 2, 3] }), e({ position: [1, 2, 3] })]
    expect(mergeVec3(entities, (x) => x.position)).toEqual([1, 2, 3])
  })

  it('mergeVec3 returns null when values differ', () => {
    const entities = [e({ position: [0, 0, 0] }), e({ position: [1, 0, 0] })]
    expect(mergeVec3(entities, (x) => x.position)).toBeNull()
  })

  it('mergeShape returns null when shapes differ', () => {
    const entities = [
      e({ shape: { type: 'box', width: 1, height: 1, depth: 1 } }),
      e({ shape: { type: 'sphere', radius: 1 } }),
    ]
    expect(mergeShape(entities)).toBeNull()
  })

  it('mergeMaterial returns null when materials differ', () => {
    const entities = [
      e({ material: { color: [1, 0, 0] } }),
      e({ material: { color: [0, 1, 0] } }),
    ]
    expect(mergeMaterial(entities)).toBeNull()
  })

  it('mergeBodyType returns null when body types differ', () => {
    const entities = [e({ bodyType: 'static' }), e({ bodyType: 'dynamic' })]
    expect(mergeBodyType(entities)).toBeNull()
  })

  it('mergeName returns null when names differ', () => {
    const entities = [e({ name: 'a' }), e({ name: 'b' })]
    expect(mergeName(entities)).toBeNull()
  })

  it('deepEqual handles nested objects', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('allTrimeshOrAllPrimitiveModelLayout detects mixed', () => {
    const tr = e({ shape: { type: 'trimesh', model: 'm' } })
    const box = e({ shape: { type: 'box', width: 1, height: 1, depth: 1 } })
    expect(allTrimeshOrAllPrimitiveModelLayout([tr, box])).toBe('mixed')
  })

  it('mergeScale returns value when all match', () => {
    const entities = [e({ scale: [2, 2, 2] }), e({ scale: [2, 2, 2] })]
    expect(mergeScale(entities)).toEqual([2, 2, 2])
  })

  it('mergeScale returns null when values differ', () => {
    const entities = [e({ scale: [1, 1, 1] }), e({ scale: [2, 1, 1] })]
    expect(mergeScale(entities)).toBeNull()
  })

  it('mergeTransformers returns list when identical', () => {
    const t = [{ type: 'wanderer' as const, config: {} }]
    const entities = [e({ transformers: t }), e({ transformers: t })]
    expect(mergeTransformers(entities)).toEqual(t)
  })

  it('mergeTransformers returns null when stacks differ', () => {
    const entities = [
      e({ transformers: [{ type: 'wanderer' as const, config: {} }] }),
      e({ transformers: [{ type: 'input' as const, config: {} }] }),
    ]
    expect(mergeTransformers(entities)).toBeNull()
  })

  it('mergeLocked returns boolean when all match', () => {
    expect(mergeLocked([e({ locked: true }), e({ locked: true })])).toBe(true)
    expect(mergeLocked([e({ locked: false }), e({})])).toBe(false)
  })

  it('mergeLocked returns null when mixed', () => {
    expect(mergeLocked([e({ locked: true }), e({ locked: false })])).toBeNull()
  })

  it('mergeNumber merges mass and friction', () => {
    expect(mergeNumber([e({ mass: 2 }), e({ mass: 2 })], (x) => x.mass, 1)).toBe(2)
    expect(mergeNumber([e({ mass: 1 }), e({ mass: 2 })], (x) => x.mass, 1)).toBeNull()
    expect(
      mergeNumber([e({ friction: 0.4 }), e({ friction: 0.4 })], (x) => x.friction, 0.5)
    ).toBe(0.4)
  })

  it('mergeModelRef returns shared ref or null', () => {
    expect(mergeModelRef([e({ model: 'a' }), e({ model: 'a' })])).toBe('a')
    expect(mergeModelRef([e({ model: 'a' }), e({ model: 'b' })])).toBeNull()
  })

  it('allSameShapeTopology is true only when types match', () => {
    expect(
      allSameShapeTopology([
        e({ shape: { type: 'box', width: 1, height: 1, depth: 1 } }),
        e({ shape: { type: 'box', width: 2, height: 2, depth: 2 } }),
      ])
    ).toBe(true)
    expect(
      allSameShapeTopology([
        e({ shape: { type: 'box', width: 1, height: 1, depth: 1 } }),
        e({ shape: { type: 'sphere', radius: 1 } }),
      ])
    ).toBe(false)
  })
})
