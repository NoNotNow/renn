import { describe, expect, it } from 'vitest'
import { computeColliderVolume } from './colliderDescBuilder'

describe('computeColliderVolume', () => {
  it('defaults to unit box volume when shape is undefined', () => {
    expect(computeColliderVolume(undefined)).toBe(1)
    expect(computeColliderVolume(undefined, [2, 3, 4])).toBe(24)
  })

  it('computes primitive volumes with scale', () => {
    expect(
      computeColliderVolume({ type: 'box', width: 2, height: 3, depth: 4 }, [1, 1, 1]),
    ).toBe(24)
    const sphereVol = computeColliderVolume({ type: 'sphere', radius: 1 }, [1, 1, 1])
    expect(sphereVol).toBeCloseTo((4 / 3) * Math.PI)
    expect(computeColliderVolume({ type: 'plane' }, [1, 1, 1])).toBe(0)
    expect(computeColliderVolume({ type: 'trimesh', model: 'x' }, [1, 1, 1])).toBe(0)
  })
})
