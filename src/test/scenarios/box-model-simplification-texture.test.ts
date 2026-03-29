/**
 * Integration scenario: box + GLB visual (teapot-style), texture on material, performance-booster-style decimation (~30%).
 *
 * Mirrors: assign model on box → set `material.map` → simplify mesh in Performance booster.
 * Regression: decimated geometry must keep UVs and normals so the texture and PBR shading still work.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { applyTrimeshVisualSimplification } from '@/loader/createPrimitive'
import { ensureMeshoptSimplifierReady } from '@/utils/meshSimplifier'
import { countTrianglesInObject3D, getVisualGltfSceneForEntityMesh } from '@/utils/geometryExtractor'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import type { Entity } from '@/types/world'

function buildBoxWithHighPolyModelVisual(): {
  root: THREE.Mesh
  visualLeaf: THREE.Mesh
  entity: Entity
} {
  const visualLeaf = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 96),
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
  )
  const modelScene = new THREE.Group()
  modelScene.add(visualLeaf)

  const root = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  root.add(modelScene)
  root.userData.usesModel = true
  root.userData.modelId = 'teapot-like'

  const entity: Entity = {
    id: 'box_teapot',
    bodyType: 'static',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    model: 'teapot-like',
    material: { color: [0.7, 0.7, 0.7], roughness: 0.5, metalness: 0 },
  }

  return { root, visualLeaf, entity }
}

describe('box + model — simplify ~30% then texture (performance booster path)', () => {
  beforeAll(async () => {
    await ensureMeshoptSimplifierReady()
  })

  it('keeps UVs and normals on the visual mesh; material map still applies after simplification', async () => {
    const { root, visualLeaf, entity } = buildBoxWithHighPolyModelVisual()
    const gltfScene = getVisualGltfSceneForEntityMesh(root)
    expect(gltfScene).not.toBeNull()

    const totalTris = countTrianglesInObject3D(gltfScene!)
    expect(totalTris).toBeGreaterThan(2000)

    const maxTriangles = Math.max(500, Math.floor(totalTris * 0.3))
    const simplified = await applyTrimeshVisualSimplification(gltfScene!, {
      enabled: true,
      maxTriangles,
      algorithm: 'meshoptimizer',
      maxError: 0.05,
    })
    expect(simplified).toBe(true)

    expect(visualLeaf.geometry.getAttribute('uv')).toBeTruthy()
    expect(visualLeaf.geometry.getAttribute('normal')).toBeTruthy()
    const pos = visualLeaf.geometry.getAttribute('position')
    expect(visualLeaf.geometry.getAttribute('uv')!.count).toBe(pos.count)

    const mockResolver: DisposableAssetResolver = {
      resolve: () => null,
      loadTexture: async () => {
        const tex = new THREE.Texture()
        tex.image = { width: 8, height: 8 } as HTMLImageElement
        tex.needsUpdate = true
        return tex
      },
      loadModel: async () => null,
      dispose: () => {},
    }

    const registry = RenderItemRegistry.create([{ entity, mesh: root }], null)
    await registry.updateMaterial(
      'box_teapot',
      {
        ...entity,
        material: {
          ...entity.material,
          map: 'fixture-tex',
        },
      },
      mockResolver,
    )

    expect(root.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    const leafMat = visualLeaf.material as THREE.MeshStandardMaterial
    expect(leafMat.map).not.toBeNull()

    registry.clear()
  })
})
