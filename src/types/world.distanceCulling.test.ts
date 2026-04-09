import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DISTANCE_CULLING,
  resolveDistanceCullingSettings,
} from '@/types/world'
import { migrateDistanceCullingFields } from '@/scripts/migrateWorld'
import { validateWorldDocument } from '@/schema/validate'

describe('resolveDistanceCullingSettings', () => {
  it('returns defaults when omitted', () => {
    expect(resolveDistanceCullingSettings(undefined)).toEqual(DEFAULT_DISTANCE_CULLING)
  })

  it('returns null when false', () => {
    expect(resolveDistanceCullingSettings(false)).toBeNull()
  })

  it('returns explicit settings', () => {
    const s = { maxDistance: 50, minSizeDistanceRatio: 0.01, sleepCulled: true }
    expect(resolveDistanceCullingSettings(s)).toEqual(s)
  })
})

describe('migrateDistanceCullingFields', () => {
  it('converts legacy radius/minSize to maxDistance/minSizeDistanceRatio', () => {
    const data = {
      version: '1.0',
      world: {
        gravity: [0, -9.81, 0],
        camera: { control: 'free' as const, mode: 'follow' as const, target: 'x' },
        distanceCulling: { radius: 100, minSize: 2 },
      },
      entities: [{ id: 'x', bodyType: 'static' as const, shape: { type: 'box' as const, width: 1, height: 1, depth: 1 } }],
    }
    migrateDistanceCullingFields(data)
    expect(data.world.distanceCulling).toEqual({
      maxDistance: 100,
      minSizeDistanceRatio: 0.02,
    })
    expect(() => validateWorldDocument(data)).not.toThrow()
  })
})
