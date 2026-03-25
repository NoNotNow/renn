import { describe, it, expect } from 'vitest'
import type { Entity } from '@/types/world'
import { getEntityApproximateSize } from './entityApproximateSize'

describe('getEntityApproximateSize', () => {
  it('scales box max dimension by max scale axis', () => {
    const e: Entity = {
      id: 'a',
      shape: { type: 'box', width: 2, height: 1, depth: 4 },
      scale: [2, 1, 1],
    }
    expect(getEntityApproximateSize(e)).toBe(8)
  })

  it('uses sphere diameter times scale', () => {
    const e: Entity = {
      id: 'b',
      shape: { type: 'sphere', radius: 0.5 },
      scale: [3, 3, 3],
    }
    expect(getEntityApproximateSize(e)).toBe(3)
  })

  it('returns scale only when shape is missing', () => {
    const e: Entity = {
      id: 'c',
      scale: [1.5, 2, 1],
    }
    expect(getEntityApproximateSize(e)).toBe(2)
  })

  it('uses nominal span for plane', () => {
    const e: Entity = {
      id: 'd',
      shape: { type: 'plane' },
      scale: [1, 1, 1],
    }
    expect(getEntityApproximateSize(e)).toBe(10)
  })

  it('uses scale only for trimesh (unknown mesh bounds)', () => {
    const e: Entity = {
      id: 'e',
      shape: { type: 'trimesh', model: 'm' },
      scale: [2, 2, 2],
    }
    expect(getEntityApproximateSize(e)).toBe(2)
  })
})
