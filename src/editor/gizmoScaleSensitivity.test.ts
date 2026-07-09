import { describe, expect, it } from 'vitest'
import {
  applyGizmoScaleSensitivity,
  dampenGizmoScaleFactor,
  GIZMO_SCALE_SENSITIVITY_UNIFORM,
} from './gizmoScaleSensitivity'

describe('dampenGizmoScaleFactor', () => {
  it('leaves factor 1 unchanged', () => {
    expect(dampenGizmoScaleFactor(1, 0.1)).toBe(1)
  })

  it('reduces growth for uniform handle', () => {
    expect(dampenGizmoScaleFactor(2, GIZMO_SCALE_SENSITIVITY_UNIFORM)).toBeCloseTo(1.1)
  })
})

describe('applyGizmoScaleSensitivity', () => {
  it('dampens uniform XYZ scale strongly', () => {
    const start: [number, number, number] = [1, 1, 1]
    const raw: [number, number, number] = [2, 2, 2]
    const out = applyGizmoScaleSensitivity('XYZ', start, raw)
    expect(out[0]).toBeCloseTo(1.1)
    expect(out[1]).toBeCloseTo(1.1)
    expect(out[2]).toBeCloseTo(1.1)
  })

  it('leaves unaffected axes at drag start for single-axis scale', () => {
    const start: [number, number, number] = [1, 2, 3]
    const raw: [number, number, number] = [4, 2, 3]
    expect(applyGizmoScaleSensitivity('X', start, raw)).toEqual([
      1 + (4 - 1) * 0.45,
      2,
      3,
    ])
  })

  it('dampens plane handles on two axes only', () => {
    const start: [number, number, number] = [1, 1, 1]
    const raw: [number, number, number] = [2, 2, 1]
    const out = applyGizmoScaleSensitivity('XY', start, raw)
    expect(out[0]).toBeCloseTo(1.3)
    expect(out[1]).toBeCloseTo(1.3)
    expect(out[2]).toBe(1)
  })
})
