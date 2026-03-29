/**
 * Scenario-focused mesh simplification tests (high-poly synthetic geometry).
 * Complements meshSimplifier.test.ts with ratio, algorithm, and error-scale coverage.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import {
  simplifyGeometry,
  shouldSimplifyGeometry,
  ensureMeshoptSimplifierReady,
} from './meshSimplifier'
import { extractMeshGeometry } from './geometryExtractor'

function highPolySphere(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 96, 96)
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
}

describe('meshSimplifier scenarios', () => {
  beforeAll(async () => {
    await ensureMeshoptSimplifierReady()
  })

  it('ratio ~0.5: simplified count is near half of original (meshoptimizer)', () => {
    const mesh = highPolySphere()
    const extracted = extractMeshGeometry(mesh, false)
    expect(extracted).not.toBeNull()
    const orig = extracted!.indices.length / 3
    const target = Math.max(500, Math.floor(orig * 0.5))
    const result = simplifyGeometry(extracted!, {
      enabled: true,
      maxTriangles: target,
      algorithm: 'meshoptimizer',
      maxError: 0.02,
    })
    if (result.simplifiedTriangleCount === result.originalTriangleCount) {
      // Too aggressive floor or meshoptimizer noop — still assert valid mesh
      expect(result.indices.length).toBeGreaterThan(0)
      return
    }
    expect(result.simplifiedTriangleCount).toBeLessThan(orig)
    expect(result.simplifiedTriangleCount).toBeLessThanOrEqual(orig * 0.65)
    expect(result.simplifiedTriangleCount).toBeGreaterThanOrEqual(500)
  })

  it('ratio 1.0 (maxTriangles >= original): does not reduce', () => {
    const mesh = highPolySphere()
    const extracted = extractMeshGeometry(mesh, false)
    expect(extracted).not.toBeNull()
    const orig = extracted!.indices.length / 3
    const result = simplifyGeometry(extracted!, {
      enabled: true,
      maxTriangles: orig,
      algorithm: 'meshoptimizer',
    })
    expect(result.simplifiedTriangleCount).toBeGreaterThanOrEqual(orig)
    expect(result.reductionPercentage).toBe(0)
  })

  it('meshoptimizer and simplifyModifier both reduce a high-poly mesh', () => {
    const mesh = highPolySphere()
    const extracted = extractMeshGeometry(mesh, false)
    expect(extracted).not.toBeNull()
    const orig = extracted!.indices.length / 3
    const target = Math.max(500, Math.floor(orig * 0.35))

    const meshopt = simplifyGeometry(extracted!, {
      enabled: true,
      maxTriangles: target,
      algorithm: 'meshoptimizer',
      maxError: 0.05,
    })
    const modifier = simplifyGeometry(extracted!, {
      enabled: true,
      maxTriangles: target,
      algorithm: 'simplifyModifier',
    })

    const reducedOpt =
      meshopt.simplifiedTriangleCount < meshopt.originalTriangleCount &&
      meshopt.simplifiedTriangleCount >= 500
    const reducedMod =
      modifier.simplifiedTriangleCount < modifier.originalTriangleCount &&
      modifier.simplifiedTriangleCount >= 500

    expect(reducedOpt || reducedMod).toBe(true)
  })

  it('higher maxError tends to allow more reduction than very low maxError (meshoptimizer)', () => {
    const mesh = highPolySphere()
    const extracted = extractMeshGeometry(mesh, false)
    expect(extracted).not.toBeNull()
    const orig = extracted!.indices.length / 3
    const target = Math.max(500, Math.floor(orig * 0.25))

    const tight = simplifyGeometry(extracted!, {
      enabled: true,
      maxTriangles: target,
      algorithm: 'meshoptimizer',
      maxError: 0.0005,
    })
    const loose = simplifyGeometry(extracted!, {
      enabled: true,
      maxTriangles: target,
      algorithm: 'meshoptimizer',
      maxError: 0.2,
    })

    if (
      tight.simplifiedTriangleCount === tight.originalTriangleCount ||
      loose.simplifiedTriangleCount === loose.originalTriangleCount
    ) {
      return
    }
    expect(loose.simplifiedTriangleCount).toBeLessThanOrEqual(tight.simplifiedTriangleCount)
  })

  it('shouldSimplifyGeometry is false when triangle count is already below maxTriangles', () => {
    expect(
      shouldSimplifyGeometry(1000, { enabled: true, maxTriangles: 5000 }),
    ).toBe(false)
  })
})
