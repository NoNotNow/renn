import * as THREE from 'three'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import { MeshoptSimplifier } from 'meshoptimizer'
import type { ExtractedGeometry } from './geometryExtractor'
import type { TrimeshSimplificationConfig } from '@/types/world'

export interface SimplificationResult {
  vertices: Float32Array
  indices: Uint32Array
  /** Preserved when input `ExtractedGeometry.uvs` was present and matched vertex count. */
  uvs?: Float32Array
  /** Preserved when input `ExtractedGeometry.colors` was present and matched vertex count. */
  colors?: Float32Array
  originalTriangleCount: number
  simplifiedTriangleCount: number
  reductionPercentage: number
}

/** Resolve before any synchronous `simplifyGeometry` call (e.g. at start of `loadWorld` / `createPhysicsWorld`). */
export function ensureMeshoptSimplifierReady(): Promise<void> {
  return MeshoptSimplifier.ready
}

function compactIndexedMesh(
  vertices: Float32Array,
  indices: Uint32Array,
  uvs?: Float32Array,
  colors?: Float32Array,
): { vertices: Float32Array; indices: Uint32Array; uvs?: Float32Array; colors?: Float32Array } {
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
  const vertCount = vertices.length / 3
  const hasUv =
    uvs !== undefined && uvs.length === vertCount * 2
  const newUvs = hasUv ? new Float32Array(next * 2) : undefined
  const hasColor = colors !== undefined && colors.length === vertCount * 3
  const newColors = hasColor ? new Float32Array(next * 3) : undefined
  for (const [oldIdx, newIdx] of used) {
    newVerts[newIdx * 3] = vertices[oldIdx * 3]!
    newVerts[newIdx * 3 + 1] = vertices[oldIdx * 3 + 1]!
    newVerts[newIdx * 3 + 2] = vertices[oldIdx * 3 + 2]!
    if (newUvs && uvs) {
      newUvs[newIdx * 2] = uvs[oldIdx * 2]!
      newUvs[newIdx * 2 + 1] = uvs[oldIdx * 2 + 1]!
    }
    if (newColors && colors) {
      newColors[newIdx * 3] = colors[oldIdx * 3]!
      newColors[newIdx * 3 + 1] = colors[oldIdx * 3 + 1]!
      newColors[newIdx * 3 + 2] = colors[oldIdx * 3 + 2]!
    }
  }
  return { vertices: newVerts, indices: newIndices, uvs: newUvs, colors: newColors }
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
      uvs: geometry.uvs,
      colors: geometry.colors,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const positions = geometry.vertices
  const targetIndexCount = Math.max(3, targetTriangleCount * 3)
  // meshoptimizer: relative error vs mesh extent; typical default 0.01 (≈1%). Values above 1 are allowed for
  // aggressive decimation. Do NOT multiply by getScale() — that made tiny/normalized meshes use an impossibly
  // small budget and produced no reduction.
  const rawErr = config.maxError ?? 0.01
  const targetError = Number.isFinite(rawErr) && rawErr > 0 ? rawErr : 0.01

  /**
   * Some production GLBs (e.g. complex scanned models) return unchanged topology when simplify is run
   * with `Prune` only. Try several flag combinations, then simplifySloppy, before giving up.
   */
  type MeshoptFlag = 'LockBorder' | 'Sparse' | 'ErrorAbsolute' | 'Prune' | 'Regularize' | 'Permissive'
  const flagPasses: (MeshoptFlag[] | undefined)[] = [
    ['Prune'],
    undefined,
    ['Permissive'],
    ['Prune', 'Permissive'],
  ]

  let newIndices: Uint32Array | null = null
  for (const flags of flagPasses) {
    const [out] = MeshoptSimplifier.simplify(
      new Uint32Array(geometry.indices),
      positions,
      3,
      targetIndexCount,
      targetError,
      flags,
    )
    const tri = out.length / 3
    if (tri >= 1 && tri < originalTriangleCount) {
      newIndices = out
      break
    }
  }

  if (!newIndices) {
    try {
      const [sloppy] = MeshoptSimplifier.simplifySloppy(
        new Uint32Array(geometry.indices),
        positions,
        3,
        null,
        targetIndexCount,
        targetError,
      )
      const tri = sloppy.length / 3
      if (tri >= 1 && tri < originalTriangleCount) {
        newIndices = sloppy
      }
    } catch {
      /* simplifySloppy can throw on degenerate input */
    }
  }

  const triOut = newIndices ? newIndices.length / 3 : 0
  if (!newIndices || triOut < 1) {
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      uvs: geometry.uvs,
      colors: geometry.colors,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const compacted = compactIndexedMesh(positions, newIndices, geometry.uvs, geometry.colors)
  const simplifiedTriangleCount = compacted.indices.length / 3
  const reductionPercentage =
    originalTriangleCount > 0
      ? ((originalTriangleCount - simplifiedTriangleCount) / originalTriangleCount) * 100
      : 0

  return {
    vertices: compacted.vertices,
    indices: compacted.indices,
    uvs: compacted.uvs,
    colors: compacted.colors,
    originalTriangleCount,
    simplifiedTriangleCount,
    reductionPercentage,
  }
}

function simplifyWithThreeModifier(geometry: ExtractedGeometry, config: TrimeshSimplificationConfig): SimplificationResult {
  const bufferGeometry = new THREE.BufferGeometry()
  bufferGeometry.setAttribute('position', new THREE.BufferAttribute(geometry.vertices, 3))
  bufferGeometry.setIndex(new THREE.BufferAttribute(geometry.indices, 1))
  const nPos = geometry.vertices.length / 3
  if (geometry.uvs && geometry.uvs.length === nPos * 2) {
    bufferGeometry.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs, 2))
  }
  if (geometry.colors && geometry.colors.length === nPos * 3) {
    bufferGeometry.setAttribute('color', new THREE.BufferAttribute(geometry.colors, 3))
  }

  const originalTriangleCount = geometry.indices.length / 3
  const originalVertexCount = geometry.vertices.length / 3
  let targetTriangleCount = computeTargetTriangleCount(originalTriangleCount, config)
  targetTriangleCount = Math.max(500, targetTriangleCount)

  if (originalTriangleCount <= targetTriangleCount) {
    return {
      vertices: geometry.vertices,
      indices: geometry.indices,
      uvs: geometry.uvs,
      colors: geometry.colors,
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
      uvs: geometry.uvs,
      colors: geometry.colors,
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
      uvs: geometry.uvs,
      colors: geometry.colors,
      originalTriangleCount,
      simplifiedTriangleCount: originalTriangleCount,
      reductionPercentage: 0,
    }
  }

  const uvAttr = simplifiedGeometry.getAttribute('uv')
  let outUvs: Float32Array | undefined
  if (uvAttr && uvAttr.count === simplifiedVertexCount) {
    outUvs = new Float32Array(simplifiedVertexCount * 2)
    for (let i = 0; i < simplifiedVertexCount; i++) {
      outUvs[i * 2] = uvAttr.getX(i)
      outUvs[i * 2 + 1] = uvAttr.getY(i)
    }
  }

  const colorAttr = simplifiedGeometry.getAttribute('color')
  let outColors: Float32Array | undefined
  if (colorAttr && colorAttr.count === simplifiedVertexCount) {
    outColors = new Float32Array(simplifiedVertexCount * 3)
    for (let i = 0; i < simplifiedVertexCount; i++) {
      outColors[i * 3] = colorAttr.getX(i)
      outColors[i * 3 + 1] = colorAttr.getY(i)
      outColors[i * 3 + 2] = colorAttr.getZ(i)
    }
  }

  const reductionPercentage = ((originalTriangleCount - simplifiedTriangleCount) / originalTriangleCount) * 100
  simplifiedGeometry.dispose()

  return {
    vertices: simplifiedVerticesArray,
    indices: simplifiedIndices,
    uvs: outUvs,
    colors: outColors,
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
