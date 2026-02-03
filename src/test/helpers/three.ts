import * as THREE from 'three'
import type { Shape } from '@/types/world'

/**
 * Create a test THREE.js mesh
 */
export function createTestMesh(
  geometry?: THREE.BufferGeometry,
  material?: THREE.Material
): THREE.Mesh {
  return new THREE.Mesh(
    geometry ?? new THREE.BoxGeometry(1, 1, 1),
    material ?? new THREE.MeshBasicMaterial()
  )
}

/**
 * Create a THREE.js mesh for a specific shape
 */
export function createMeshForShape(shape: Shape): THREE.Mesh {
  let geometry: THREE.BufferGeometry
  
  switch (shape.type) {
    case 'box':
      geometry = new THREE.BoxGeometry(shape.width, shape.height, shape.depth)
      break
    case 'sphere':
      geometry = new THREE.SphereGeometry(shape.radius)
      break
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height)
      break
    case 'capsule':
      geometry = new THREE.CapsuleGeometry(shape.radius, shape.height)
      break
    case 'plane':
      geometry = new THREE.PlaneGeometry(10, 10)
      break
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1)
  }
  
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
}
