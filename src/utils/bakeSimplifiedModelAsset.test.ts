/**
 * Integration tests: Performance booster mesh output is baked into the project asset map so
 * save/load round-trips the simplified GLB instead of the original file with only JSON flags.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { RennWorld } from '@/types/world'
import { countTrianglesInObject3D } from '@/utils/geometryExtractor'
import { ensureMeshoptSimplifierReady } from '@/utils/meshSimplifier'
import {
  applyMeshSimplificationToEntityInWorld,
  bakeSimplifiedModelAssetBlob,
  persistSimplifiedMeshAssetFromWorld,
} from '@/utils/bakeSimplifiedModelAsset'
import 'fake-indexeddb/auto'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'

async function createHighPolySphereGlbBlob(): Promise<Blob> {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 96),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
  )
  const exporter = new GLTFExporter()
  const arrayBuffer = (await exporter.parseAsync(mesh, { binary: true })) as ArrayBuffer
  mesh.geometry.dispose()
  ;(mesh.material as THREE.Material).dispose()
  return new Blob([arrayBuffer], { type: 'model/gltf-binary' })
}

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return await blob.arrayBuffer()
  }
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

async function triangleCountInGlbBlob(blob: Blob): Promise<number> {
  const loader = new GLTFLoader()
  const gltf = await loader.parseAsync(await readBlobAsArrayBuffer(blob), '')
  return countTrianglesInObject3D(gltf.scene)
}

describe('bakeSimplifiedModelAsset (Performance booster persistence)', () => {
  beforeAll(async () => {
    await ensureMeshoptSimplifierReady()
  })

  it('bakeSimplifiedModelAssetBlob produces a GLB with fewer triangles than the source', async () => {
    const original = await createHighPolySphereGlbBlob()
    const origTris = await triangleCountInGlbBlob(original)
    expect(origTris).toBeGreaterThan(4000)

    const baked = await bakeSimplifiedModelAssetBlob(original, {
      enabled: true,
      maxTriangles: 900,
      algorithm: 'meshoptimizer',
      maxError: 0.05,
    })
    expect(baked.simplified).toBe(true)
    expect(baked.blob.size).toBeGreaterThan(100)

    const bakedTris = await triangleCountInGlbBlob(baked.blob)
    expect(bakedTris).toBeLessThan(origTris)
    expect(bakedTris).toBeLessThanOrEqual(1200)
  })

  it('persistSimplifiedMeshAssetFromWorld replaces the asset, strips simplification from the entity, and survives IndexedDB save/load', async () => {
    const assetId = 'sphere-heavy.glb'
    const originalBlob = await createHighPolySphereGlbBlob()
    const origTris = await triangleCountInGlbBlob(originalBlob)

    const worldWithSimp: RennWorld = applyMeshSimplificationToEntityInWorld(
      {
        version: '1.0',
        world: { gravity: [0, -9.81, 0] },
        entities: [
          {
            id: 'e1',
            bodyType: 'static',
            shape: { type: 'box', width: 1, height: 1, depth: 1 },
            model: assetId,
          },
        ],
      },
      'e1',
      {
        enabled: true,
        maxTriangles: 900,
        algorithm: 'meshoptimizer',
        maxError: 0.05,
      }
    )

    const assets = new Map<string, Blob>([[assetId, originalBlob]])
    const persisted = await persistSimplifiedMeshAssetFromWorld(worldWithSimp, assets, 'e1')
    expect(persisted.ok).toBe(true)
    if (!persisted.ok) throw new Error('expected ok')
    const { world: bakedWorld, assets: bakedAssets } = persisted

    expect(bakedWorld.entities[0]!.modelSimplification).toBeUndefined()
    const outBlob = bakedAssets.get(assetId)
    expect(outBlob).toBeDefined()
    const bakedTris = await triangleCountInGlbBlob(outBlob!)
    expect(bakedTris).toBeLessThan(origTris)

    const persistence = createIndexedDbPersistence()
    const projectId = `perf-booster-bake-test-${Date.now()}`
    await persistence.saveProject(projectId, 'Bake test', { world: bakedWorld, assets: bakedAssets })
    const loaded = await persistence.loadProject(projectId)
    const roundTrip = loaded.assets.get(assetId)
    expect(roundTrip).toBeDefined()
    expect(await triangleCountInGlbBlob(roundTrip!)).toBe(bakedTris)

    await persistence.deleteProject(projectId)
  })
})
