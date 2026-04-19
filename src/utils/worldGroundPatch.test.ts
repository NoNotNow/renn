import { describe, it, expect } from 'vitest'
import type { Entity, RennWorld } from '@/types/world'
import { patchFirstPlaneEntity } from './worldGroundPatch'

describe('patchFirstPlaneEntity', () => {
  const ground: Entity = {
    id: 'g1',
    bodyType: 'static',
    shape: { type: 'plane' },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    friction: 0.5,
  }
  const other: Entity = {
    id: 'b1',
    bodyType: 'dynamic',
    shape: { type: 'sphere', radius: 1 },
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    mass: 1,
  }
  const world: RennWorld = {
    version: '1',
    world: {},
    entities: [ground, other],
  }

  it('maps only the ground entity by id', () => {
    const next = patchFirstPlaneEntity(world, ground, (e) => ({ ...e, friction: 0.9 }))
    expect(next.entities[0]!.friction).toBe(0.9)
    expect(next.entities[1]).toBe(other)
  })
})
