/**
 * Integration scenario: box-shaped collider + attached GLB visual (`entity.model` on a primitive).
 *
 * When material overrides (metalness, texture map) are applied, the invisible shape-sized root
 * mesh must keep its proxy material; only the GLTF subtree should receive MeshStandardMaterial.
 * Otherwise the viewport shows a box again while the properties panel still lists the model.
 *
 * Exercises RenderItemRegistry.updateMaterial (same path as Builder material / texture edits).
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { countVisualModelTriangles, getVisualGltfSceneForEntityMesh } from '@/utils/geometryExtractor'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import type { Entity } from '@/types/world'

function buildUsesModelRootLikeLoader(): {
  root: THREE.Mesh
  visualLeaf: THREE.Mesh
  entity: Entity
} {
  const visualLeaf = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  const modelScene = new THREE.Group()
  modelScene.add(visualLeaf)

  const root = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 4),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  root.add(modelScene)
  root.userData.usesModel = true
  root.userData.modelId = 'fixture-model'

  const entity: Entity = {
    id: 'box_with_model',
    bodyType: 'static',
    shape: { type: 'box', width: 2, height: 1, depth: 4 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    model: 'fixture-model',
    material: { color: [0.7, 0.7, 0.7], roughness: 0.5, metalness: 0 },
  }

  return { root, visualLeaf, entity }
}

describe('box + model visual — material updates', () => {
  it('keeps invisible shape proxy on root after metalness change; visual mesh gets new PBR props', async () => {
    const { root, visualLeaf, entity } = buildUsesModelRootLikeLoader()
    const triBefore = countVisualModelTriangles(root)
    expect(triBefore).toBeGreaterThan(200)
    expect(getVisualGltfSceneForEntityMesh(root)).not.toBeNull()

    const registry = RenderItemRegistry.create([{ entity, mesh: root }], null)

    await registry.updateMaterial('box_with_model', {
      ...entity,
      material: { ...entity.material, metalness: 0.85, roughness: 0.15 },
    })

    expect(root.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect((root.material as THREE.MeshBasicMaterial).visible).toBe(false)

    expect(visualLeaf.material).toBeInstanceOf(THREE.MeshStandardMaterial)
    const leafMat = visualLeaf.material as THREE.MeshStandardMaterial
    expect(leafMat.metalness).toBe(0.85)
    expect(leafMat.roughness).toBe(0.15)

    expect(countVisualModelTriangles(root)).toBe(triBefore)
    expect(registry.get('box_with_model')?.entity.material?.metalness).toBe(0.85)
  })

  it('keeps invisible root when a texture map is applied (async material path)', async () => {
    const { root, visualLeaf, entity } = buildUsesModelRootLikeLoader()

    const mockResolver: DisposableAssetResolver = {
      resolve: () => null,
      loadTexture: async () => {
        const tex = new THREE.Texture()
        tex.image = { width: 4, height: 4 } as HTMLImageElement
        tex.needsUpdate = true
        return tex
      },
      loadModel: async () => null,
      dispose: () => {},
    }

    const registry = RenderItemRegistry.create([{ entity, mesh: root }], null)

    await registry.updateMaterial(
      'box_with_model',
      {
        ...entity,
        material: {
          ...entity.material,
          map: 'fixture-tex',
          metalness: 0.3,
        },
      },
      mockResolver,
    )

    expect(root.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect((root.material as THREE.MeshBasicMaterial).visible).toBe(false)

    const leafMat = visualLeaf.material as THREE.MeshStandardMaterial
    expect(leafMat).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(leafMat.map).not.toBeNull()
    leafMat.map?.dispose()
    leafMat.dispose()
  })
})
