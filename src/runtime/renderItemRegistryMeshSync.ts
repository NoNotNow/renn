import * as THREE from 'three'
import type { Entity, Vec3, Rotation } from '@/types/world'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import {
  applyModelVisualSides,
  createShapeGeometry,
  materialFromRef,
  resolveGltfVisualContext,
} from '@/loader/createPrimitive'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import { disposeMaterialOrArray } from '@/utils/videoTextureLifecycle'
import { syncShapeWireframeOverlay } from '@/loader/shapeWireframeOverlay'
import { updateMeshCastShadowFromWorldAabb } from '@/utils/shadowBounds'
import { setVisualBaseFromShape } from '@/utils/visualBaseQuaternion'
import type { RenderItem } from './renderItem'

const shapeUpdateShadowBox = new THREE.Box3()
const shapeUpdateShadowSize = new THREE.Vector3()

/** Dispose geometry, material (and map) for a mesh and all descendants. Disposes stored originalMaterialEntries. */
export function disposeMeshHierarchy(mesh: THREE.Mesh): void {
  const disposedMaterials = new Set<THREE.Material>()
  const disposeMaterial = (mat: THREE.Material): void => {
    if (disposedMaterials.has(mat)) return
    disposedMaterials.add(mat)
    if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
      mat.map.dispose()
    }
    mat.dispose()
  }
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        obj.geometry.dispose()
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(disposeMaterial)
        } else {
          disposeMaterial(obj.material)
        }
      }
    }
  })
  const entries = mesh.userData.originalMaterialEntries as Array<{ mesh: THREE.Mesh; material: THREE.Material }> | undefined
  if (entries) {
    for (const { material: storedMat } of entries) {
      disposeMaterial(storedMat)
    }
    delete mesh.userData.originalMaterialEntries
  }
}

export function setMeshColor(mesh: THREE.Mesh, r: number, g: number, b: number): void {
  const setColorOn = (mat: THREE.Material) => {
    if ('color' in mat && mat.color instanceof THREE.Color) {
      mat.color.setRGB(r, g, b)
    }
  }
  if (mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true) {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach(setColorOn)
      }
    })
  } else if (mesh.material) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mats.forEach(setColorOn)
  }
}

export function getMeshColor(mesh: THREE.Mesh): [number, number, number] | null {
  const readColorFrom = (mat: THREE.Material): [number, number, number] | null => {
    if ('color' in mat && mat.color instanceof THREE.Color) {
      return [mat.color.r, mat.color.g, mat.color.b]
    }
    return null
  }
  if (mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true) {
    let result: [number, number, number] | null = null
    mesh.traverse((child) => {
      if (result !== null) return
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          result = readColorFrom(mat)
          if (result !== null) return
        }
      }
    })
    return result
  }
  if (mesh.material) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const c = readColorFrom(mat)
      if (c !== null) return c
    }
  }
  return null
}

export function syncAllShapeWireframeOverlaysForItems(
  entities: Entity[],
  getItem: (id: string) => RenderItem | undefined,
): void {
  for (const entity of entities) {
    const item = getItem(entity.id)
    if (!item) continue
    const mesh = item.mesh
    if (!(mesh instanceof THREE.Mesh) || mesh.userData.usesModel !== true) continue
    syncShapeWireframeOverlay(mesh, entity)
  }
}

export type ModelTransformPatch = {
  modelPosition?: Vec3
  modelRotation?: Rotation
  modelScale?: Vec3
  doubleSided?: boolean
}

/**
 * Apply model transform to mesh hierarchy and entity snapshot; rebuild trimesh collider when needed.
 * Caller should refresh culling world size after this returns.
 */
export function applyModelTransformSync(
  id: string,
  item: RenderItem,
  patch: ModelTransformPatch,
  physicsWorld: PhysicsWorld | null,
): Entity {
  const mesh = item.mesh
  const modelScene =
    (mesh.userData.trimeshScene as THREE.Object3D | undefined) ??
    (mesh.userData.usesModel === true && mesh.children.length > 0 ? mesh.children[0] : null)
  const merged: Entity = { ...item.entity, ...patch }
  if ('doubleSided' in patch && !patch.doubleSided) {
    delete merged.doubleSided
  } else if ('doubleSided' in patch && patch.doubleSided) {
    merged.doubleSided = true
  }
  const nextEntity = merged

  const modelVisualTransformChanges =
    patch.modelPosition !== undefined ||
    patch.modelRotation !== undefined ||
    patch.modelScale !== undefined
  if (modelScene && modelVisualTransformChanges) {
    const modelPosition: Vec3 = nextEntity.modelPosition ?? [0, 0, 0]
    const modelRotation: Rotation = nextEntity.modelRotation ?? [0, 0, 0]
    const modelScale: Vec3 = nextEntity.modelScale ?? [1, 1, 1]
    modelScene.position.set(modelPosition[0], modelPosition[1], modelPosition[2])
    modelScene.rotation.set(modelRotation[0], modelRotation[1], modelRotation[2])
    modelScene.scale.set(modelScale[0], modelScale[1], modelScale[2])
  }

  item.entity = nextEntity
  if (mesh.userData.entity !== undefined) {
    mesh.userData.entity = nextEntity
  }

  if (
    modelVisualTransformChanges &&
    item.entity.shape?.type === 'trimesh' &&
    physicsWorld
  ) {
    physicsWorld.updateShape(id, item.entity, mesh)
  }

  const ctx = resolveGltfVisualContext(mesh)
  if (ctx) {
    applyModelVisualSides(
      ctx.modelScene,
      ctx.originalMaterialEntries,
      nextEntity.doubleSided === true,
      nextEntity.material !== undefined,
    )
  }

  return nextEntity
}

/** Sync registry entity snapshot and GLTF material sides (no material allocation). */
export function patchEntityAppearanceSync(item: RenderItem, entity: Entity): void {
  const mesh = item.mesh
  item.entity = entity
  mesh.userData.entity = entity
  const ctx = resolveGltfVisualContext(mesh)
  if (!ctx) return
  applyModelVisualSides(
    ctx.modelScene,
    ctx.originalMaterialEntries,
    entity.doubleSided === true,
    entity.material !== undefined,
  )
}

/**
 * Hot-swap mesh geometry and rebuild physics collider for a primitive shape change.
 * Returns false for trimesh shapes (caller must full-reload).
 */
export function updateEntityShapeSync(
  id: string,
  item: RenderItem,
  newEntity: Entity,
  physicsWorld: PhysicsWorld | null,
): boolean {
  if (newEntity.shape?.type === 'trimesh') return false

  const newGeometry = createShapeGeometry(newEntity.shape ?? { type: 'box', width: 1, height: 1, depth: 1 })
  if (!newGeometry) return false

  const mesh = item.mesh
  const wasFlatShape = item.entity.shape?.type === 'plane'
  const isNowFlatShape = newEntity.shape?.type === 'plane'

  if (wasFlatShape !== isNowFlatShape) {
    const currentRotation = item.getRotation()
    setVisualBaseFromShape(mesh, newEntity.shape?.type)
    item.setRotation(currentRotation)
  }

  const oldGeometry = mesh.geometry
  mesh.geometry = newGeometry
  oldGeometry.dispose()

  mesh.updateMatrixWorld(true)
  updateMeshCastShadowFromWorldAabb(
    mesh,
    newEntity.shape?.type === 'plane',
    shapeUpdateShadowBox,
    shapeUpdateShadowSize,
  )

  item.entity = newEntity
  mesh.userData.entity = newEntity

  if (physicsWorld) {
    physicsWorld.updateShape(id, newEntity, mesh)
  }

  syncShapeWireframeOverlay(mesh, newEntity)

  return true
}

/**
 * Replace mesh material from MaterialRef or restore model originals when material is cleared.
 */
export async function updateEntityMaterialSync(
  item: RenderItem,
  newEntity: Entity,
  assetResolver?: DisposableAssetResolver,
): Promise<void> {
  const mesh = item.mesh
  const isModelMesh = mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true
  if (isModelMesh && newEntity.material === undefined) {
    const entries = mesh.userData.originalMaterialEntries as
      | Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }>
      | undefined
    if (entries && entries.length > 0) {
      for (const { mesh: childMesh, material: storedMat } of entries) {
        const current = childMesh.material
        childMesh.material = storedMat
        if (current && current !== storedMat) {
          disposeMaterialOrArray(current)
        }
      }
    }
  } else {
    const newMat = await materialFromRef(newEntity.material, assetResolver, {
      forceDoubleSided: newEntity.doubleSided === true,
    })
    if (isModelMesh) {
      mesh.traverse((child) => {
        if (child === mesh) return
        if (child instanceof THREE.Mesh) {
          const old = child.material
          child.material = newMat
          if (old) disposeMaterialOrArray(old)
        }
      })
    } else {
      const old = mesh.material
      mesh.material = newMat
      if (old) disposeMaterialOrArray(old)
    }
  }
  item.entity = newEntity
  mesh.userData.entity = newEntity
  if (isModelMesh) {
    const ctx = resolveGltfVisualContext(mesh)
    if (ctx) {
      applyModelVisualSides(
        ctx.modelScene,
        ctx.originalMaterialEntries,
        newEntity.doubleSided === true,
        newEntity.material !== undefined,
      )
    }
  }
}
