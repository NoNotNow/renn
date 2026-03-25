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
})
