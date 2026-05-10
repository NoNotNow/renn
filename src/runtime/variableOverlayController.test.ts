import { describe, expect, test } from 'vitest'
import {
  variableOverlayColumnX,
  variableOverlaySignedBarLength,
} from './variableOverlayController'

describe('variableOverlay layout helpers', () => {
  test('one slot is centered on the group (col 1 of n=1)', () => {
    const w = 3
    expect(variableOverlayColumnX(1, 1, w)).toBeCloseTo(0, 6)
  })

  test('two slots divide width into thirds at ⅓ and ⅔', () => {
    const w = 3
    const half = w / 2
    expect(variableOverlayColumnX(1, 2, w)).toBeCloseTo(-half + (1 / 3) * w, 6)
    expect(variableOverlayColumnX(2, 2, w)).toBeCloseTo(-half + (2 / 3) * w, 6)
  })

  test('signed bar length scales by observed range and group width', () => {
    const w = 2
    expect(variableOverlaySignedBarLength(1, -1, 1, w)).toBeCloseTo(2, 6)
    expect(variableOverlaySignedBarLength(-0.5, -1, 1, w)).toBeCloseTo(-1, 6)
  })

  test('zero observed range uses denominator 1', () => {
    expect(variableOverlaySignedBarLength(0.7, 0, 0, 1)).toBeCloseTo(0.7, 6)
  })
})
