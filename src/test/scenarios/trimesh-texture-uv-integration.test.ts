/**
 * Integration: Trimesh shape + GLB with bad UVs + textured material (`map`, `mapRepeat`).
 *
 * Regression: assets with degenerate or huge UV coordinates (common on some catalog models)
 * made `mapRepeat` ineffective while `mapOffset` still moved the sample — normalize after
 * unit-cube normalization fixes that for editor textures.
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createPrimitiveMesh } from '@/loader/createPrimitive'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import type { GLTF } from '@/loader/assetResolver'
import type { Entity } from '@/types/world'

function makeGiraffeLikeBadUvScene(): THREE.Group {
  const geom = new THREE.BoxGeometry(1, 1, 1)
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 500, 500)
  }
  uv.needsUpdate = true
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x888888 }))
  const g = new THREE.Group()
  g.add(mesh)
  return g
}

function gltfFromScene(scene: THREE.Group): GLTF {
  return {
    scene,
    scenes: [scene],
    cameras: [],
    animations: [],
    asset: { version: '2.0' },
    parser: {},
    userData: {},
  }
}

describe('trimesh + texture — UV normalization integration', () => {
  it('createPrimitiveMesh (trimesh): after load, UVs are usable — repeat changes effective sampling range', async () => {
    const source = makeGiraffeLikeBadUvScene()
    const mockResolver: DisposableAssetResolver = {
      resolve: () => 'blob:test',
      loadTexture: async () => {
        const tex = new THREE.DataTexture(new Uint8Array([255, 0, 255, 255]), 1, 1, THREE.RGBAFormat)
        tex.needsUpdate = true
        return tex
      },
      loadModel: async () => gltfFromScene(source),
      dispose: () => {},
    }

    const entityMaterial: Entity['material'] = {
      color: [0.7, 0.7, 0.7],
      map: 'tex-a',
      mapRepeat: [2, 3, 0],
    }

    const mesh = await createPrimitiveMesh(
      { type: 'trimesh', model: 'giraffe-like' },
      entityMaterial,
      mockResolver,
    )

    expect(mesh.userData.isTrimeshSource).toBe(true)
    const visual = mesh.userData.trimeshScene as THREE.Group
    let leaf: THREE.Mesh | null = null
    visual.traverse((c) => {
      if (c instanceof THREE.Mesh) leaf = c
    })
    expect(leaf).not.toBeNull()

    const uv = leaf!.geometry.getAttribute('uv')
    let uMin = Infinity
    let uMax = -Infinity
    let vMin = Infinity
    let vMax = -Infinity
    for (let i = 0; i < uv.count; i++) {
      uMin = Math.min(uMin, uv.getX(i))
      uMax = Math.max(uMax, uv.getX(i))
      vMin = Math.min(vMin, uv.getY(i))
      vMax = Math.max(vMax, uv.getY(i))
    }
    expect(uMax - uMin).toBeGreaterThan(0.05)
    expect(vMax - vMin).toBeGreaterThan(0.05)
    expect(uMax).toBeLessThan(2)
    expect(vMax).toBeLessThan(2)

    const mat = leaf!.material as THREE.MeshStandardMaterial
    expect(mat.map).not.toBeNull()
    expect(mat.map!.repeat.x).toBe(2)
    expect(mat.map!.repeat.y).toBe(3)

    mesh.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry?.dispose()
        const m = c.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m?.dispose()
      }
    })
    mat.map?.dispose()
    mockResolver.dispose()
  })
})
