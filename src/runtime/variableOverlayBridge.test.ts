import { describe, expect, test, vi, afterEach } from 'vitest'
import {
  clearSlots,
  getVariableOverlaySlots,
  publishVariableValue,
  setVariableOverlayDisplayEntityId,
  setVariableOverlayFn,
} from './variableOverlayBridge'

describe('variableOverlayBridge', () => {
  afterEach(() => {
    setVariableOverlayFn(null)
    setVariableOverlayDisplayEntityId(null)
  })

  test('publish is a no-op when overlay is not wired', () => {
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', 1, '#f00', 'a', 1)
    expect(getVariableOverlaySlots()).toEqual([])
  })

  test('clears slots when wiring is removed', () => {
    const fn = vi.fn()
    setVariableOverlayFn(fn)
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', 2, '#0f0', 'x', 1)
    expect(getVariableOverlaySlots().length).toBe(1)
    setVariableOverlayFn(null)
    expect(getVariableOverlaySlots()).toEqual([])
  })

  test('filters by display entity id', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e2', 1, '#f00', 'a', 1)
    expect(getVariableOverlaySlots()).toEqual([])
    publishVariableValue('e1', 3, '#00f', 'b', 1)
    expect(getVariableOverlaySlots()).toEqual([
      expect.objectContaining({ index: 1, value: 3, name: 'b', observedMin: 3, observedMax: 3 }),
    ])
  })

  test('last write wins value; min/max expand monotonically', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', 2, '#aaa', 'v', 1)
    publishVariableValue('e1', -1, '#aaa', 'v', 1)
    const s = getVariableOverlaySlots()[0]!
    expect(s.value).toBe(-1)
    expect(s.observedMin).toBe(-1)
    expect(s.observedMax).toBe(2)
  })

  test('clearSlots empties state while wired', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', 1, '#f00', 'a', 1)
    clearSlots()
    expect(getVariableOverlaySlots()).toEqual([])
  })

  test('ignores non-finite values and invalid indices', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', Number.NaN, '#f00', 'a', 1)
    publishVariableValue('e1', 1, '#f00', 'a', 0)
    publishVariableValue('e1', 1, '#f00', 'a', -2)
    expect(getVariableOverlaySlots()).toEqual([])
  })

  test('ignores indices above VARIABLE_OVERLAY_MAX_INDEX', () => {
    setVariableOverlayFn(() => {})
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', 1, '#f00', 'a', 17)
    expect(getVariableOverlaySlots()).toEqual([])
  })

  test('invokes wire fn after recording', () => {
    const fn = vi.fn()
    setVariableOverlayFn(fn)
    setVariableOverlayDisplayEntityId('e1')
    publishVariableValue('e1', 0.5, '#f00', 'speed', 1)
    expect(fn).toHaveBeenCalledWith(0.5, '#f00', 'speed', 1)
  })
})
