import { describe, expect, it, vi } from 'vitest'
import type { Vec3 } from '@/types/world'
import {
  processActiveDebugForcesInPlace,
  tryEnqueueDebugForce,
  type ActiveDebugForce,
} from './debugForces'

describe('tryEnqueueDebugForce', () => {
  it('rejects when physics is missing', () => {
    const warn = vi.fn()
    const queue: ActiveDebugForce[] = []
    expect(
      tryEnqueueDebugForce({
        physics: null,
        queue,
        entityId: 'a',
        force: [1, 0, 0],
        endTime: 1,
        warn,
      }),
    ).toBe(false)
    expect(queue).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
  })

  it('enqueues when entity is dynamic', () => {
    const queue: ActiveDebugForce[] = []
    const physics = {
      getBody: () => ({ isDynamic: () => true }),
    } as never
    expect(
      tryEnqueueDebugForce({
        physics,
        queue,
        entityId: 'a',
        force: [1, 2, 3] as Vec3,
        endTime: 5,
      }),
    ).toBe(true)
    expect(queue).toEqual([{ entityId: 'a', force: [1, 2, 3], endTime: 5 }])
  })
})

describe('processActiveDebugForcesInPlace', () => {
  it('drops expired and applies live forces when not in edit nav', () => {
    const applyForce = vi.fn()
    const forces: ActiveDebugForce[] = [
      { entityId: 'a', force: [1, 2, 3], endTime: 0.5 },
      { entityId: 'b', force: [4, 5, 6], endTime: 100 },
    ]
    processActiveDebugForcesInPlace({
      forces,
      currentTime: 1,
      editNavigationMode: false,
      applyForce,
    })
    expect(applyForce).toHaveBeenCalledTimes(1)
    expect(applyForce).toHaveBeenCalledWith('b', 4, 5, 6)
    expect(forces).toHaveLength(1)
    expect(forces[0]?.entityId).toBe('b')
  })

  it('trims expired but skips apply in edit-navigation mode', () => {
    const applyForce = vi.fn()
    const forces: ActiveDebugForce[] = [
      { entityId: 'a', force: [1, 2, 3], endTime: 0.5 },
      { entityId: 'b', force: [4, 5, 6], endTime: 100 },
    ]
    processActiveDebugForcesInPlace({
      forces,
      currentTime: 1,
      editNavigationMode: true,
      applyForce,
    })
    expect(applyForce).not.toHaveBeenCalled()
    expect(forces).toHaveLength(1)
    expect(forces[0]?.entityId).toBe('b')
  })
})
