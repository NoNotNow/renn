import { describe, expect, test, afterEach } from 'vitest'
import {
  clearCoordinateEntries,
  getCoordinateOverlayEntries,
  publishLineValue,
  setCoordinateOverlayDisplayEntityId,
  setCoordinateOverlayFn,
  COORDINATE_OVERLAY_MAX_COUNT,
} from './coordinateOverlayBridge'

describe('coordinateOverlayBridge', () => {
  afterEach(() => {
    setCoordinateOverlayFn(null)
    setCoordinateOverlayDisplayEntityId(null)
  })

  test('publish is a no-op when overlay is not wired', () => {
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e1', [0, 0, 0], [1, 2, 3], 'blue')
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test('clears entries when wiring is removed', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e1', [0, 0, 0], [1, 0, 0], 'red')
    expect(getCoordinateOverlayEntries().length).toBe(1)
    setCoordinateOverlayFn(null)
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test('filters by display entity id', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e2', [0, 0, 0], [1, 0, 0], 'blue')
    expect(getCoordinateOverlayEntries()).toEqual([])
    publishLineValue('e1', [0, 0, 0], [5, 0, 0], 'green')
    expect(getCoordinateOverlayEntries()).toEqual([
      { from: [0, 0, 0], to: [5, 0, 0], color: 'green' },
    ])
  })

  test('accumulates multiple entries per frame', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e1', [0, 0, 0], [1, 0, 0], 'red')
    publishLineValue('e1', [0, 0, 0], [0, 2, 0], 'blue')
    expect(getCoordinateOverlayEntries()).toHaveLength(2)
  })

  test('clearCoordinateEntries empties state while wired', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e1', [0, 0, 0], [1, 0, 0], 'red')
    clearCoordinateEntries()
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test('ignores non-finite coordinate components', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e1', [Number.NaN, 0, 0], [0, 0, 0], 'red')
    publishLineValue('e1', [0, 0, 0], [0, Infinity, 0], 'red')
    expect(getCoordinateOverlayEntries()).toEqual([])
  })

  test(`ignores entries beyond COORDINATE_OVERLAY_MAX_COUNT (${COORDINATE_OVERLAY_MAX_COUNT})`, () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    for (let i = 0; i < COORDINATE_OVERLAY_MAX_COUNT + 5; i += 1) {
      publishLineValue('e1', [0, 0, 0], [i, 0, 0], 'red')
    }
    expect(getCoordinateOverlayEntries()).toHaveLength(COORDINATE_OVERLAY_MAX_COUNT)
  })

  test('getCoordinateOverlayEntries returns a copy (mutation-safe)', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    publishLineValue('e1', [0, 0, 0], [1, 0, 0], 'blue')
    const a = getCoordinateOverlayEntries()
    const b = getCoordinateOverlayEntries()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  test('stores a defensive copy of the coordinate tuple', () => {
    setCoordinateOverlayFn(() => {})
    setCoordinateOverlayDisplayEntityId('e1')
    const from: [number, number, number] = [0, 0, 0]
    const to: [number, number, number] = [1, 2, 3]
    publishLineValue('e1', from, to, 'cyan')
    from[0] = 99
    to[0] = 99
    expect(getCoordinateOverlayEntries()[0]!.from[0]).toBe(0)
    expect(getCoordinateOverlayEntries()[0]!.to[0]).toBe(1)
  })
})
