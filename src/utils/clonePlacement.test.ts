import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  CLONE_PLANE_GAP,
  computeCloneWorldPosition,
  estimateHorizontalHalfExtent,
  horizontalCloneSideDirection,
} from '@/utils/clonePlacement'
import type { Entity } from '@/types/world'

function boxEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    shape: { type: 'box', width: 2, height: 1, depth: 4 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...overrides,
  }
}

describe('estimateHorizontalHalfExtent', () => {
  it('uses max of scaled width/depth for box', () => {
    expect(estimateHorizontalHalfExtent(boxEntity())).toBe(2) // 0.5 * max(2, 4)
  })

  it('uses sphere radius times horizontal scale', () => {
    const e: Entity = {
      id: 's',
      shape: { type: 'sphere', radius: 0.5 },
      scale: [2, 2, 3],
    }
    expect(estimateHorizontalHalfExtent(e)).toBe(1.5)
  })
})

describe('horizontalCloneSideDirection', () => {
  it('uses flattened local +X at identity rotation', () => {
    expect(horizontalCloneSideDirection([0, 0, 0])).toEqual({ x: 1, z: 0 })
  })

  it('falls back when local +X has no XZ component (uses local +Z)', () => {
    // Yaw 90° around Y: local +X -> world -Z, still has xz. Use roll so +X -> +Y in world.
    const dir = horizontalCloneSideDirection([0, 0, Math.PI / 2])
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, 0, Math.PI / 2, 'XYZ'))
    expect(Math.hypot(right.x, right.z)).toBeLessThan(1e-3)
    expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1, 5)
  })
})

describe('computeCloneWorldPosition', () => {
  it('preserves Y and offsets in XZ for identity rotation', () => {
    const source = boxEntity({ scale: [1, 1, 1], shape: { type: 'box', width: 1, height: 1, depth: 1 } })
    const pose = { position: [10, 3, -2] as const, rotation: [0, 0, 0] as const }
    const r = 0.5
    const sep = 2 * r + CLONE_PLANE_GAP
    const p = computeCloneWorldPosition(source, pose)
    expect(p[1]).toBe(3)
    expect(p[0]).toBeCloseTo(10 + sep, 5)
    expect(p[2]).toBeCloseTo(-2, 5)
  })
})
