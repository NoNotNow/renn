import { describe, expect, it } from 'vitest'
import { clampGizmoScaleAxes, GIZMO_MIN_AXIS_SCALE } from './transformGizmoController'

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
