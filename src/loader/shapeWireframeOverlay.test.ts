import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import type { Entity } from '@/types/world'
import {
  isShapeWireframeOverlayEligible,
  syncShapeWireframeOverlay,
} from './shapeWireframeOverlay'

function baseEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'e1',
    shape: { type: 'box', width: 2, height: 1, depth: 1 },
    model: 'm.glb',
    showShapeWireframe: true,
    ...overrides,
  }
}

describe('shapeWireframeOverlay', () => {
  it('isShapeWireframeOverlayEligible requires usesModel, model, non-trimesh, flag', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.userData.usesModel = true
    expect(isShapeWireframeOverlayEligible(mesh, baseEntity())).toBe(true)
    expect(isShapeWireframeOverlayEligible(mesh, baseEntity({ model: undefined }))).toBe(false)
    expect(isShapeWireframeOverlayEligible(mesh, baseEntity({ showShapeWireframe: false }))).toBe(false)
    expect(isShapeWireframeOverlayEligible(mesh, baseEntity({ shape: { type: 'trimesh', model: 'x' } }))).toBe(
      false,
    )
    const noFlag = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    expect(isShapeWireframeOverlayEligible(noFlag, baseEntity())).toBe(false)
  })

  it('syncShapeWireframeOverlay adds LineSegments with no-op raycast', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1))
    mesh.userData.usesModel = true
    syncShapeWireframeOverlay(mesh, baseEntity())
    const overlay = mesh.children.find(
      (c) => c instanceof THREE.LineSegments && c.userData.isShapeWireframeOverlay === true,
    ) as THREE.LineSegments
    expect(overlay).toBeDefined()
    const inters: THREE.Intersection[] = []
    overlay.raycast(new THREE.Raycaster(), inters)
    expect(inters).toHaveLength(0)
  })

  it('syncShapeWireframeOverlay disposes overlay when toggled off', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.userData.usesModel = true
    syncShapeWireframeOverlay(mesh, baseEntity())
    expect(mesh.children.length).toBe(1)
    const geom = mesh.children[0].geometry
    const disposeSpy = vi.spyOn(geom, 'dispose')
    syncShapeWireframeOverlay(mesh, baseEntity({ showShapeWireframe: false }))
    expect(mesh.children.length).toBe(0)
    expect(disposeSpy).toHaveBeenCalled()
  })

  it('syncShapeWireframeOverlay rebuilds when mesh geometry is replaced', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.userData.usesModel = true
    syncShapeWireframeOverlay(mesh, baseEntity())
    const first = mesh.children[0] as THREE.LineSegments
    mesh.geometry = new THREE.BoxGeometry(3, 1, 1)
    syncShapeWireframeOverlay(mesh, baseEntity())
    const second = mesh.children[0] as THREE.LineSegments
    expect(second).not.toBe(first)
  })
})
