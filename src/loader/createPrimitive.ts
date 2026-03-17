import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import type { Shape, Vec3, Rotation, MaterialRef } from '@/types/world'
import type { DisposableAssetResolver } from './assetResolverImpl'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import { convertZUpToYUpIfNeeded, normalizeSceneToUnitCube } from '@/utils/normalizeModelToUnitCube'

function colorFromRef(material: MaterialRef | undefined): THREE.Color {
  if (material?.color && Array.isArray(material.color)) {
    const [r, g, b] = material.color
    return new THREE.Color(r, g, b)
  }
  return new THREE.Color(0.7, 0.7, 0.7)
}

export async function materialFromRef(
  material: MaterialRef | undefined,
  assetResolver?: DisposableAssetResolver
): Promise<THREE.MeshStandardMaterial> {
  const mat = new THREE.MeshStandardMaterial({
    color: colorFromRef(material),
    roughness: material?.roughness ?? 0.5,
    metalness: material?.metalness ?? 0,
  })

  // Load texture if map is specified
  if (material?.map && assetResolver) {
    const textureLoader = new THREE.TextureLoader()
    const texture = await assetResolver.loadTexture(material.map, textureLoader)
    
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

export type OriginalMaterialEntry = { mesh: THREE.Mesh; material: THREE.Material }

/** Collect cloned materials from every mesh in the scene for later restore. */
function collectOriginalMaterialClones(scene: THREE.Object3D): OriginalMaterialEntry[] {
  const entries: OriginalMaterialEntry[] = []
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material
      const cloned = Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone()
      entries.push({ mesh: child, material: cloned as THREE.Material })
    }
  })
  return entries
}

/**
 * Creates a Three.js mesh for the given shape and material.
 * Does not set position/rotation/scale; caller applies those.
 * 
 * IMPORTANT: Caller is responsible for disposing geometry and material when done:
 *   mesh.geometry.dispose()
 *   mesh.material.dispose()
 */
export async function createPrimitiveMesh(
  shape: Shape,
  materialRef: MaterialRef | undefined,
  assetResolver?: DisposableAssetResolver,
  modelRotation?: Rotation,
  modelScale?: Vec3
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
    case 'ring': {
      const ringShape = shape
      geometry = new THREE.RingGeometry(
        ringShape.innerRadius,
        ringShape.outerRadius,
        32,
        1,
        0,
        Math.PI * 2
      )
      break
    }
    case 'plane': {
      const size = 100
      geometry = new THREE.PlaneGeometry(size * 2, size * 2)
      break
    }
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
            // Store cloned materials for later restore when user clears override
            const originalMaterialEntries = collectOriginalMaterialClones(modelScene)
            if (materialRef !== undefined) {
              const material = await materialFromRef(materialRef, assetResolver)
              modelScene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.material = material
                }
              })
            }
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
    case 'ring': {
      const ringShape = shape
      return new THREE.RingGeometry(
        ringShape.innerRadius,
        ringShape.outerRadius,
        32,
        1,
        0,
        Math.PI * 2
      )
    }
    case 'plane': {
      const size = 100
      return new THREE.PlaneGeometry(size * 2, size * 2)
    }
    case 'trimesh':
      return null
    default:
      return null
  }
}

/**
 * Helper function to dispose a mesh and its resources
 */
export function disposeMesh(mesh: THREE.Mesh): void {
  if (mesh.geometry) {
    mesh.geometry.dispose()
  }
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => mat.dispose())
    } else {
      mesh.material.dispose()
    }
  }
}

/**
 * Builds a mesh for an entity: primitive from shape (or placeholder for trimesh/model).
 * Applies position, rotation, scale from entity.
 * If modelId is provided, loads and uses the 3D model for visuals (shape still used for physics).
 * modelRotation and modelScale apply only to the 3D model/trimesh child (relative to item).
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
  modelScale?: Vec3
): Promise<THREE.Mesh> {
  const s = shape ?? { type: 'box' as const, width: 1, height: 1, depth: 1 }
  const rot = modelRotation ?? DEFAULT_MODEL_ROTATION
  const scl = modelScale ?? DEFAULT_MODEL_SCALE

  // If entity.model is specified, try to load it
  if (modelId && assetResolver) {
    const gltfLoader = new GLTFLoader()
    try {
      const gltf = await assetResolver.loadModel(modelId, gltfLoader)
      if (gltf) {
        const modelScene = gltf.scene.clone(true)
        convertZUpToYUpIfNeeded(modelScene)
        normalizeSceneToUnitCube(modelScene)
        const originalMaterialEntries = collectOriginalMaterialClones(modelScene)
        if (materialRef !== undefined) {
          const material = await materialFromRef(materialRef, assetResolver)
          modelScene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = material
            }
          })
        }
        const resultMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.01, 0.01),
          new THREE.MeshStandardMaterial({ visible: false })
        )
        resultMesh.layers.set(1)
        resultMesh.add(modelScene)
        applyModelTransform(modelScene, rot, scl)
        applyTransform(resultMesh, position, rotation, scale)
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
  const mesh = await createPrimitiveMesh(s, materialRef, assetResolver, rot, scl)
  applyTransform(mesh, position, rotation, scale)
  if (s.type === 'plane' || s.type === 'ring') {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    mesh.quaternion.premultiply(q)
    mesh.userData.visualBaseQuaternion = q
  }
  return mesh
}
