import { describe, expect, it } from 'vitest'
import {
  activeLinkIndices,
  applyVectorComponentChange,
  displayComponentsForMode,
} from './vectorFieldEdit'

describe('vectorFieldEdit', () => {
  it('absolute unlinked edits one axis', () => {
    const next = applyVectorComponentChange({
      current: [1, 2, 3],
      relativeBaseline: null,
      index: 0,
      newComponentValue: 5,
      mode: 'absolute',
      linked: false,
      linkIndices: [0, 1, 2],
      length: 3,
    })
    expect(next).toEqual([5, 2, 3])
  })

  it('absolute linked with equal components sets uniform value', () => {
    const next = applyVectorComponentChange({
      current: [2, 2, 2],
      relativeBaseline: null,
      index: 1,
      newComponentValue: 4,
      mode: 'absolute',
      linked: true,
      linkIndices: [0, 1, 2],
      length: 3,
    })
    expect(next).toEqual([4, 4, 4])
  })

  it('absolute linked with unequal components applies delta to all', () => {
    const next = applyVectorComponentChange({
      current: [1, 2, 1],
      relativeBaseline: null,
      index: 0,
      newComponentValue: 3,
      mode: 'absolute',
      linked: true,
      linkIndices: [0, 1, 2],
      length: 3,
    })
    expect(next).toEqual([3, 4, 3])
  })

  it('relative unlinked adds delta to one axis from baseline', () => {
    const next = applyVectorComponentChange({
      current: [1, 2, 3],
      relativeBaseline: [1, 2, 3],
      index: 2,
      newComponentValue: 0.5,
      mode: 'relative',
      linked: false,
      linkIndices: [0, 1, 2],
      length: 3,
    })
    expect(next).toEqual([1, 2, 3.5])
  })

  it('relative linked adds same delta to all axes', () => {
    const next = applyVectorComponentChange({
      current: [1, 2, 3],
      relativeBaseline: [1, 2, 3],
      index: 0,
      newComponentValue: 0.25,
      mode: 'relative',
      linked: true,
      linkIndices: [0, 1, 2],
      length: 3,
    })
    expect(next).toEqual([1.25, 2.25, 3.25])
  })

  it('relative mode displays zero deltas', () => {
    expect(displayComponentsForMode([5, 6, 7], 'relative', 3)).toEqual([0, 0, 0])
    expect(displayComponentsForMode([5, 6, 7], 'absolute', 3)).toEqual([5, 6, 7])
  })

  it('activeLinkIndices skips blank labels', () => {
    expect(activeLinkIndices(['U', 'V', ''])).toEqual([0, 1])
  })

  it('relative linked with stale current still uses baseline', () => {
    const next = applyVectorComponentChange({
      current: [1, 2, 3],
      relativeBaseline: [10, 20, 30],
      index: 0,
      newComponentValue: 2,
      mode: 'relative',
      linked: true,
      linkIndices: [0, 1, 2],
      length: 3,
    })
    expect(next).toEqual([12, 22, 32])
  })

  it('single link index behaves like unlinked', () => {
    const next = applyVectorComponentChange({
      current: [1, 2, 3],
      relativeBaseline: null,
      index: 0,
      newComponentValue: 9,
      mode: 'absolute',
      linked: true,
      linkIndices: [0],
      length: 3,
    })
    expect(next).toEqual([9, 2, 3])
  })
})
