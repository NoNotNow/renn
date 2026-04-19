import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import {
  FRAMING_OFFSET_DIRECTION,
  FRAMING_OFFSET_MULTIPLIER,
  FALLBACK_CAMERA_POSITION,
  frameCamera,
  disposeMaterial,
  disposeObject,
} from './modelPreviewFraming'

function makeCamera(fov = 45): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(fov, 1, 0.1, 100)
}

function makeUnitBoxAt(x: number, y: number, z: number): THREE.Mesh {
  const geom = new THREE.BoxGeometry(1, 1, 1)
  const mat = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(x, y, z)
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('frameCamera — empty object', () => {
  it('falls back to FALLBACK_CAMERA_POSITION and looks at origin', () => {
    const camera = makeCamera()
    const empty = new THREE.Object3D()
    frameCamera(camera, empty)

    expect(camera.position.x).toBe(FALLBACK_CAMERA_POSITION[0])
    expect(camera.position.y).toBe(FALLBACK_CAMERA_POSITION[1])
    expect(camera.position.z).toBe(FALLBACK_CAMERA_POSITION[2])
  })

  it('does not change near/far for empty objects', () => {
    const camera = makeCamera()
    const originalNear = camera.near
    const originalFar = camera.far
    frameCamera(camera, new THREE.Object3D())
    expect(camera.near).toBe(originalNear)
    expect(camera.far).toBe(originalFar)
  })
})

describe('frameCamera — bounded object', () => {
  it('positions camera offset from the bounding box centre', () => {
    const camera = makeCamera()
    const mesh = makeUnitBoxAt(10, 0, 0)
    frameCamera(camera, mesh)

    // The camera should NOT be at the centre — it must be offset along the diagonal.
    expect(camera.position.x).not.toBeCloseTo(10)
    const dirToCenter = new THREE.Vector3(10, 0, 0).sub(camera.position).normalize()
    const expected = new THREE.Vector3(
      -FRAMING_OFFSET_DIRECTION[0],
      -FRAMING_OFFSET_DIRECTION[1],
      -FRAMING_OFFSET_DIRECTION[2],
    ).normalize()
    expect(dirToCenter.x).toBeCloseTo(expected.x, 5)
    expect(dirToCenter.y).toBeCloseTo(expected.y, 5)
    expect(dirToCenter.z).toBeCloseTo(expected.z, 5)
  })

  it('distance from centre matches FOV-fit times multiplier', () => {
    const camera = makeCamera(45)
    const mesh = makeUnitBoxAt(0, 0, 0)
    frameCamera(camera, mesh)

    const fovRad = THREE.MathUtils.degToRad(45)
    const fitDistance = 1 / (2 * Math.tan(fovRad / 2))
    const expectedDistance = fitDistance * FRAMING_OFFSET_MULTIPLIER
    expect(camera.position.length()).toBeCloseTo(expectedDistance, 4)
  })

  it('updates near (clamped to >= 0.01) and far (= distance * 10)', () => {
    const camera = makeCamera()
    const mesh = makeUnitBoxAt(0, 0, 0)
    frameCamera(camera, mesh)

    const fovRad = THREE.MathUtils.degToRad(45)
    const distance = 1 / (2 * Math.tan(fovRad / 2))
    expect(camera.near).toBeCloseTo(Math.max(distance / 100, 0.01), 4)
    expect(camera.far).toBeCloseTo(distance * 10, 4)
  })

  it('clamps near to 0.01 for very small objects', () => {
    const camera = makeCamera()
    const tiny = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001))
    tiny.updateMatrixWorld(true)
    frameCamera(camera, tiny)
    expect(camera.near).toBe(0.01)
  })

  it('uses the largest dimension for distance', () => {
    const camera = makeCamera()
    const wide = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 1))
    wide.updateMatrixWorld(true)
    frameCamera(camera, wide)

    const fovRad = THREE.MathUtils.degToRad(45)
    const expectedDistance = (10 / (2 * Math.tan(fovRad / 2))) * FRAMING_OFFSET_MULTIPLIER
    expect(camera.position.length()).toBeCloseTo(expectedDistance, 4)
  })
})

describe('disposeMaterial', () => {
  it('disposes textures referenced by material properties', () => {
    const tex = new THREE.Texture()
    const texSpy = vi.spyOn(tex, 'dispose')
    const mat = new THREE.MeshStandardMaterial({ map: tex })
    const matSpy = vi.spyOn(mat, 'dispose')

    disposeMaterial(mat)
    expect(texSpy).toHaveBeenCalledTimes(1)
    expect(matSpy).toHaveBeenCalledTimes(1)
  })

  it('disposes the material even when no textures are present', () => {
    const mat = new THREE.MeshBasicMaterial()
    const spy = vi.spyOn(mat, 'dispose')
    disposeMaterial(mat)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('disposes multiple textures (map + normalMap)', () => {
    const map = new THREE.Texture()
    const normalMap = new THREE.Texture()
    const mapSpy = vi.spyOn(map, 'dispose')
    const normalSpy = vi.spyOn(normalMap, 'dispose')
    const mat = new THREE.MeshStandardMaterial({ map, normalMap })

    disposeMaterial(mat)
    expect(mapSpy).toHaveBeenCalledTimes(1)
    expect(normalSpy).toHaveBeenCalledTimes(1)
  })
})

describe('disposeObject', () => {
  it('disposes geometry and material on a single mesh', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geom, mat)
    const geomSpy = vi.spyOn(geom, 'dispose')
    const matSpy = vi.spyOn(mat, 'dispose')

    disposeObject(mesh)
    expect(geomSpy).toHaveBeenCalledTimes(1)
    expect(matSpy).toHaveBeenCalledTimes(1)
  })

  it('traverses nested children', () => {
    const root = new THREE.Group()
    const childGeom = new THREE.BoxGeometry()
    const childMat = new THREE.MeshBasicMaterial()
    const child = new THREE.Mesh(childGeom, childMat)
    root.add(child)
    const grandGeom = new THREE.SphereGeometry()
    const grandMat = new THREE.MeshBasicMaterial()
    const grand = new THREE.Mesh(grandGeom, grandMat)
    child.add(grand)

    const childGeomSpy = vi.spyOn(childGeom, 'dispose')
    const childMatSpy = vi.spyOn(childMat, 'dispose')
    const grandGeomSpy = vi.spyOn(grandGeom, 'dispose')
    const grandMatSpy = vi.spyOn(grandMat, 'dispose')

    disposeObject(root)
    expect(childGeomSpy).toHaveBeenCalledTimes(1)
    expect(childMatSpy).toHaveBeenCalledTimes(1)
    expect(grandGeomSpy).toHaveBeenCalledTimes(1)
    expect(grandMatSpy).toHaveBeenCalledTimes(1)
  })

  it('handles arrays of materials', () => {
    const m1 = new THREE.MeshBasicMaterial()
    const m2 = new THREE.MeshBasicMaterial()
    const m1Spy = vi.spyOn(m1, 'dispose')
    const m2Spy = vi.spyOn(m2, 'dispose')
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [m1, m2])

    disposeObject(mesh)
    expect(m1Spy).toHaveBeenCalledTimes(1)
    expect(m2Spy).toHaveBeenCalledTimes(1)
  })

  it('skips non-mesh objects without throwing', () => {
    const group = new THREE.Group()
    group.add(new THREE.Object3D())
    expect(() => disposeObject(group)).not.toThrow()
  })
})
