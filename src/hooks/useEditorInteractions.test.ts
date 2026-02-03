import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

// Test the hierarchy traversal logic for finding entity meshes
// This is the core fix for the raycast selection issue with 3D models
describe('useEditorInteractions - entity hierarchy traversal', () => {
  // Helper function from the implementation
  const findEntityMesh = (obj: THREE.Object3D): THREE.Object3D | null => {
    let current: THREE.Object3D | null = obj
    while (current) {
      if (current.userData?.entityId) {
        return current
      }
      current = current.parent
    }
    return null
  }

  it('should find entityId on a direct mesh', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    mesh.userData.entityId = 'entity1'

    const found = findEntityMesh(mesh)

    expect(found).toBe(mesh)
    expect(found?.userData.entityId).toBe('entity1')
  })

  it('should find entityId on parent when starting from child mesh', () => {
    // Create parent entity mesh (like a loaded 3D model root)
    const parentMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      new THREE.MeshBasicMaterial()
    )
    parentMesh.userData.entityId = 'entity2'

    // Create child mesh (like a part of the 3D model)
    const childMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    childMesh.name = 'childPart'

    // Build hierarchy
    parentMesh.add(childMesh)

    // When raycasting hits the child, we should find the parent entity
    const found = findEntityMesh(childMesh)

    expect(found).toBe(parentMesh)
    expect(found?.userData.entityId).toBe('entity2')
  })

  it('should find entityId through multiple levels of hierarchy', () => {
    // Create parent entity mesh
    const parentMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      new THREE.MeshBasicMaterial()
    )
    parentMesh.userData.entityId = 'entity3'

    // Create intermediate group
    const intermediateGroup = new THREE.Group()

    // Create deep child mesh
    const deepChildMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshBasicMaterial()
    )

    // Build hierarchy: parent -> intermediate -> deepChild
    parentMesh.add(intermediateGroup)
    intermediateGroup.add(deepChildMesh)

    // When raycasting hits the deep child, we should still find the root entity
    const found = findEntityMesh(deepChildMesh)

    expect(found).toBe(parentMesh)
    expect(found?.userData.entityId).toBe('entity3')
  })

  it('should return null when no entityId is found in hierarchy', () => {
    // Create a mesh without entityId
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )

    // Create a child
    const childMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial()
    )
    mesh.add(childMesh)

    const found = findEntityMesh(childMesh)

    expect(found).toBeNull()
  })

  it('should stop at scene root if no entityId found', () => {
    const scene = new THREE.Scene()
    
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    
    scene.add(mesh)

    const found = findEntityMesh(mesh)

    expect(found).toBeNull()
  })
})
