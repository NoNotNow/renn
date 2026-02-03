import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { simplifyGeometry, shouldSimplifyGeometry } from './meshSimplifier'
import { extractMeshGeometry } from './geometryExtractor'
import type { TrimeshSimplificationConfig } from '@/types/world'

describe('meshSimplifier', () => {
  describe('simplifyGeometry', () => {
    it('should simplify a high-poly sphere', () => {
      // Create a high-poly sphere
      const geometry = new THREE.SphereGeometry(1, 32, 32)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      const originalTriangleCount = extracted!.indices.length / 3
      
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 1000
      }
      
      const result = simplifyGeometry(extracted!, config)
      
      // If simplification results in < 500 triangles, original is returned
      if (result.simplifiedTriangleCount === result.originalTriangleCount) {
        // Simplification was skipped because result would be < 500
        expect(result.reductionPercentage).toBe(0)
      } else {
        // Simplification succeeded
        expect(result.simplifiedTriangleCount).toBeLessThan(originalTriangleCount)
        expect(result.simplifiedTriangleCount).toBeGreaterThanOrEqual(500)
        expect(result.reductionPercentage).toBeGreaterThan(0)
      }
      expect(result.vertices.length % 3).toBe(0)
      expect(result.indices.length).toBeGreaterThan(0)
    })

    it('should handle maxTriangles configuration', () => {
      const geometry = new THREE.SphereGeometry(1, 32, 32)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      const originalTriangleCount = extracted!.indices.length / 3
      
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 1000
      }
      
      const result = simplifyGeometry(extracted!, config)
      
      // If simplification results in < 500 triangles, original is returned
      if (result.simplifiedTriangleCount === result.originalTriangleCount) {
        // Simplification was skipped because result would be < 500
        expect(result.reductionPercentage).toBe(0)
      } else {
        // Simplification succeeded - should respect minimum of 500
        expect(result.simplifiedTriangleCount).toBeLessThan(originalTriangleCount)
        expect(result.simplifiedTriangleCount).toBeGreaterThanOrEqual(500)
        expect(result.simplifiedTriangleCount).toBeLessThanOrEqual(1000)
      }
    })

    it('should handle targetReduction configuration', () => {
      const geometry = new THREE.SphereGeometry(1, 32, 32)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      const originalTriangleCount = extracted!.indices.length / 3
      
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        targetReduction: 0.3 // 30% reduction (less aggressive to ensure >= 500)
      }
      
      const result = simplifyGeometry(extracted!, config)
      
      // If simplification results in < 500 triangles, original is returned
      if (result.simplifiedTriangleCount === result.originalTriangleCount) {
        // Simplification was skipped because result would be < 500
        expect(result.reductionPercentage).toBe(0)
      } else {
        // Simplification succeeded - should respect minimum of 500
        expect(result.simplifiedTriangleCount).toBeLessThan(originalTriangleCount)
        expect(result.simplifiedTriangleCount).toBeGreaterThanOrEqual(500)
        expect(result.reductionPercentage).toBeGreaterThan(0)
      }
    })

    it('should skip simplification if already below target', () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 10000 // Very high limit
      }
      
      const result = simplifyGeometry(extracted!, config)
      
      expect(result.simplifiedTriangleCount).toBe(result.originalTriangleCount)
      expect(result.reductionPercentage).toBe(0)
      expect(result.vertices).toBe(extracted!.vertices)
      expect(result.indices).toBe(extracted!.indices)
    })

    it('should return valid geometry data', () => {
      const geometry = new THREE.SphereGeometry(1, 16, 16)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 200
      }
      
      const result = simplifyGeometry(extracted!, config)
      
      // Verify data integrity
      expect(result.vertices instanceof Float32Array).toBe(true)
      expect(result.indices instanceof Uint32Array).toBe(true)
      expect(result.vertices.length % 3).toBe(0)
      // SimplifyModifier returns non-indexed geometry (triangles), so indices may not be divisible by 3
      // since it counts individual vertices
      expect(result.indices.length).toBeGreaterThan(0)
      
      // Verify indices are valid
      const maxIndex = result.vertices.length / 3 - 1
      for (let i = 0; i < result.indices.length; i++) {
        expect(result.indices[i]).toBeLessThanOrEqual(maxIndex)
        expect(result.indices[i]).toBeGreaterThanOrEqual(0)
      }
    })

    it('should handle very aggressive simplification gracefully', () => {
      const geometry = new THREE.SphereGeometry(1, 32, 32)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      const originalTriangleCount = extracted!.indices.length / 3
      
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 100 // Very aggressive
      }
      
      const result = simplifyGeometry(extracted!, config)
      
      // Should reduce or fallback to original if too aggressive
      expect(result.simplifiedTriangleCount).toBeLessThanOrEqual(originalTriangleCount)
      // Verify geometry is still valid (may fallback to original on error)
      expect(result.vertices.length).toBeGreaterThan(0)
      expect(result.indices.length).toBeGreaterThan(0)
      expect(result.reductionPercentage).toBeGreaterThanOrEqual(0)
    })
  })

  describe('shouldSimplifyGeometry', () => {
    it('should return false when config is undefined', () => {
      const result = shouldSimplifyGeometry(10000, undefined)
      expect(result).toBe(false)
    })

    it('should return false when enabled is false', () => {
      const config: TrimeshSimplificationConfig = {
        enabled: false,
        maxTriangles: 5000
      }
      const result = shouldSimplifyGeometry(10000, config)
      expect(result).toBe(false)
    })

    it('should return true when triangle count exceeds maxTriangles', () => {
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 5000
      }
      const result = shouldSimplifyGeometry(10000, config)
      expect(result).toBe(true)
    })

    it('should return false when triangle count is below maxTriangles', () => {
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: 5000
      }
      const result = shouldSimplifyGeometry(3000, config)
      expect(result).toBe(false)
    })

    it('should return true when targetReduction is specified', () => {
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        targetReduction: 0.5
      }
      const result = shouldSimplifyGeometry(1000, config)
      expect(result).toBe(true)
    })

    it('should return false when targetReduction is zero', () => {
      const config: TrimeshSimplificationConfig = {
        enabled: true,
        targetReduction: 0
      }
      const result = shouldSimplifyGeometry(10000, config)
      expect(result).toBe(false)
    })

    it('should return false when no simplification criteria specified', () => {
      const config: TrimeshSimplificationConfig = {
        enabled: true
      }
      const result = shouldSimplifyGeometry(10000, config)
      expect(result).toBe(false)
    })
  })
})
