import { describe, expect, test, vi } from 'vitest'
import { raycastSpreadImpl } from './raycastSpread'

describe('raycastSpreadImpl', () => {
  test('returns closest hit among spread rays', () => {
    const raycast = vi.fn((origin: [number, number, number]) => {
      if (origin[0] < 0) return { hit: true, distance: 2, entityId: 'a' }
      if (origin[0] > 0) return { hit: true, distance: 5, entityId: 'b' }
      return { hit: false, distance: 0, entityId: '' }
    })
    const result = raycastSpreadImpl(raycast, [0, 0, 0], [0, 0, -1], 10, 2, 3)
    expect(result.hit).toBe(true)
    expect(result.distance).toBe(2)
    expect(raycast).toHaveBeenCalledTimes(3)
  })

  test('falls back to center ray when spread rays all miss', () => {
    const raycast = vi.fn((origin: [number, number, number]) => {
      if (origin[0] !== 0) return { hit: false, distance: 0, entityId: '' }
      return { hit: true, distance: 7, entityId: 'center' }
    })
    const result = raycastSpreadImpl(raycast, [0, 0, 0], [0, 0, -1], 10, 2, 3)
    expect(result.entityId).toBe('center')
    expect(raycast).toHaveBeenCalledTimes(3)
  })

  test('re-casts from origin when every spread ray misses', () => {
    let n = 0
    const raycast = vi.fn(() => {
      n += 1
      if (n <= 3) return { hit: false, distance: 0, entityId: '' }
      return { hit: true, distance: 4, entityId: 'center' }
    })
    const result = raycastSpreadImpl(raycast, [0, 0, 0], [0, 0, -1], 10, 2, 3)
    expect(result.entityId).toBe('center')
    expect(raycast).toHaveBeenCalledTimes(4)
  })
})
