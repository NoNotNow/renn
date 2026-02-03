import * as THREE from 'three'

export interface ExtractedGeometry {
  vertices: Float32Array
  indices: Uint32Array
}

/**
 * Extract geometry data from a Three.js mesh for physics collision.
 * Handles BufferGeometry extraction, multiple meshes, transforms, and indexed/non-indexed geometries.
 * 
 * @param meshOrGroup - A THREE.Mesh or THREE.Group to extract geometry from
 * @param applyTransforms - Whether to apply world transforms to vertices (default: true)
 * @returns Extracted geometry with vertices and indices, or null if no valid geometry found
 */
export function extractMeshGeometry(
  meshOrGroup: THREE.Mesh | THREE.Group,
  applyTransforms: boolean = true
): ExtractedGeometry | null {
  const geometries: THREE.BufferGeometry[] = []
  const transforms: THREE.Matrix4[] = []

  // Traverse to find all meshes
  meshOrGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      geometries.push(child.geometry)
      
      // Store transform for this mesh
      if (applyTransforms) {
        const transform = new THREE.Matrix4()
        child.updateWorldMatrix(true, false)
        transform.copy(child.matrixWorld)
        transforms.push(transform)
      } else {
        transforms.push(new THREE.Matrix4()) // identity
      }
    }
  })

  if (geometries.length === 0) {
    console.warn('[geometryExtractor] No geometries found in mesh')
    return null
  }

  // Extract and merge all geometries
  try {
    return mergeGeometries(geometries, transforms)
  } catch (error) {
    console.error('[geometryExtractor] Failed to extract geometry:', error)
    return null
  }
}

/**
 * Merge multiple geometries into single vertex and index arrays.
 * Applies transforms to each geometry before merging.
 * 
 * @param geometries - Array of BufferGeometry objects to merge
 * @param transforms - Array of Matrix4 transforms (one per geometry)
 * @returns Merged geometry with vertices and indices
 */
function mergeGeometries(
  geometries: THREE.BufferGeometry[],
  transforms: THREE.Matrix4[]
): ExtractedGeometry {
  const allVertices: number[] = []
  const allIndices: number[] = []
  let vertexOffset = 0

  for (let i = 0; i < geometries.length; i++) {
    const geometry = geometries[i]
    const transform = transforms[i]

    // Get position attribute
    const positionAttr = geometry.getAttribute('position')
    if (!positionAttr) {
      console.warn('[geometryExtractor] Geometry missing position attribute, skipping')
      continue
    }

    // Extract vertices and apply transform
    const vertexCount = positionAttr.count
    const vertex = new THREE.Vector3()
    
    for (let j = 0; j < vertexCount; j++) {
      vertex.fromBufferAttribute(positionAttr, j)
      vertex.applyMatrix4(transform)
      allVertices.push(vertex.x, vertex.y, vertex.z)
    }

    // Extract or generate indices
    const index = geometry.getIndex()
    if (index) {
      // Indexed geometry - use existing indices with offset
      for (let j = 0; j < index.count; j++) {
        allIndices.push(index.getX(j) + vertexOffset)
      }
    } else {
      // Non-indexed geometry - generate sequential indices
      for (let j = 0; j < vertexCount; j++) {
        allIndices.push(vertexOffset + j)
      }
    }

    vertexOffset += vertexCount
  }

  if (allVertices.length === 0 || allIndices.length === 0) {
    throw new Error('No vertices or indices extracted')
  }

  // Validate indices
  const maxIndex = allVertices.length / 3 - 1
  for (const idx of allIndices) {
    if (idx > maxIndex) {
      throw new Error(`Invalid index ${idx} exceeds vertex count ${maxIndex}`)
    }
  }

  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices),
  }
}

/**
 * Get information about extracted geometry for debugging/logging.
 * 
 * @param geometry - Extracted geometry
 * @returns Object with vertex count, triangle count, and bounding box info
 */
export function getGeometryInfo(geometry: ExtractedGeometry): {
  vertexCount: number
  triangleCount: number
  bounds: { min: THREE.Vector3; max: THREE.Vector3 }
} {
  const vertexCount = geometry.vertices.length / 3
  const triangleCount = geometry.indices.length / 3

  // Calculate bounding box
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)

  for (let i = 0; i < geometry.vertices.length; i += 3) {
    const x = geometry.vertices[i]
    const y = geometry.vertices[i + 1]
    const z = geometry.vertices[i + 2]
    
    min.x = Math.min(min.x, x)
    min.y = Math.min(min.y, y)
    min.z = Math.min(min.z, z)
    
    max.x = Math.max(max.x, x)
    max.y = Math.max(max.y, y)
    max.z = Math.max(max.z, z)
  }

  return { vertexCount, triangleCount, bounds: { min, max } }
}
