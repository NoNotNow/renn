import { describe, expect, it } from 'vitest'
import type { CachedTransform } from '@/physics/rapierPhysics'
import { VisualPoseStateRegistry } from './renderItemRegistryVisualPose'

function mockCached(
  position: { x: number; y: number; z: number },
  rotation = { x: 0, y: 0, z: 0, w: 1 },
): CachedTransform {
  return {
    position,
    rotation,
    linvel: { x: 0, y: 0, z: 0 },
    angvel: { x: 0, y: 0, z: 0 },
    isKinematic: false,
    isSleeping: false,
  }
}

describe('VisualPoseStateRegistry', () => {
  it('initializes from first cached transform', () => {
    const reg = new VisualPoseStateRegistry()
    const state = reg.syncFromCached('e1', mockCached({ x: 1, y: 2, z: 3 }))
    expect(state.initialized).toBe(true)
    expect(state.currentPosition.x).toBe(1)
    expect(state.previousPosition.x).toBe(1)
  })

  it('copies previous from prior current on second sync', () => {
    const reg = new VisualPoseStateRegistry()
    reg.syncFromCached('e1', mockCached({ x: 0, y: 0, z: 0 }))
    const state = reg.syncFromCached('e1', mockCached({ x: 5, y: 0, z: 0 }))
    expect(state.previousPosition.x).toBe(0)
    expect(state.currentPosition.x).toBe(5)
  })

  it('delete and clear remove stored state', () => {
    const reg = new VisualPoseStateRegistry()
    reg.syncFromCached('e1', mockCached({ x: 0, y: 0, z: 0 }))
    reg.delete('e1')
    expect(reg.get('e1')).toBeUndefined()
    reg.syncFromCached('e2', mockCached({ x: 0, y: 0, z: 0 }))
    reg.clear()
    expect(reg.get('e2')).toBeUndefined()
  })
})
