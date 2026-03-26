import { describe, expect, it } from 'vitest'
import type { Entity, Shape } from '@/types/world'
import {
  getMixedDimensionFieldSpecs,
  patchEntityWithMixedDimension,
  patchShapeWithMixedDimension,
} from '@/utils/mixedShapeDimensions'

function ent(partial: Partial<Entity> & { id: string; shape: Shape }): Entity {
  return {
    bodyType: 'static',
    ...partial,
  }
}

describe('mixedShapeDimensions', () => {
  it('getMixedDimensionFieldSpecs returns null radius when sphere and cylinder disagree', () => {
    const entities = [
      ent({ id: 'a', shape: { type: 'sphere', radius: 1 } }),
      ent({ id: 'b', shape: { type: 'cylinder', radius: 2, height: 1 } }),
    ]
    const specs = getMixedDimensionFieldSpecs(entities)
    const radius = specs.find((s) => s.kind === 'radius')
    expect(radius?.value).toBeNull()
    expect(radius?.partialNote).toBeUndefined()
  })

  it('getMixedDimensionFieldSpecs adds partial note for radius when only some shapes have radius', () => {
    const entities = [
      ent({ id: 'a', shape: { type: 'sphere', radius: 1 } }),
      ent({ id: 'b', shape: { type: 'box', width: 1, height: 1, depth: 1 } }),
    ]
    const radius = getMixedDimensionFieldSpecs(entities).find((s) => s.kind === 'radius')
    expect(radius?.partialNote).toBeDefined()
  })

  it('patchEntityWithMixedDimension sets height on box only when selection is box+sphere', () => {
    const box = ent({ id: 'a', shape: { type: 'box', width: 1, height: 2, depth: 3 } })
    const sphere = ent({ id: 'b', shape: { type: 'sphere', radius: 0.5 } })
    expect(patchEntityWithMixedDimension(box, 'height', 9).shape).toEqual({
      type: 'box',
      width: 1,
      height: 9,
      depth: 3,
    })
    expect(patchEntityWithMixedDimension(sphere, 'height', 9)).toBe(sphere)
  })

  it('patchEntityWithMixedDimension sets radius on cylinder and sphere', () => {
    const sphere = ent({ id: 'a', shape: { type: 'sphere', radius: 0.5 } })
    const cyl = ent({ id: 'b', shape: { type: 'cylinder', radius: 0.5, height: 2 } })
    expect(patchEntityWithMixedDimension(sphere, 'radius', 1.2).shape).toEqual({ type: 'sphere', radius: 1.2 })
    expect(patchEntityWithMixedDimension(cyl, 'radius', 1.2).shape).toEqual({
      type: 'cylinder',
      radius: 1.2,
      height: 2,
    })
  })

  it('patchShapeWithMixedDimension updates box width only for width kind', () => {
    const box: Shape = { type: 'box', width: 1, height: 1, depth: 1 }
    expect(patchShapeWithMixedDimension(box, 'width', 4).width).toBe(4)
    expect(patchShapeWithMixedDimension({ type: 'sphere', radius: 1 }, 'width', 4).type).toBe('sphere')
  })

  it('patchShapeWithMixedDimension updates pyramid baseSize only', () => {
    const p: Shape = { type: 'pyramid', baseSize: 2, height: 3 }
    expect(patchShapeWithMixedDimension(p, 'baseSize', 5)).toEqual({ type: 'pyramid', baseSize: 5, height: 3 })
  })

  it('getMixedDimensionFieldSpecs is empty for fewer than two entities', () => {
    expect(getMixedDimensionFieldSpecs([ent({ id: 'a', shape: { type: 'box', width: 1, height: 1, depth: 1 } })])).toEqual(
      []
    )
  })
})
