import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import type { Shape, Vec3, Quat, MaterialRef } from '@/types/world'
import type { DisposableAssetResolver } from './assetResolverImpl'

function colorFromRef(material: MaterialRef | undefined): THREE.Color {
  if (material?.color && Array.isArray(material.color)) {
    const [r, g, b] = material.color
    return new THREE.Color(r, g, b)
  }
  return new THREE.Color(0.7, 0.7, 0.7)
}

async function materialFromRef(
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

  return mat
}

function applyTransform(
  mesh: THREE.Mesh,
  position: Vec3,
  rotation: Quat,
  scale: Vec3
): void {
  mesh.position.set(position[0], position[1], position[2])
  mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3])
  mesh.scale.set(scale[0], scale[1], scale[2])
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
  assetResolver?: DisposableAssetResolver
): Promise<THREE.Mesh> {
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
            
            // Apply material if specified
            if (materialRef) {
              const material = await materialFromRef(materialRef, assetResolver)
              modelScene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.material = material
                }
              })
            }
            
            // Extract the first mesh or create a group
            const firstMesh = modelScene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
            if (firstMesh) {
              // Store metadata for physics extraction
              firstMesh.userData.isTrimeshSource = true
              firstMesh.userData.trimeshModel = shape.model
              // Store the entire scene for proper geometry extraction
              firstMesh.userData.trimeshScene = modelScene
              return firstMesh
            }
            
            // If no mesh found, wrap the scene in a mesh with dummy geometry
            const wrapperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat)
            wrapperMesh.add(modelScene)
            // Store metadata for physics extraction
            wrapperMesh.userData.isTrimeshSource = true
            wrapperMesh.userData.trimeshModel = shape.model
            wrapperMesh.userData.trimeshScene = modelScene
            return wrapperMesh
          }
        } catch (error) {
          console.error(`Failed to load trimesh model ${shape.model}:`, error)
        }
      }
      // Fallback to box geometry
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
 */
export async function buildEntityMesh(
  shape: Shape | undefined,
  materialRef: MaterialRef | undefined,
  position: Vec3,
  rotation: Quat,
  scale: Vec3,
  assetResolver?: DisposableAssetResolver,
  modelId?: string
): Promise<THREE.Mesh> {
  const s = shape ?? { type: 'box' as const, width: 1, height: 1, depth: 1 }
  
  // If entity.model is specified, try to load it
  if (modelId && assetResolver) {
    const gltfLoader = new GLTFLoader()
    try {
      const gltf = await assetResolver.loadModel(modelId, gltfLoader)
      if (gltf) {
        // Clone the loaded scene
        const modelScene = gltf.scene.clone(true)
        
        // Apply material if specified
        if (materialRef) {
          const material = await materialFromRef(materialRef, assetResolver)
          modelScene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = material
            }
          })
        }
        
        // Find the first mesh in the scene or create wrapper
        let resultMesh: THREE.Mesh
        const firstMesh = modelScene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        if (firstMesh) {
          resultMesh = firstMesh
          // Add remaining children to the mesh
          modelScene.children.forEach(child => {
            if (child !== firstMesh) {
              resultMesh.add(child)
            }
          })
        } else {
          // Wrap the scene in a mesh with tiny geometry
          resultMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, 0.01, 0.01),
            new THREE.MeshStandardMaterial({ visible: false })
          )
          resultMesh.add(modelScene)
        }
        
        applyTransform(resultMesh, position, rotation, scale)
        // Store that this mesh uses a model
        resultMesh.userData.usesModel = true
        resultMesh.userData.modelId = modelId
        return resultMesh
      }
    } catch (error) {
      console.error(`Failed to load entity model ${modelId}:`, error)
    }
  }
  
  // Default: create mesh from shape
  const mesh = await createPrimitiveMesh(s, materialRef, assetResolver)
  applyTransform(mesh, position, rotation, scale)
  if (s.type === 'plane') {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    mesh.quaternion.premultiply(q)
  }
  return mesh
}
