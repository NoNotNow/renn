import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import type { Shape, Vec3, Rotation, MaterialRef, TrimeshSimplificationConfig } from '@/types/world'
import type { DisposableAssetResolver } from './assetResolverImpl'
import { PLANE_GEOMETRY_MAX_EDGE } from './planeGeometryConstants'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import { convertZUpToYUpIfNeeded, normalizeSceneToUnitCube } from '@/utils/normalizeModelToUnitCube'
import { normalizeModelTextureUVs } from '@/utils/normalizeModelTextureUVs'
import { initVisualBaseFromShape } from '@/utils/visualBaseQuaternion'
import {
  countTrianglesInObject3D,
  extractMeshGeometryFromMesh,
  triangleCountForBufferGeometry,
} from '@/utils/geometryExtractor'
import {
  computeTargetTriangleCount,
  ensureMeshoptSimplifierReady,
  shouldSimplifyGeometry,
  simplifyGeometry,
} from '@/utils/meshSimplifier'

function colorFromRef(material: MaterialRef | undefined): THREE.Color {
  if (material?.color && Array.isArray(material.color)) {
    const [r, g, b] = material.color
    return new THREE.Color(r, g, b)
  }
  return new THREE.Color(0.7, 0.7, 0.7)
}

export type MaterialFromRefOptions = {
  /** When true, assigns MeshStandardMaterial.side = DoubleSide; otherwise FrontSide. */
  forceDoubleSided?: boolean
}

export async function materialFromRef(
  material: MaterialRef | undefined,
  assetResolver?: DisposableAssetResolver,
  options?: MaterialFromRefOptions
): Promise<THREE.MeshStandardMaterial> {
  const mat = new THREE.MeshStandardMaterial({
    color: colorFromRef(material),
    roughness: material?.roughness ?? 0.5,
    metalness: material?.metalness ?? 0,
    side: options?.forceDoubleSided ? THREE.DoubleSide : THREE.FrontSide,
  })

  // Load texture or video map
  if (material?.map && assetResolver) {
    const textureLoader = new THREE.TextureLoader()
    const texture = assetResolver.isVideoAsset(material.map)
      ? await assetResolver.loadVideoTexture(material.map)
      : await assetResolver.loadTexture(material.map, textureLoader)

    if (texture) {
      mat.map = texture
      mat.needsUpdate = true

      // Apply advanced texture properties
      if (material.mapRepeat) {
        const [x, y] = material.mapRepeat
        texture.repeat.set(x, y)
      }

      if (material.mapWrapS) {
        const wrapMap: Record<string, THREE.Wrapping> = {
          repeat: THREE.RepeatWrapping,
          clampToEdge: THREE.ClampToEdgeWrapping,
          mirroredRepeat: THREE.MirroredRepeatWrapping,
        }
        texture.wrapS = wrapMap[material.mapWrapS] ?? THREE.RepeatWrapping
      }

      if (material.mapWrapT) {
        const wrapMap: Record<string, THREE.Wrapping> = {
          repeat: THREE.RepeatWrapping,
          clampToEdge: THREE.ClampToEdgeWrapping,
          mirroredRepeat: THREE.MirroredRepeatWrapping,
        }
        texture.wrapT = wrapMap[material.mapWrapT] ?? THREE.RepeatWrapping
      }

      if (material.mapOffset) {
        const [x, y] = material.mapOffset
        texture.offset.set(x, y)
      }

      if (material.mapRotation !== undefined) {
        texture.rotation = material.mapRotation
      }
    }
  }

  // Opacity / transparency (default 1 = opaque)
  const rawOpacity = material?.opacity ?? 1
  const opacity = Math.min(1, Math.max(0, Number.isFinite(rawOpacity) ? rawOpacity : 1))
  mat.opacity = opacity
  mat.transparent = opacity < 1
  if (opacity < 1) {
    mat.depthWrite = false
  }

  return mat
}

function applyTransform(
  mesh: THREE.Mesh,
  position: Vec3,
  rotation: Rotation,
  scale: Vec3
): void {
  mesh.position.set(position[0], position[1], position[2])
  const quat = eulerToQuaternion(rotation)
  mesh.quaternion.copy(quat)
  mesh.scale.set(scale[0], scale[1], scale[2])
}

const DEFAULT_MODEL_ROTATION: Rotation = [0, 0, 0]
const DEFAULT_MODEL_SCALE: Vec3 = [1, 1, 1]

function applyModelTransform(
  modelScene: THREE.Object3D,
  modelRotation: Rotation,
  modelScale: Vec3
): void {
  modelScene.rotation.set(modelRotation[0], modelRotation[1], modelRotation[2])
  modelScene.scale.set(modelScale[0], modelScale[1], modelScale[2])
}

export type OriginalMaterialEntry = { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }

function applySideToMeshMaterials(mesh: THREE.Mesh, side: THREE.Side): void {
  const m = mesh.material
  if (Array.isArray(m)) {
    for (const mat of m) {
      mat.side = side
    }
  } else {
    m.side = side
  }
}

/**
 * Sets material.side on every mesh under a GLTF visual root.
 * When `forceDoubleSide`, all drawable materials use DoubleSide.
 * When `usingMaterialOverride` and not forced, uses FrontSide (no per-file sides on the shared override).
 * Otherwise restores each slot's side from `originalMaterialEntries` clones (file defaults).
 */
export function applyModelVisualSides(
  modelScene: THREE.Object3D,
  originalMaterialEntries: OriginalMaterialEntry[] | undefined,
  forceDoubleSide: boolean,
  usingMaterialOverride: boolean
): void {
  const entries = originalMaterialEntries ?? []
  const entryMap = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  for (const e of entries) {
    entryMap.set(e.mesh, e.material)
  }

  modelScene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return
    if (forceDoubleSide) {
      applySideToMeshMaterials(child, THREE.DoubleSide)
      return
    }
    if (usingMaterialOverride) {
      applySideToMeshMaterials(child, THREE.FrontSide)
      return
    }
    const stored = entryMap.get(child)
    if (!stored) {
      applySideToMeshMaterials(child, THREE.FrontSide)
      return
    }
    const cur = child.material
    if (Array.isArray(cur) && Array.isArray(stored)) {
      if (cur.length === stored.length) {
        for (let i = 0; i < cur.length; i++) {
          cur[i]!.side = stored[i]!.side
        }
      } else {
        applySideToMeshMaterials(child, THREE.FrontSide)
      }
      return
    }
    if (!Array.isArray(cur) && !Array.isArray(stored)) {
      cur.side = stored.side
      return
    }
    applySideToMeshMaterials(child, THREE.FrontSide)
  })
}

/** Collect cloned materials from every mesh in the scene for later restore. */
function collectOriginalMaterialClones(scene: THREE.Object3D): OriginalMaterialEntry[] {
  const entries: OriginalMaterialEntry[] = []
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material
      const cloned = Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone()
      entries.push({ mesh: child, material: cloned })
    }
  })
  return entries
}

/** GLTF visual subtree + stored material clones for an entity root mesh (model-on-primitive or trimesh). */
export function resolveGltfVisualContext(root: THREE.Mesh): {
  modelScene: THREE.Object3D
  originalMaterialEntries: OriginalMaterialEntry[] | undefined
} | null {
  if (root.userData.isTrimeshSource === true) {
    return {
      modelScene: root.userData.trimeshScene as THREE.Object3D,
      originalMaterialEntries: root.userData.originalMaterialEntries as OriginalMaterialEntry[] | undefined,
    }
  }
  if (root.userData.usesModel === true && root.children[0]) {
    return {
      modelScene: root.children[0]!,
      originalMaterialEntries: root.userData.originalMaterialEntries as OriginalMaterialEntry[] | undefined,
    }
  }
  return null
}

/**
 * Reduces triangle count for rendering (proportional per mesh) using the same simplification
 * settings as physics. Must run before `applyModelTransform`.
 * Preserves UVs and per-vertex `color` (when present) and recomputes vertex normals so textured
 * `MeshStandardMaterial` and **Use model colors** (`vertexColors`) still render correctly.
 */
export async function applyTrimeshVisualSimplification(
  modelScene: THREE.Object3D,
  simplification: TrimeshSimplificationConfig
): Promise<boolean> {
  await ensureMeshoptSimplifierReady()
  const totalTris = countTrianglesInObject3D(modelScene)
  if (!shouldSimplifyGeometry(totalTris, simplification)) return false

  const targetTotal = Math.min(
    computeTargetTriangleCount(totalTris, simplification),
    simplification.maxTriangles ?? totalTris
  )

  const meshes: THREE.Mesh[] = []
  modelScene.updateWorldMatrix(true, true)
  modelScene.traverse((c) => {
    if (c instanceof THREE.Mesh && c.geometry) meshes.push(c)
  })
  if (meshes.length === 0) return false

  const meshTrisList = meshes.map((m) => triangleCountForBufferGeometry(m.geometry))
  let lastNonZero = -1
  for (let i = 0; i < meshTrisList.length; i++) {
    if (meshTrisList[i]! > 0) lastNonZero = i
  }
  let acc = 0
  const budgets: number[] = []
  for (let i = 0; i < meshes.length; i++) {
    const mt = meshTrisList[i]!
    if (mt === 0) {
      budgets.push(0)
      continue
    }
    if (i === lastNonZero) {
      budgets.push(Math.max(0, targetTotal - acc))
    } else {
      const p = Math.floor((mt / totalTris) * targetTotal)
      budgets.push(p)
      acc += p
    }
  }

  let changed = false
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i]!
    const meshTris = meshTrisList[i]!
    const meshTarget = Math.max(1, Math.min(meshTris, budgets[i] ?? 0))
    if (meshTris <= meshTarget) continue

    const sub: TrimeshSimplificationConfig = {
      ...simplification,
      enabled: true,
      maxTriangles: meshTarget,
      targetReduction: undefined,
    }
    const extracted = extractMeshGeometryFromMesh(mesh)
    if (!extracted) continue
    const result = simplifyGeometry(extracted, sub)
    if (result.reductionPercentage <= 0) continue
    const newGeom = new THREE.BufferGeometry()
    newGeom.setAttribute('position', new THREE.BufferAttribute(result.vertices, 3))
    newGeom.setIndex(new THREE.BufferAttribute(result.indices, 1))
    const nVerts = result.vertices.length / 3
    if (result.uvs && result.uvs.length === nVerts * 2) {
      newGeom.setAttribute('uv', new THREE.BufferAttribute(result.uvs, 2))
    }
    if (result.colors && result.colors.length === nVerts * 3) {
      newGeom.setAttribute('color', new THREE.BufferAttribute(result.colors, 3))
    }
    newGeom.computeVertexNormals()
    mesh.geometry.dispose()
    mesh.geometry = newGeom
    changed = true
  }
  return changed
}

/**
 * Creates a Three.js mesh for the given shape and material.
 * Does not set position/rotation/scale; caller applies those.
 *
 * IMPORTANT: Caller is responsible for disposing geometry and material when done:
 *   mesh.geometry.dispose()
 *   mesh.material.dispose()
 */
export type CreatePrimitiveMeshOptions = {
  /** Applies to loaded trimesh GLTF visuals only. */
  doubleSided?: boolean
}

export async function createPrimitiveMesh(
  shape: Shape,
  materialRef: MaterialRef | undefined,
  assetResolver?: DisposableAssetResolver,
  modelRotation?: Rotation,
  modelScale?: Vec3,
  options?: CreatePrimitiveMeshOptions
): Promise<THREE.Mesh> {
  const rot = modelRotation ?? DEFAULT_MODEL_ROTATION
  const scl = modelScale ?? DEFAULT_MODEL_SCALE
  const mat = await materialFromRef(materialRef, assetResolver)
  let geometry: THREE.BufferGeometry

  switch (shape.type) {
    case 'box':
      geometry = new THREE.BoxGeometry(shape.width, shape.height, shape.depth)
      break
    case 'sphere':
      geometry = new THREE.SphereGeometry(shape.radius, 32, 32)
      break
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 32)
      break
    case 'capsule':
      geometry = new THREE.CapsuleGeometry(shape.radius, Math.max(0, shape.height - 2 * shape.radius), 8, 16)
      break
    case 'cone':
      geometry = new THREE.ConeGeometry(shape.radius, shape.height, 32)
      break
    case 'pyramid':
      geometry = new THREE.ConeGeometry(shape.baseSize / Math.SQRT2, shape.height, 4)
      break
    case 'plane':
      geometry = new THREE.PlaneGeometry(PLANE_GEOMETRY_MAX_EDGE, PLANE_GEOMETRY_MAX_EDGE)
      break
    case 'trimesh': {
      // Load model if assetResolver is available
      if (shape.model && assetResolver) {
        const gltfLoader = new GLTFLoader()
        try {
          const gltf = await assetResolver.loadModel(shape.model, gltfLoader)
          if (gltf) {
            // Clone the loaded scene to create a new instance
            const modelScene = gltf.scene.clone(true)
            convertZUpToYUpIfNeeded(modelScene)
            normalizeSceneToUnitCube(modelScene)
            normalizeModelTextureUVs(modelScene)
            let trimeshGeometriesSimplified = false
            if (shape.simplification) {
              trimeshGeometriesSimplified = await applyTrimeshVisualSimplification(modelScene, shape.simplification)
            }
            // Store cloned materials for later restore when user clears override
            const originalMaterialEntries = collectOriginalMaterialClones(modelScene)
            const usingMatOverride = materialRef !== undefined
            if (usingMatOverride) {
              const material = await materialFromRef(materialRef, assetResolver, {
                forceDoubleSided: options?.doubleSided === true,
              })
              modelScene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.material = material
                }
              })
            }
            applyModelVisualSides(modelScene, originalMaterialEntries, !!options?.doubleSided, usingMatOverride)
            const wrapperMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.01, 0.01, 0.01),
              new THREE.MeshStandardMaterial({ visible: false })
            )
            wrapperMesh.layers.set(1)
            wrapperMesh.add(modelScene)
            applyModelTransform(modelScene, rot, scl)
            wrapperMesh.userData.isTrimeshSource = true
            wrapperMesh.userData.trimeshModel = shape.model
            wrapperMesh.userData.trimeshScene = modelScene
            wrapperMesh.userData.trimeshGeometriesSimplified = trimeshGeometriesSimplified
            wrapperMesh.userData.originalMaterialEntries = originalMaterialEntries
            mat.dispose()
            return wrapperMesh
          }
        } catch (error) {
          console.error(`[createPrimitive] Failed to load trimesh model ${shape.model}:`, error)
        }
      }
      console.warn('[createPrimitive] Trimesh model not loaded, using box fallback')
      geometry = new THREE.BoxGeometry(1, 1, 1)
      break
    }
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1)
  }

  return new THREE.Mesh(geometry, mat)
}

/**
 * Creates only the Three.js geometry for a primitive shape (no mesh, no material).
 * Returns null for trimesh shapes — those require a full mesh rebuild.
 * Dimensions come from the shape; entity scale is applied via mesh.scale separately.
 */
export function createShapeGeometry(shape: Shape): THREE.BufferGeometry | null {
  switch (shape.type) {
    case 'box':
      return new THREE.BoxGeometry(shape.width, shape.height, shape.depth)
    case 'sphere':
      return new THREE.SphereGeometry(shape.radius, 32, 32)
    case 'cylinder':
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 32)
    case 'capsule':
      return new THREE.CapsuleGeometry(shape.radius, Math.max(0, shape.height - 2 * shape.radius), 8, 16)
    case 'cone':
      return new THREE.ConeGeometry(shape.radius, shape.height, 32)
    case 'pyramid':
      return new THREE.ConeGeometry(shape.baseSize / Math.SQRT2, shape.height, 4)
    case 'plane':
      return new THREE.PlaneGeometry(PLANE_GEOMETRY_MAX_EDGE, PLANE_GEOMETRY_MAX_EDGE)
    case 'trimesh':
      return null
    default:
      return null
  }
}

/**
 * Builds a mesh for an entity: primitive from shape (or placeholder for trimesh/model).
 * Applies position, rotation, scale from entity.
 * If modelId is provided, loads and uses the 3D model for visuals (shape still used for physics).
 * modelRotation and modelScale apply only to the 3D model/trimesh child (relative to item).
 * modelSimplification decimates the visual GLTF only (physics stays the primitive).
 */
export async function buildEntityMesh(
  shape: Shape | undefined,
  materialRef: MaterialRef | undefined,
  position: Vec3,
  rotation: Rotation,
  scale: Vec3,
  assetResolver?: DisposableAssetResolver,
  modelId?: string,
  modelRotation?: Rotation,
  modelScale?: Vec3,
  modelSimplification?: TrimeshSimplificationConfig,
  doubleSided?: boolean
): Promise<THREE.Mesh> {
  const s = shape ?? { type: 'box' as const, width: 1, height: 1, depth: 1 }
  const rot = modelRotation ?? DEFAULT_MODEL_ROTATION
  const scl = modelScale ?? DEFAULT_MODEL_SCALE

  // If entity.model is specified, try to load it: shape-sized root (clickable) + model child (visual only)
  if (modelId && assetResolver) {
    const gltfLoader = new GLTFLoader()
    try {
      const gltf = await assetResolver.loadModel(modelId, gltfLoader)
      if (gltf) {
        const modelScene = gltf.scene.clone(true)
        convertZUpToYUpIfNeeded(modelScene)
        normalizeSceneToUnitCube(modelScene)
        normalizeModelTextureUVs(modelScene)
        const originalMaterialEntries = collectOriginalMaterialClones(modelScene)
        const usingMatOverride = materialRef !== undefined
        if (usingMatOverride) {
          const material = await materialFromRef(materialRef, assetResolver, {
            forceDoubleSided: doubleSided === true,
          })
          modelScene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = material
            }
          })
        }
        if (modelSimplification?.enabled) {
          await applyTrimeshVisualSimplification(modelScene, modelSimplification)
        }
        applyModelVisualSides(modelScene, originalMaterialEntries, doubleSided === true, usingMatOverride)
        // Root mesh uses shape-sized geometry so the full shape is the clickable area (raycast hits this)
        const shapeGeometry = createShapeGeometry(s)
        const geometry = shapeGeometry ?? new THREE.BoxGeometry(1, 1, 1)
        const resultMesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ visible: false })
        )
        resultMesh.add(modelScene)
        applyModelTransform(modelScene, rot, scl)
        applyTransform(resultMesh, position, rotation, scale)
        initVisualBaseFromShape(resultMesh, s.type)
        resultMesh.userData.usesModel = true
        resultMesh.userData.modelId = modelId
        resultMesh.userData.originalMaterialEntries = originalMaterialEntries
        return resultMesh
      }
    } catch (error) {
      console.error(`Failed to load entity model ${modelId}:`, error)
    }
  }

  // Default: create mesh from shape
  const mesh = await createPrimitiveMesh(s, materialRef, assetResolver, rot, scl, { doubleSided })
  applyTransform(mesh, position, rotation, scale)
  initVisualBaseFromShape(mesh, s.type)
  return mesh
}
