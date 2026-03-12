import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { findEntityRootForPicking } from './entityPicking'

describe('findEntityRootForPicking', () => {
  it('returns null when object has no entityId ancestor', () => {
    const orphan = new THREE.Mesh()
    expect(findEntityRootForPicking(orphan)).toBeNull()
  })

  it('returns self when object has entityId', () => {
    const root = new THREE.Mesh()
    root.userData.entityId = 'entity-1'
    expect(findEntityRootForPicking(root)).toBe(root)
  })

  it('returns ancestor with entityId when hit object is nested', () => {
    const root = new THREE.Mesh()
    root.userData.entityId = 'entity-1'
    const child = new THREE.Mesh()
    const grandchild = new THREE.Mesh()
    root.add(child)
    child.add(grandchild)
    expect(findEntityRootForPicking(grandchild)).toBe(root)
    expect(findEntityRootForPicking(child)).toBe(root)
  })
})
