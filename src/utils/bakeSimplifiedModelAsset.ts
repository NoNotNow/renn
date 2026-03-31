import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { Entity, RennWorld, TrimeshSimplificationConfig } from '@/types/world'
import { applyTrimeshVisualSimplification } from '@/loader/createPrimitive'
import { clampTrimeshSimplificationConfig } from '@/scripts/migrateWorld'
import { convertZUpToYUpIfNeeded, normalizeSceneToUnitCube } from '@/utils/normalizeModelToUnitCube'
import { normalizeModelTextureUVs } from '@/utils/normalizeModelTextureUVs'

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

export type BakeSimplifiedModelResult = { blob: Blob; simplified: boolean }

function disposeMeshResources(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry?.dispose()
      const m = c.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m?.dispose()
    }
  })
}

/**
 * Loads a GLB from `sourceBlob`, applies the same preprocess + mesh simplification as the runtime
 * loader, and exports a new binary GLB. Used to persist Performance booster output into the global
 * asset store (same asset id), matching texture downscale behavior.
 */
export async function bakeSimplifiedModelAssetBlob(
  sourceBlob: Blob,
  simplification: TrimeshSimplificationConfig
): Promise<BakeSimplifiedModelResult> {
  const loader = new GLTFLoader()
  const buf = await readBlobAsArrayBuffer(sourceBlob)
  const gltf = await loader.parseAsync(buf, '')
  const modelScene = gltf.scene.clone(true)
  convertZUpToYUpIfNeeded(modelScene)
  normalizeSceneToUnitCube(modelScene)
  normalizeModelTextureUVs(modelScene)
  const safe = clampTrimeshSimplificationConfig({ ...simplification, enabled: true })
  const changed = await applyTrimeshVisualSimplification(modelScene, safe)
  if (!changed) {
    disposeMeshResources(modelScene)
    return { blob: sourceBlob, simplified: false }
  }
  const exporter = new GLTFExporter()
  const arrayBuffer = (await exporter.parseAsync(modelScene, { binary: true })) as ArrayBuffer
  disposeMeshResources(modelScene)
  return {
    blob: new Blob([arrayBuffer], { type: 'model/gltf-binary' }),
    simplified: true,
  }
}

export function applyMeshSimplificationToEntityInWorld(
  world: RennWorld,
  entityId: string,
  safe: TrimeshSimplificationConfig
): RennWorld {
  return {
    ...world,
    entities: world.entities.map((e) => {
      if (e.id !== entityId) return e
      if (e.shape?.type === 'trimesh') {
        return { ...e, shape: { ...e.shape, simplification: safe } }
      }
      if (e.model) {
        return { ...e, modelSimplification: safe }
      }
      return e
    }),
  }
}

function getMeshSimplificationConfig(entity: Entity): TrimeshSimplificationConfig | undefined {
  if (entity.shape?.type === 'trimesh') return entity.shape.simplification
  if (entity.model) return entity.modelSimplification
  return undefined
}

function getMeshAssetId(entity: Entity): string | null {
  if (entity.shape?.type === 'trimesh' && entity.shape.model) return entity.shape.model
  if (entity.model) return entity.model
  return null
}

function stripEntityMeshSimplification(entity: Entity): Entity {
  if (entity.shape?.type === 'trimesh') {
    const { simplification: _omit, ...restShape } = entity.shape
    return { ...entity, shape: restShape }
  }
  const { modelSimplification: _omit, ...rest } = entity
  return rest
}

export type PersistMeshSimplificationResult =
  | { ok: true; world: RennWorld; assets: Map<string, Blob> }
  | { ok: false; reason: 'no-entity' | 'no-mesh-asset' | 'no-simplification-config' | 'bake-unchanged' }

/**
 * Reads mesh simplification from the entity in `world`, bakes the simplified GLB into `assets` at the
 * same model asset id, and returns a world document with `shape.simplification` / `modelSimplification`
 * removed so reload does not decimate twice.
 */
export async function persistSimplifiedMeshAssetFromWorld(
  world: RennWorld,
  assets: Map<string, Blob>,
  entityId: string
): Promise<PersistMeshSimplificationResult> {
  const entity = world.entities.find((e) => e.id === entityId)
  if (!entity) return { ok: false, reason: 'no-entity' }
  const cfg = getMeshSimplificationConfig(entity)
  if (!cfg?.enabled) return { ok: false, reason: 'no-simplification-config' }
  const assetId = getMeshAssetId(entity)
  if (!assetId) return { ok: false, reason: 'no-mesh-asset' }
  const blob = assets.get(assetId)
  if (!blob) return { ok: false, reason: 'no-mesh-asset' }
  const safe = clampTrimeshSimplificationConfig(cfg)
  const { blob: outBlob, simplified } = await bakeSimplifiedModelAssetBlob(blob, safe)
  if (!simplified) return { ok: false, reason: 'bake-unchanged' }
  const nextAssets = new Map(assets)
  nextAssets.set(assetId, outBlob)
  const nextWorld: RennWorld = {
    ...world,
    entities: world.entities.map((e) => (e.id === entityId ? stripEntityMeshSimplification(e) : e)),
  }
  return { ok: true, world: nextWorld, assets: nextAssets }
}
