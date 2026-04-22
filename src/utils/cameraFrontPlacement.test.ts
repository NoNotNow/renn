import { describe, it, expect } from 'vitest'
import type { Entity, Vec3 } from '@/types/world'
import {
  CAMERA_FRONT_MIN_DISTANCE,
  computeFrontDistance,
  computeGroupCenter,
  placeEntitiesInFrontOfCamera,
} from '@/utils/cameraFrontPlacement'

describe('computeGroupCenter', () => {
  it('returns origin for empty list', () => {
    expect(computeGroupCenter([])).toEqual([0, 0, 0])
  })

  it('averages positions', () => {
    expect(
      computeGroupCenter([
        [0, 0, 0],
        [2, 0, 0],
      ]),
    ).toEqual([1, 0, 0])
  })
})

describe('computeFrontDistance', () => {
  const fov = (50 * Math.PI) / 180
  const aspect = 16 / 9

  it('applies minimum distance for tiny objects', () => {
    const d = computeFrontDistance(0.01, fov, aspect, { margin: 1, minDistance: CAMERA_FRONT_MIN_DISTANCE })
    expect(d).toBe(CAMERA_FRONT_MIN_DISTANCE)
  })

  it('increases with object size', () => {
    const small = computeFrontDistance(1, fov, aspect, { margin: 1, minDistance: 0.1 })
    const large = computeFrontDistance(40, fov, aspect, { margin: 1, minDistance: 0.1 })
    expect(large).toBeGreaterThan(small)
  })

  it('narrow aspect needs farther placement than wide (horizontal FOV tighter)', () => {
    const wide = computeFrontDistance(10, fov, 2, { margin: 1, minDistance: 0.1 })
    const narrow = computeFrontDistance(10, fov, 0.5, { margin: 1, minDistance: 0.1 })
    expect(narrow).toBeGreaterThanOrEqual(wide)
  })
})

describe('placeEntitiesInFrontOfCamera', () => {
  const camera = {
    position: [0, 0, 0] as Vec3,
    forward: [0, 0, -1] as Vec3,
    fovRadians: (50 * Math.PI) / 180,
    aspect: 1,
  }

  function entity(id: string, pos: [number, number, number]): Entity {
    return {
      id,
      name: id,
      position: pos,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      bodyType: 'dynamic',
    } as Entity
  }

  it('returns empty map for empty entities', () => {
    const m = placeEntitiesInFrontOfCamera({
      camera,
      entities: [],
      extentByEntityId: new Map(),
    })
    expect(m.size).toBe(0)
  })

  it('preserves relative offsets within the group', () => {
    const a = entity('a', [0, 0, 0])
    const b = entity('b', [2, 0, 0])
    const extents = new Map<string, number>([
      ['a', 1],
      ['b', 1],
    ])
    const m = placeEntitiesInFrontOfCamera({ camera, entities: [a, b], extentByEntityId: extents })
    const pa = m.get('a')!
    const pb = m.get('b')!
    expect(pb[0] - pa[0]).toBeCloseTo(2)
    expect(pb[1] - pa[1]).toBeCloseTo(0)
    expect(pb[2] - pa[2]).toBeCloseTo(0)
  })

  it('places group center along forward at least min distance', () => {
    const e = entity('only', [5, 1, 3])
    const m = placeEntitiesInFrontOfCamera({
      camera,
      entities: [e],
      extentByEntityId: new Map([['only', 0.1]]),
    })
    const p = m.get('only')!
    // center was [5,1,3], only entity -> new center on -Z from origin
    const centerZ = p[2]
    expect(-centerZ).toBeGreaterThanOrEqual(CAMERA_FRONT_MIN_DISTANCE - 1e-3)
  })
})
