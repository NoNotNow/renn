/**
 * Compare trimesh vertices produced for Rapier (body space) vs Three.js world extraction.
 * Used by integration tests to detect rotation/scale mismatches between simplified physics
 * and rendered meshes (e.g. wrong transform order or axis conventions).
 */

import * as THREE from 'three'
import type { TrimeshSimplificationConfig, Vec3 } from '@/types/world'
import type { ExtractedGeometry } from '@/utils/geometryExtractor'
import {
  extractMeshGeometry,
  getGeometryInfo,
  withTrimeshSceneDetachedFromEntityWrapper,
} from '@/utils/geometryExtractor'
import { shouldSimplifyGeometry, simplifyGeometry } from '@/utils/meshSimplifier'
import { transformTrimeshVertices } from '@/utils/trimeshTransform'

export type TrimeshPhysicsExtractionOptions = {
  simplification?: TrimeshSimplificationConfig
  /** When true, mesh buffers were already decimated in the visual path (`applyTrimeshVisualSimplification`). */
  preSimplified: boolean
  entityScale: Vec3
}

/**
 * Mirrors `PhysicsWorld` trimesh collider construction: world-space geometry under the model root
 * (including GLTF internal nodes), optional simplify, then entity scale only — same as rendering
 * after `applyModelTransform` on the model root.
 */
export function computePhysicsTrimeshVerticesInBodySpace(
  sourceScene: THREE.Object3D,
  options: TrimeshPhysicsExtractionOptions
): Float32Array | null {
  let extractedGeometry: ExtractedGeometry | null = null
  withTrimeshSceneDetachedFromEntityWrapper(sourceScene, () => {
    extractedGeometry = extractMeshGeometry(sourceScene as THREE.Group, true)
  })
  if (!extractedGeometry || extractedGeometry.vertices.length === 0) {
    return null
  }

  let working = extractedGeometry
  const originalInfo = getGeometryInfo(working)
  if (
    !options.preSimplified &&
    options.simplification &&
    shouldSimplifyGeometry(originalInfo.triangleCount, options.simplification)
  ) {
    const simplificationResult = simplifyGeometry(working, options.simplification)
    if (simplificationResult.reductionPercentage > 0) {
      working = {
        vertices: simplificationResult.vertices,
        indices: simplificationResult.indices,
      }
    }
  }

  return transformTrimeshVertices(working.vertices, [0, 0, 0], [1, 1, 1], options.entityScale)
}

/**
 * Positions of all trimesh vertices in the same body space as physics: model transform applied,
 * then entity scale (via a parent `Group`), matching `buildEntityMesh` / `createPrimitiveMesh` hierarchy.
 */
export function computeVisualTrimeshVerticesInBodySpace(
  modelScene: THREE.Object3D,
  entityScale: Vec3
): Float32Array | null {
  const wrapper = new THREE.Group()
  wrapper.add(modelScene)
  wrapper.scale.set(entityScale[0], entityScale[1], entityScale[2])
  wrapper.updateWorldMatrix(true, true)
  const geo = extractMeshGeometry(modelScene as THREE.Group, true)
  return geo?.vertices ?? null
}

/** Axis-aligned bounding box diagonal for `vertices` (3-float tuples). */
export function verticesBoundingBoxDiagonal(vertices: Float32Array): number {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]!
    const y = vertices[i + 1]!
    const z = vertices[i + 2]!
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  const dx = maxX - minX
  const dy = maxY - minY
  const dz = maxZ - minZ
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * One-sided max-min distance: max over sampled points in `a` of distance to nearest point in `b`.
 * Subsamples large clouds for speed (integration test scale).
 */
export function maxNearestNeighborDistanceOneSided(
  a: Float32Array,
  b: Float32Array,
  maxSamplesPerCloud = 2500
): number {
  const na = a.length / 3
  const nb = b.length / 3
  if (na === 0 || nb === 0) return Infinity
  const strideA = Math.max(1, Math.floor(na / maxSamplesPerCloud))
  const strideB = Math.max(1, Math.floor(nb / maxSamplesPerCloud))
  let worst = 0
  for (let i = 0; i < na; i += strideA) {
    const ax = a[i * 3]!
    const ay = a[i * 3 + 1]!
    const az = a[i * 3 + 2]!
    let minD = Infinity
    for (let j = 0; j < nb; j += strideB) {
      const dx = ax - b[j * 3]!
      const dy = ay - b[j * 3 + 1]!
      const dz = az - b[j * 3 + 2]!
      const d = Math.hypot(dx, dy, dz)
      if (d < minD) minD = d
    }
    if (minD > worst) worst = minD
  }
  return worst
}

/** Symmetric surface distance proxy: max of both one-sided NN maxima. */
export function symmetricChamferMax(
  physics: Float32Array,
  visual: Float32Array,
  maxSamplesPerCloud = 2500
): number {
  return Math.max(
    maxNearestNeighborDistanceOneSided(physics, visual, maxSamplesPerCloud),
    maxNearestNeighborDistanceOneSided(visual, physics, maxSamplesPerCloud)
  )
}
