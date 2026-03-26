import * as THREE from 'three'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import { MeshoptSimplifier } from 'meshoptimizer'
import type { ExtractedGeometry } from './geometryExtractor'
import type { TrimeshSimplificationConfig } from '@/types/world'

export interface SimplificationResult {
  vertices: Float32Array
  indices: Uint32Array
  originalTriangleCount: number
  simplifiedTriangleCount: number
  reductionPercentage: number
}

/** Resolve before any synchronous `simplifyGeometry` call (e.g. at start of `loadWorld` / `createPhysicsWorld`). */
export function ensureMeshoptSimplifierReady(): Promise<void> {
  return MeshoptSimplifier.ready
}

function compactIndexedMesh(vertices: Float32Array, indices: Uint32Array): { vertices: Float32Array; indices: Uint32Array } {
  const used = new Map<number, number>()
  let next = 0
  const newIndices = new Uint32Array(indices.length)
  for (let i = 0; i < indices.length; i++) {
    const old = indices[i]!
    let mapped = used.get(old)
    if (mapped === undefined) {
      mapped = next++
      used.set(old, mapped)
    }
    newIndices[i] = mapped
  }
  const newVerts = new Float32Array(next * 3)
  for (const [oldIdx, newIdx] of used) {
    newVerts[newIdx * 3] = vertices[oldIdx * 3]!
    newVerts[newIdx * 3 + 1] = vertices[oldIdx * 3 + 1]!
    newVerts[newIdx * 3 + 2] = vertices[oldIdx * 3 + 2]!
  }
  return { vertices: newVerts, indices: newIndices }
}

export function computeTargetTriangleCount(originalTriangleCount: number, config: TrimeshSimplificationConfig): number {
  if (config.maxTriangles !== undefined) {
    return Math.min(config.maxTriangles, originalTriangleCount)
  }
  if (config.targetReduction !== undefined) {
    return Math.floor(originalTriangleCount * (1 - config.targetReduction))
  }
  return Math.min(5000, originalTriangleCount)
}

function simplifyWithMeshoptimizer(geometry: ExtractedGeometry, config: TrimeshSimplificationConfig): SimplificationResult {
  const originalTriangleCount = geometry.indices.length / 3
  let targetTriangleCount = computeTargetTriangleCount(originalTriangleCount, config)
  targetTriangleCount = Math.max(1, Math.min(targetTriangleCount, originalTriangleCount))
  targetTriangleCount = Math.max(1, targetTriangleCount)

  if (originalTriangleCount <= targetTriangleCount) {
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const indices = new Uint32Array(geometry.indices)
  const positions = geometry.vertices
  const targetIndexCount = Math.max(3, targetTriangleCount * 3)
  // meshoptimizer expects relative error in [0..1] (e.g. 0.01 ≈ 1% of mesh extent). Do NOT multiply by
  // getScale() — that made tiny/normalized meshes use an impossibly small budget and produced no reduction.
  const rawErr = config.maxError ?? 0.01
  const targetError = Number.isFinite(rawErr) ? Math.min(1, Math.max(0, rawErr)) : 0.01

  const [newIndices, _outErr] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3,
    targetIndexCount,
    targetError,
    ['Prune']
  )

  const triOut = newIndices.length / 3
  if (triOut < 1) {
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const compacted = compactIndexedMesh(positions, newIndices)
  const simplifiedTriangleCount = compacted.indices.length / 3
  const reductionPercentage =
    originalTriangleCount > 0
      ? ((originalTriangleCount - simplifiedTriangleCount) / originalTriangleCount) * 100
      : 0

  return {
    vertices: compacted.vertices,
    indices: compacted.indices,
    originalTriangleCount,
    simplifiedTriangleCount,
    reductionPercentage,
  }
}

function simplifyWithThreeModifier(geometry: ExtractedGeometry, config: TrimeshSimplificationConfig): SimplificationResult {
  const bufferGeometry = new THREE.BufferGeometry()
  bufferGeometry.setAttribute('position', new THREE.BufferAttribute(geometry.vertices, 3))
  bufferGeometry.setIndex(new THREE.BufferAttribute(geometry.indices, 1))

  const originalTriangleCount = geometry.indices.length / 3
  const originalVertexCount = geometry.vertices.length / 3
  let targetTriangleCount = computeTargetTriangleCount(originalTriangleCount, config)
  targetTriangleCount = Math.max(500, targetTriangleCount)

  if (originalTriangleCount <= targetTriangleCount) {
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const targetVertexReduction = 1 - targetTriangleCount / originalTriangleCount
  const verticesToRemove = Math.floor(originalVertexCount * targetVertexReduction)
  const maxVerticesToRemove = Math.floor(originalVertexCount * 0.95)
  const safeVerticesToRemove = Math.min(verticesToRemove, maxVerticesToRemove)

  const modifier = new SimplifyModifier()
  const simplifiedGeometry = modifier.modify(bufferGeometry, Math.max(1, safeVerticesToRemove))

  const simplifiedVertices = simplifiedGeometry.getAttribute('position')
  if (!simplifiedVertices || simplifiedVertices.count === 0) {
    simplifiedGeometry.dispose()
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const simplifiedVerticesArray = simplifiedVertices.array as Float32Array
  const simplifiedVertexCount = simplifiedVertices.count
  const simplifiedIndices = new Uint32Array(simplifiedVertexCount)
  for (let i = 0; i < simplifiedVertexCount; i++) {
    simplifiedIndices[i] = i
  }

  const simplifiedTriangleCount = simplifiedVertexCount / 3

  if (simplifiedTriangleCount < 500) {
    simplifiedGeometry.dispose()
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const reductionPercentage = ((originalTriangleCount - simplifiedTriangleCount) / originalTriangleCount) * 100
  simplifiedGeometry.dispose()

  return {
    vertices: simplifiedVerticesArray,
    indices: simplifiedIndices,
    originalTriangleCount,
    simplifiedTriangleCount,
    reductionPercentage,
  }
}

/**
 * Simplify mesh geometry (meshoptimizer by default). Call `ensureMeshoptSimplifierReady()` earlier in the load pipeline.
 */
export function simplifyGeometry(geometry: ExtractedGeometry, config: TrimeshSimplificationConfig): SimplificationResult {
  const algo = config.algorithm ?? 'meshoptimizer'
  if (algo === 'simplifyModifier') {
    return simplifyWithThreeModifier(geometry, config)
  }
  if (!MeshoptSimplifier.supported) {
    console.warn('[meshSimplifier] MeshoptSimplifier not supported, falling back to SimplifyModifier')
    return simplifyWithThreeModifier(geometry, config)
  }
  try {
    return simplifyWithMeshoptimizer(geometry, config)
  } catch (e) {
    console.error('[meshSimplifier] meshoptimizer simplify failed, falling back:', e)
    return simplifyWithThreeModifier(geometry, config)
  }
}

export function shouldSimplifyGeometry(triangleCount: number, config?: TrimeshSimplificationConfig): boolean {
  if (!config || config.enabled === false) {
    return false
  }

  if (config.maxTriangles !== undefined && triangleCount > config.maxTriangles) {
    return true
  }

  if (config.targetReduction !== undefined && config.targetReduction > 0) {
    return true
  }

  return false
}
