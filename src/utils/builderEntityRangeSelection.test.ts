import { describe, expect, it } from 'vitest'
import { sliceEntityIdsInRange } from './builderEntityRangeSelection'

const ORDER = ['a', 'b', 'c', 'd', 'e'] as const

describe('sliceEntityIdsInRange', () => {
  it('returns inclusive slice from anchor to target (forward)', () => {
    expect(sliceEntityIdsInRange(ORDER, 'b', 'd')).toEqual(['b', 'c', 'd'])
  })

  it('returns inclusive slice when target is before anchor', () => {
    expect(sliceEntityIdsInRange(ORDER, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('returns single id when anchor equals target', () => {
    expect(sliceEntityIdsInRange(ORDER, 'c', 'c')).toEqual(['c'])
  })

  it('uses target only when target is missing from order', () => {
    expect(sliceEntityIdsInRange(ORDER, 'b', 'missing')).toEqual(['missing'])
  })

  it('treats missing anchor as target index (single id)', () => {
    expect(sliceEntityIdsInRange(ORDER, 'missing', 'c')).toEqual(['c'])
  })

  it('handles empty order', () => {
    expect(sliceEntityIdsInRange([], 'x', 'y')).toEqual(['y'])
  })
})
