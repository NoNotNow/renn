/**
 * Integration scenario: trimesh + GLB-style vertex colors + Performance booster decimation.
 *
 * User flow (manual):
 * 1. Shape → Trimesh, pick a model (e.g. `public/world/assets/flugzeug bunt.glb` when present in the project).
 * 2. Material → "Use model colors" (`material: undefined`) so GLTF vertex colors show.
 * 3. Tools → Performance booster → apply mesh simplification.
 *
 * Regression: decimation must keep the `color` buffer on each mesh; otherwise materials with
 * `vertexColors: true` render black after simplify, even when restoring file materials from the inspector.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { applyTrimeshVisualSimplification } from '@/loader/createPrimitive'
import { ensureMeshoptSimplifierReady } from '@/utils/meshSimplifier'
import { countTrianglesInObject3D, getVisualGltfSceneForEntityMesh } from '@/utils/geometryExtractor'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import type { Entity } from '@/types/world'

const FLUGZEUG_BUNT_GLB = resolve(process.cwd(), 'public/world/assets/flugzeug bunt.glb')

function collectOriginalMaterialClones(scene: THREE.Object3D): Array<{ mesh: THREE.Mesh; material: THREE.Material }> {
  const entries: Array<{ mesh: THREE.Mesh; material: THREE.Material }> = []
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material
      const cloned = Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone()
      entries.push({ mesh: child, material: cloned as THREE.Material })
    }
  })
  return entries
}

/** Max channel value across all vertices (detects "all black" / missing colors). */
function maxColorChannel(geometry: THREE.BufferGeometry): number {
  const attr = geometry.getAttribute('color')
  if (!attr) return 0
  let m = 0
  for (let i = 0; i < attr.count; i++) {
    m = Math.max(m, attr.getX(i), attr.getY(i), attr.getZ(i))
  }
  return m
}

function buildTrimeshLikeVertexColorPlane(): {
  root: THREE.Mesh
  visualLeaf: THREE.Mesh
  entity: Entity
} {
  const visualLeaf = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 96),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.5,
      metalness: 0,
    }),
  )
  const pos = visualLeaf.geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const t = i / Math.max(1, pos.count - 1)
    colors[i * 3] = 0.2 + 0.8 * t
    colors[i * 3 + 1] = 0.15
    colors[i * 3 + 2] = 0.4 + 0.5 * (1 - t)
  }
  visualLeaf.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const modelScene = new THREE.Group()
  modelScene.add(visualLeaf)

  const root = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.01, 0.01),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  root.add(modelScene)
  root.userData.isTrimeshSource = true
  root.userData.trimeshScene = modelScene

  const entity: Entity = {
    id: 'trimesh_vc',
    bodyType: 'static',
    shape: { type: 'trimesh', model: 'fixture' },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: undefined,
  }

  return { root, visualLeaf, entity }
}

async function parseGlbScene(absPath: string): Promise<THREE.Group> {
  const buffer = readFileSync(absPath).buffer
  const loader = new GLTFLoader()
  return new Promise((res, rej) => {
    loader.parse(
      buffer,
      '',
      (gltf) => res(gltf.scene as THREE.Group),
      (err) => rej(err ?? new Error('GLTFLoader.parse failed')),
    )
  })
}

describe('trimesh + Use model colors — performance booster (vertex colors)', () => {
  beforeAll(async () => {
    await ensureMeshoptSimplifierReady()
  })

  it('keeps vertex color attribute on the visual mesh after decimation (synthetic GLB-style mesh)', async () => {
    const { root, visualLeaf, entity } = buildTrimeshLikeVertexColorPlane()
    const gltfScene = getVisualGltfSceneForEntityMesh(root)
    expect(gltfScene).not.toBeNull()

    const beforeMax = maxColorChannel(visualLeaf.geometry)
    expect(beforeMax).toBeGreaterThan(0.5)

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

    const colorAttr = visualLeaf.geometry.getAttribute('color')
    expect(colorAttr).toBeTruthy()
    expect(colorAttr!.count).toBe(visualLeaf.geometry.getAttribute('position').count)
    const afterMax = maxColorChannel(visualLeaf.geometry)
    expect(afterMax).toBeGreaterThan(0.5)
  })

  it('after simplify, clearing material override still shows non-black vertex colors (registry path)', async () => {
    const { root, visualLeaf, entity } = buildTrimeshLikeVertexColorPlane()
    const gltfScene = getVisualGltfSceneForEntityMesh(root)
    expect(gltfScene).not.toBeNull()

    const totalTris = countTrianglesInObject3D(gltfScene!)
    const maxTriangles = Math.max(500, Math.floor(totalTris * 0.3))
    await applyTrimeshVisualSimplification(gltfScene!, {
      enabled: true,
      maxTriangles,
      algorithm: 'meshoptimizer',
      maxError: 0.05,
    })

    const originalMaterialEntries = collectOriginalMaterialClones(gltfScene!)
    root.userData.originalMaterialEntries = originalMaterialEntries

    const mockResolver: DisposableAssetResolver = {
      resolve: () => null,
      loadTexture: async () => null,
      loadModel: async () => null,
      dispose: () => {},
    }

    const withOverride: Entity = {
      ...entity,
      material: { color: [0.2, 0.2, 0.2], roughness: 0.5, metalness: 0 },
    }
    const registry = RenderItemRegistry.create([{ entity: withOverride, mesh: root }], null)
    await registry.updateMaterial('trimesh_vc', withOverride, mockResolver)

    await registry.updateMaterial('trimesh_vc', entity, mockResolver)

    const mat = visualLeaf.material as THREE.MeshStandardMaterial
    expect(mat.vertexColors).toBe(true)
    expect(maxColorChannel(visualLeaf.geometry)).toBeGreaterThan(0.5)

    registry.clear()
  })

  it('optional asset: public/world/assets/flugzeug bunt.glb — vertex colors survive decimation when file is glTF2 + vertex-colored', async () => {
    if (!existsSync(FLUGZEUG_BUNT_GLB)) {
      return
    }
    let scene: THREE.Group
    try {
      scene = await parseGlbScene(FLUGZEUG_BUNT_GLB)
    } catch {
      // File present but not a supported glTF 2 binary (or corrupt); synthetic tests above cover the pipeline.
      return
    }
    let hadColor = false
      scene.updateMatrixWorld(true)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry?.getAttribute('color')) {
          hadColor = true
        }
      })
      if (!hadColor) {
        return
      }

      const totalTris = countTrianglesInObject3D(scene)
      if (totalTris < 800) {
        return
      }

      const maxTriangles = Math.max(500, Math.floor(totalTris * 0.35))
      const changed = await applyTrimeshVisualSimplification(scene, {
        enabled: true,
        maxTriangles,
        algorithm: 'meshoptimizer',
        maxError: 0.05,
      })
      expect(changed).toBe(true)

      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('color')) return
        const pos = o.geometry.getAttribute('position')
        const col = o.geometry.getAttribute('color')
        expect(col.count).toBe(pos.count)
        expect(maxColorChannel(o.geometry)).toBeGreaterThan(0.05)
      })
  })
})
