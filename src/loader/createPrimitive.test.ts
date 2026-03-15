import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { createPrimitiveMesh, buildEntityMesh } from '@/loader/createPrimitive'
import type { Shape } from '@/types/world'

describe('createPrimitiveMesh', () => {
  it('returns mesh with MeshStandardMaterial for box shape', async () => {
    const shape: Shape = { type: 'box', width: 1, height: 1, depth: 1 }
    const mesh = await createPrimitiveMesh(shape, undefined, undefined)
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(mat).not.toBeInstanceOf(THREE.MeshBasicMaterial)
  })

  it('trimesh fallback (no asset) uses MeshStandardMaterial', async () => {
    const shape: Shape = { type: 'trimesh', model: 'missing-model' }
    const mesh = await createPrimitiveMesh(shape, undefined, undefined)
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(mat).not.toBeInstanceOf(THREE.MeshBasicMaterial)
  })
})

describe('buildEntityMesh', () => {
  it('returns mesh with MeshStandardMaterial for box shape', async () => {
    const shape: Shape = { type: 'box', width: 1, height: 1, depth: 1 }
    const mesh = await buildEntityMesh(shape, undefined, [0, 0, 0], [0, 0, 0], [1, 1, 1])
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(mat).not.toBeInstanceOf(THREE.MeshBasicMaterial)
  })

  it('accepts optional modelRotation and modelScale for primitive shape', async () => {
    const shape: Shape = { type: 'box', width: 1, height: 1, depth: 1 }
    const mesh = await buildEntityMesh(
      shape,
      undefined,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 1],
      undefined,
      undefined,
      [0, Math.PI / 2, 0],
      [2, 1, 1]
    )
    expect(mesh).toBeDefined()
    expect(mesh.scale.x).toBe(1)
    expect(mesh.scale.y).toBe(1)
    expect(mesh.scale.z).toBe(1)
  })
})
