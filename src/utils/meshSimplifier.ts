import * as THREE from 'three'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import type { ExtractedGeometry } from './geometryExtractor'
import type { TrimeshSimplificationConfig } from '@/types/world'

export interface SimplificationResult {
  vertices: Float32Array
  indices: Uint32Array
  originalTriangleCount: number
  simplifiedTriangleCount: number
  reductionPercentage: number
}

/**
 * Simplify mesh geometry using Three.js SimplifyModifier.
 * SimplifyModifier uses the Progressive Mesh Polygon Reduction Algorithm.
 * 
 * @param geometry - The extracted geometry to simplify
 * @param config - Simplification configuration
 * @returns Simplified geometry with statistics
 */
export function simplifyGeometry(
  geometry: ExtractedGeometry,
  config: TrimeshSimplificationConfig
): SimplificationResult {
  // Convert to Three.js BufferGeometry for simplification
  const bufferGeometry = new THREE.BufferGeometry()
  bufferGeometry.setAttribute('position', new THREE.BufferAttribute(geometry.vertices, 3))
  bufferGeometry.setIndex(new THREE.BufferAttribute(geometry.indices, 1))
  
  // Determine target triangle count
  const originalTriangleCount = geometry.indices.length / 3
  const originalVertexCount = geometry.vertices.length / 3
  let targetTriangleCount: number
  
  if (config.maxTriangles !== undefined) {
    targetTriangleCount = Math.min(config.maxTriangles, originalTriangleCount)
  } else if (config.targetReduction !== undefined) {
    targetTriangleCount = Math.floor(originalTriangleCount * (1 - config.targetReduction))
  } else {
    // Default: reduce to 5000 triangles
    targetTriangleCount = Math.min(5000, originalTriangleCount)
  }
  
  // Ensure minimum triangle count (500 to avoid simplification failures)
  targetTriangleCount = Math.max(500, targetTriangleCount)
  
  // Skip if already below target
  if (originalTriangleCount <= targetTriangleCount) {
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0
    }
  }
  
  // Calculate vertices to remove
  // SimplifyModifier works on vertex count, so estimate from triangle reduction
  const targetVertexReduction = 1 - (targetTriangleCount / originalTriangleCount)
  const verticesToRemove = Math.floor(originalVertexCount * targetVertexReduction)
  
  try {
    // Cap vertices to remove to avoid over-simplification
    const maxVerticesToRemove = Math.floor(originalVertexCount * 0.95) // Keep at least 5%
    const safeVerticesToRemove = Math.min(verticesToRemove, maxVerticesToRemove)
    
    // Create simplifier and simplify
    const modifier = new SimplifyModifier()
    const simplifiedGeometry = modifier.modify(bufferGeometry, Math.max(1, safeVerticesToRemove))
    
    // SimplifyModifier returns non-indexed geometry
    const simplifiedVertices = simplifiedGeometry.getAttribute('position')
    if (!simplifiedVertices || simplifiedVertices.count === 0) {
      throw new Error('Simplification resulted in empty geometry')
    }
    
    const simplifiedVerticesArray = simplifiedVertices.array as Float32Array
    const simplifiedVertexCount = simplifiedVertices.count
    
    // Generate sequential indices for non-indexed geometry (triangles)
    const simplifiedIndices = new Uint32Array(simplifiedVertexCount)
    for (let i = 0; i < simplifiedVertexCount; i++) {
      simplifiedIndices[i] = i
    }
    
    const simplifiedTriangleCount = simplifiedVertexCount / 3
    
    // If simplification resulted in fewer than 500 triangles, use original geometry
    if (simplifiedTriangleCount < 500) {
      simplifiedGeometry.dispose()
      return {
        vertices: geometry.vertices,
        indices: geometry.indices,
        originalTriangleCount,
        simplifiedTriangleCount: originalTriangleCount,
        reductionPercentage: 0
      }
    }
    
    const reductionPercentage = ((originalTriangleCount - simplifiedTriangleCount) / originalTriangleCount) * 100
    
    // Clean up
    simplifiedGeometry.dispose()
    
    return {
      vertices: simplifiedVerticesArray,
      indices: simplifiedIndices,
      originalTriangleCount,
      simplifiedTriangleCount,
      reductionPercentage
    }
  } catch (error) {
    console.error('[meshSimplifier] Simplification failed:', error)
    // Return original geometry on error
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0
    }
  }
}

/**
 * Check if geometry should be simplified based on configuration.
 * 
 * @param triangleCount - Current triangle count
 * @param config - Simplification configuration
 * @returns True if simplification should be applied
 */
export function shouldSimplifyGeometry(
  triangleCount: number,
  config?: TrimeshSimplificationConfig
): boolean {
  if (!config || config.enabled === false) {
    return false
  }
  
  // Check if exceeds max triangles threshold
  if (config.maxTriangles !== undefined && triangleCount > config.maxTriangles) {
    return true
  }
  
  // Check if reduction is specified
  if (config.targetReduction !== undefined && config.targetReduction > 0) {
    return true
  }
  
  return false
}
