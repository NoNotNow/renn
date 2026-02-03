import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { extractMeshGeometry, getGeometryInfo } from './geometryExtractor'

describe('geometryExtractor', () => {
  describe('extractMeshGeometry', () => {
    it('should extract geometry from a simple box mesh', () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      expect(extracted?.vertices.length).toBeGreaterThan(0)
      expect(extracted?.indices.length).toBeGreaterThan(0)
      expect(extracted?.vertices.length % 3).toBe(0) // Multiple of 3
      expect(extracted?.indices.length % 3).toBe(0) // Triangles
    })

    it('should extract geometry from a sphere with indexed geometry', () => {
      const geometry = new THREE.SphereGeometry(1, 16, 16)
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      expect(extracted?.vertices.length).toBeGreaterThan(0)
      expect(extracted?.indices.length).toBeGreaterThan(0)
      
      // Sphere should have many triangles
      const info = getGeometryInfo(extracted!)
      expect(info.triangleCount).toBeGreaterThan(100)
    })

    it('should handle multiple meshes in a group', () => {
      const group = new THREE.Group()
      
      const mesh1 = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      )
      const mesh2 = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial()
      )
      
      group.add(mesh1)
      group.add(mesh2)
      
      const extracted = extractMeshGeometry(group, false)
      
      expect(extracted).not.toBeNull()
      expect(extracted?.vertices.length).toBeGreaterThan(0)
      expect(extracted?.indices.length).toBeGreaterThan(0)
    })

    it('should apply transforms when requested', () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      
      // Move mesh to position (10, 20, 30)
      mesh.position.set(10, 20, 30)
      mesh.updateMatrixWorld(true)
      
      const extracted = extractMeshGeometry(mesh, true)
      
      expect(extracted).not.toBeNull()
      
      // Check that some vertices are near the translated position
      let foundNearTarget = false
      for (let i = 0; i < extracted!.vertices.length; i += 3) {
        const x = extracted!.vertices[i]
        const y = extracted!.vertices[i + 1]
        const z = extracted!.vertices[i + 2]
        
        // Box vertices should be around (10±0.5, 20±0.5, 30±0.5)
        if (Math.abs(x - 10) < 1 && Math.abs(y - 20) < 1 && Math.abs(z - 30) < 1) {
          foundNearTarget = true
          break
        }
      }
      
      expect(foundNearTarget).toBe(true)
    })

    it('should not apply transforms when not requested', () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      
      // Move mesh to position (10, 20, 30)
      mesh.position.set(10, 20, 30)
      mesh.updateMatrixWorld(true)
      
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      
      // Vertices should still be in local space (around origin)
      let foundNearOrigin = false
      for (let i = 0; i < extracted!.vertices.length; i += 3) {
        const x = extracted!.vertices[i]
        const y = extracted!.vertices[i + 1]
        const z = extracted!.vertices[i + 2]
        
        // Box vertices should be around origin (±0.5)
        if (Math.abs(x) < 1 && Math.abs(y) < 1 && Math.abs(z) < 1) {
          foundNearOrigin = true
          break
        }
      }
      
      expect(foundNearOrigin).toBe(true)
    })

    it('should return null for empty group', () => {
      const group = new THREE.Group()
      
      const extracted = extractMeshGeometry(group, false)
      
      expect(extracted).toBeNull()
    })

    it('should handle non-indexed geometry', () => {
      // Create a simple triangle without indices
      const geometry = new THREE.BufferGeometry()
      const vertices = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ])
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
      // Note: no index attribute set
      
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      
      const extracted = extractMeshGeometry(mesh, false)
      
      expect(extracted).not.toBeNull()
      expect(extracted?.vertices.length).toBe(9) // 3 vertices * 3 components
      expect(extracted?.indices.length).toBe(3) // 1 triangle * 3 indices
      expect(extracted?.indices[0]).toBe(0)
      expect(extracted?.indices[1]).toBe(1)
      expect(extracted?.indices[2]).toBe(2)
    })

    it('should handle scaled geometry', () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const material = new THREE.MeshBasicMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      
      // Scale the mesh
      mesh.scale.set(2, 3, 4)
      mesh.updateMatrixWorld(true)
      
      const extracted = extractMeshGeometry(mesh, true)
      
      expect(extracted).not.toBeNull()
      
      const info = getGeometryInfo(extracted!)
      
      // Check that bounding box reflects the scale
      const sizeX = info.bounds.max.x - info.bounds.min.x
      const sizeY = info.bounds.max.y - info.bounds.min.y
      const sizeZ = info.bounds.max.z - info.bounds.min.z
      
      expect(sizeX).toBeCloseTo(2, 1)
      expect(sizeY).toBeCloseTo(3, 1)
      expect(sizeZ).toBeCloseTo(4, 1)
    })
  })

  describe('getGeometryInfo', () => {
    it('should return correct vertex and triangle counts', () => {
      const vertices = new Float32Array([
        0, 0, 0,  // vertex 0
        1, 0, 0,  // vertex 1
        0, 1, 0,  // vertex 2
        1, 1, 0,  // vertex 3
      ])
      const indices = new Uint32Array([
        0, 1, 2,  // triangle 1
        1, 3, 2,  // triangle 2
      ])
      
      const info = getGeometryInfo({ vertices, indices })
      
      expect(info.vertexCount).toBe(4)
      expect(info.triangleCount).toBe(2)
    })

    it('should calculate correct bounding box', () => {
      const vertices = new Float32Array([
        -1, -1, -1,
        1, 1, 1,
        0, 0, 0,
      ])
      const indices = new Uint32Array([0, 1, 2])
      
      const info = getGeometryInfo({ vertices, indices })
      
      expect(info.bounds.min.x).toBe(-1)
      expect(info.bounds.min.y).toBe(-1)
      expect(info.bounds.min.z).toBe(-1)
      expect(info.bounds.max.x).toBe(1)
      expect(info.bounds.max.y).toBe(1)
      expect(info.bounds.max.z).toBe(1)
    })

    it('should handle single vertex', () => {
      const vertices = new Float32Array([5, 10, 15])
      const indices = new Uint32Array([0, 0, 0])
      
      const info = getGeometryInfo({ vertices, indices })
      
      expect(info.vertexCount).toBe(1)
      expect(info.triangleCount).toBe(1)
      expect(info.bounds.min.x).toBe(5)
      expect(info.bounds.min.y).toBe(10)
      expect(info.bounds.min.z).toBe(15)
      expect(info.bounds.max.x).toBe(5)
      expect(info.bounds.max.y).toBe(10)
      expect(info.bounds.max.z).toBe(15)
    })
  })
})
