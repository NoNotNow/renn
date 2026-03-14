import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeSceneToUnitCube } from './normalizeModelToUnitCube'
import { extractMeshGeometry, getGeometryInfo } from './geometryExtractor'

const EPS = 1e-5

describe('normalizeSceneToUnitCube', () => {
  it('scales and centers a large box to fit in 1×1×1', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    const scene = new THREE.Group()
    scene.add(mesh)

    normalizeSceneToUnitCube(scene)

    const extracted = extractMeshGeometry(scene, false)
    expect(extracted).not.toBeNull()
    const info = getGeometryInfo(extracted!)

    // All vertices in [-0.5, 0.5]³
    for (let i = 0; i < extracted!.vertices.length; i += 3) {
      expect(extracted!.vertices[i]).toBeGreaterThanOrEqual(-0.5 - EPS)
      expect(extracted!.vertices[i]).toBeLessThanOrEqual(0.5 + EPS)
      expect(extracted!.vertices[i + 1]).toBeGreaterThanOrEqual(-0.5 - EPS)
      expect(extracted!.vertices[i + 1]).toBeLessThanOrEqual(0.5 + EPS)
      expect(extracted!.vertices[i + 2]).toBeGreaterThanOrEqual(-0.5 - EPS)
      expect(extracted!.vertices[i + 2]).toBeLessThanOrEqual(0.5 + EPS)
    }

    // Largest dimension of bounds is 1
    const maxDim = Math.max(
      info.bounds.max.x - info.bounds.min.x,
      info.bounds.max.y - info.bounds.min.y,
      info.bounds.max.z - info.bounds.min.z
    )
    expect(maxDim).toBeCloseTo(1, 5)
  })

  it('centers geometry at origin', () => {
    const geometry = new THREE.BoxGeometry(4, 4, 4)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    mesh.position.set(100, 200, 300)
    const scene = new THREE.Group()
    scene.add(mesh)

    normalizeSceneToUnitCube(scene)

    const extracted = extractMeshGeometry(scene, false)
    expect(extracted).not.toBeNull()
    const info = getGeometryInfo(extracted!)

    const centerX =
      (info.bounds.min.x + info.bounds.max.x) / 2
    const centerY =
      (info.bounds.min.y + info.bounds.max.y) / 2
    const centerZ =
      (info.bounds.min.z + info.bounds.max.z) / 2

    expect(centerX).toBeCloseTo(0, 5)
    expect(centerY).toBeCloseTo(0, 5)
    expect(centerZ).toBeCloseTo(0, 5)
  })

  it('does nothing for empty scene', () => {
    const scene = new THREE.Group()
    expect(() => normalizeSceneToUnitCube(scene)).not.toThrow()
  })

  it('normalizes multiple meshes in one scene', () => {
    const group = new THREE.Group()
    const mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshBasicMaterial()
    )
    mesh1.position.set(-20, 0, 0)
    const mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshBasicMaterial()
    )
    mesh2.position.set(20, 0, 0)
    group.add(mesh1)
    group.add(mesh2)

    normalizeSceneToUnitCube(group)

    const extracted = extractMeshGeometry(group, false)
    expect(extracted).not.toBeNull()
    const info = getGeometryInfo(extracted!)

    const maxDim = Math.max(
      info.bounds.max.x - info.bounds.min.x,
      info.bounds.max.y - info.bounds.min.y,
      info.bounds.max.z - info.bounds.min.z
    )
    expect(maxDim).toBeCloseTo(1, 5)
  })
})
