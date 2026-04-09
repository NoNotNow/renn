import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import type { Entity } from '@/types/world'
import { computeMeshWorldMaxExtent } from './meshWorldExtent'

const minimalEntity = (id: string): Entity => ({
  id,
  shape: { type: 'box', width: 1, height: 1, depth: 1 },
})

describe('computeMeshWorldMaxExtent', () => {
  it('returns max AABB edge for a box mesh with uniform scale', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial())
    mesh.scale.set(1, 1, 1)
    const s = computeMeshWorldMaxExtent(mesh, minimalEntity('a'))
    expect(s).toBe(6)
    mesh.geometry.dispose()
    if (mesh.material instanceof THREE.Material) mesh.material.dispose()
  })

  it('includes entity root scale in world AABB', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    mesh.scale.set(10, 10, 10)
    const s = computeMeshWorldMaxExtent(mesh, minimalEntity('b'))
    expect(s).toBe(10)
    mesh.geometry.dispose()
    if (mesh.material instanceof THREE.Material) mesh.material.dispose()
  })

  it('includes child mesh bounds for nested hierarchy', () => {
    const root = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial())
    const child = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 2), new THREE.MeshBasicMaterial())
    root.add(child)
    const s = computeMeshWorldMaxExtent(root, minimalEntity('c'))
    expect(s).toBe(10)
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        if (o.material instanceof THREE.Material) o.material.dispose()
      }
    })
  })
})
