import { describe, expect, it } from 'vitest'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { Entity } from '@/types/world'
import {
  averageUnlockedSelectionWorldPosition,
  clampGizmoScaleAxes,
  GIZMO_MIN_AXIS_SCALE,
} from './transformGizmoController'

function entityStub(id: string, locked = false): Entity {
  return { id, locked } as Entity
}

describe('averageUnlockedSelectionWorldPosition', () => {
  it('returns mean position of unlocked selected entities', () => {
    const reg = {
      getPosition: (id: string) =>
        id === 'a' ? ([0, 0, 0] as const) : id === 'b' ? ([10, 0, 10] as const) : null,
    } as unknown as RenderItemRegistry
    const entities = [entityStub('a'), entityStub('b')]
    const getEntity = (id: string) => entities.find((e) => e.id === id)
    expect(averageUnlockedSelectionWorldPosition(reg, ['a', 'b'], getEntity)).toEqual([5, 0, 5])
  })

  it('omits locked entities', () => {
    const reg = {
      getPosition: (id: string) => (id === 'a' ? ([0, 0, 0] as const) : ([20, 0, 0] as const)),
    } as unknown as RenderItemRegistry
    const entities = [entityStub('a'), entityStub('b', true)]
    const getEntity = (id: string) => entities.find((e) => e.id === id)
    expect(averageUnlockedSelectionWorldPosition(reg, ['a', 'b'], getEntity)).toEqual([0, 0, 0])
  })

  it('returns null when no usable positions', () => {
    const reg = { getPosition: () => null } as unknown as RenderItemRegistry
    expect(averageUnlockedSelectionWorldPosition(reg, ['x'], () => entityStub('x'))).toBeNull()
  })
})

describe('clampGizmoScaleAxes', () => {
  it('leaves positive scales unchanged', () => {
    expect(clampGizmoScaleAxes(2, 0.5, 1)).toEqual([2, 0.5, 1])
  })

  it('clamps negative components to minimum', () => {
    expect(clampGizmoScaleAxes(-1, 2, 3)).toEqual([GIZMO_MIN_AXIS_SCALE, 2, 3])
    expect(clampGizmoScaleAxes(2, -0.5, 1)).toEqual([2, GIZMO_MIN_AXIS_SCALE, 1])
  })

  it('clamps zero to minimum', () => {
    expect(clampGizmoScaleAxes(0, 1, 1)).toEqual([GIZMO_MIN_AXIS_SCALE, 1, 1])
  })

  it('clamps mixed signs', () => {
    expect(clampGizmoScaleAxes(-2, 0, -0.1)).toEqual([
      GIZMO_MIN_AXIS_SCALE,
      GIZMO_MIN_AXIS_SCALE,
      GIZMO_MIN_AXIS_SCALE,
    ])
  })
})
