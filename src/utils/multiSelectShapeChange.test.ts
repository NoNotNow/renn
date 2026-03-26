import { describe, expect, it } from 'vitest'
import type { Entity, Shape } from '@/types/world'
import { shapeWithPreservedSize } from '@/utils/shapeConversion'
import { applyMultiShapeEdit, shapePatchForEntity } from '@/utils/multiSelectShapeChange'

function entity(partial: Partial<Entity> & { id: string }): Entity {
  return {
    id: partial.id,
    bodyType: partial.bodyType ?? 'static',
    shape: partial.shape ?? { type: 'box', width: 1, height: 1, depth: 1 },
    ...partial,
  }
}

describe('multiSelectShapeChange', () => {
  it('applyMultiShapeEdit uses per-entity preserved size when types differ', () => {
    const boxEnt = entity({
      id: 'a',
      shape: { type: 'box', width: 4, height: 4, depth: 4 },
    })
    const sphereEnt = entity({
      id: 'b',
      shape: { type: 'sphere', radius: 0.25 },
    })
    const uiShape = shapeWithPreservedSize(boxEnt.shape, 'pyramid') as Shape

    const patchA = applyMultiShapeEdit(boxEnt, uiShape)
    const patchB = applyMultiShapeEdit(sphereEnt, uiShape)

    expect(patchA.shape?.type).toBe('pyramid')
    expect(patchB.shape?.type).toBe('pyramid')
    expect(patchB.shape).toEqual(shapeWithPreservedSize(sphereEnt.shape, 'pyramid'))
    expect(patchA.shape).toEqual(shapeWithPreservedSize(boxEnt.shape, 'pyramid'))
    expect(patchB.shape).not.toEqual(patchA.shape)
  })

  it('applyMultiShapeEdit applies uniform shape when type matches', () => {
    const e1 = entity({
      id: 'a',
      shape: { type: 'box', width: 2, height: 1, depth: 1 },
    })
    const e2 = entity({
      id: 'b',
      shape: { type: 'box', width: 3, height: 2, depth: 2 },
    })
    const uiShape: Shape = { type: 'box', width: 5, height: 1, depth: 1 }

    expect(applyMultiShapeEdit(e1, uiShape).shape).toEqual(uiShape)
    expect(applyMultiShapeEdit(e2, uiShape).shape).toEqual(uiShape)
  })

  it('shapePatchForEntity clears model when switching to trimesh', () => {
    const ent = entity({
      id: 'x',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      model: 'asset-1',
      showShapeWireframe: true,
    })
    const patch = shapePatchForEntity(ent, {
      type: 'trimesh',
      model: 'tm',
      simplification: { enabled: false, maxTriangles: 100 },
    })
    expect(patch.model).toBeUndefined()
    expect(patch.showShapeWireframe).toBeUndefined()
    expect(patch.shape?.type).toBe('trimesh')
  })
})
