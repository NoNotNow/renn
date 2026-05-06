import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyVisualBase,
  createVisualBaseForShape,
  getVisualBase,
  initVisualBaseFromShape,
  isFlatShape,
  setVisualBaseFromShape,
  stripVisualBase,
} from './visualBaseQuaternion'

function quatNearlyEqual(a: THREE.Quaternion, b: THREE.Quaternion, eps = 1e-6) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps && Math.abs(a.w - b.w) < eps
}

describe('isFlatShape', () => {
  it('true for plane', () => {
    expect(isFlatShape('plane')).toBe(true)
  })
  it('false for other shapes and undefined', () => {
    expect(isFlatShape('box')).toBe(false)
    expect(isFlatShape('sphere')).toBe(false)
    expect(isFlatShape(undefined)).toBe(false)
  })
})

describe('createVisualBaseForShape', () => {
  it('returns -PI/2 X-rotation quaternion for plane', () => {
    const q = createVisualBaseForShape('plane')!
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    expect(quatNearlyEqual(q, expected)).toBe(true)
  })

  it('returns undefined for non-flat shapes', () => {
    expect(createVisualBaseForShape('box')).toBeUndefined()
    expect(createVisualBaseForShape(undefined)).toBeUndefined()
  })

  it('allocates a fresh quaternion each call', () => {
    const a = createVisualBaseForShape('plane')!
    const b = createVisualBaseForShape('plane')!
    expect(a).not.toBe(b)
  })
})

describe('setVisualBaseFromShape / getVisualBase', () => {
  it('sets a quaternion on userData for flat shapes', () => {
    const mesh = new THREE.Mesh()
    setVisualBaseFromShape(mesh, 'plane')
    expect(getVisualBase(mesh)).toBeInstanceOf(THREE.Quaternion)
  })

  it('clears userData (sets undefined) for non-flat shapes', () => {
    const mesh = new THREE.Mesh()
    setVisualBaseFromShape(mesh, 'plane')
    expect(getVisualBase(mesh)).toBeDefined()
    setVisualBaseFromShape(mesh, 'box')
    expect(getVisualBase(mesh)).toBeUndefined()
  })
})

describe('initVisualBaseFromShape', () => {
  it('pre-multiplies mesh.quaternion AND stores base for flat shape', () => {
    const mesh = new THREE.Mesh()
    initVisualBaseFromShape(mesh, 'plane')
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    expect(quatNearlyEqual(mesh.quaternion, expected)).toBe(true)
    expect(getVisualBase(mesh)).toBeInstanceOf(THREE.Quaternion)
  })

  it('is a no-op for non-flat shapes', () => {
    const mesh = new THREE.Mesh()
    const before = mesh.quaternion.clone()
    initVisualBaseFromShape(mesh, 'box')
    expect(quatNearlyEqual(mesh.quaternion, before)).toBe(true)
    expect(getVisualBase(mesh)).toBeUndefined()
  })
})

describe('stripVisualBase', () => {
  it('returns input quaternion unchanged when mesh has no base', () => {
    const mesh = new THREE.Mesh()
    const world = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3))
    const result = stripVisualBase(world, mesh)
    expect(quatNearlyEqual(result, world)).toBe(true)
  })

  it('inverts the visual base from a world quaternion', () => {
    const mesh = new THREE.Mesh()
    setVisualBaseFromShape(mesh, 'plane')
    const baseQ = getVisualBase(mesh)!
    const logical = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3))
    const world = logical.clone().premultiply(baseQ)

    const stripped = stripVisualBase(world, mesh)
    expect(quatNearlyEqual(stripped, logical)).toBe(true)
  })

  it('does not mutate the input world quaternion', () => {
    const mesh = new THREE.Mesh()
    setVisualBaseFromShape(mesh, 'plane')
    const baseQ = getVisualBase(mesh)!
    const logical = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0))
    const world = logical.clone().premultiply(baseQ)
    const worldClone = world.clone()
    stripVisualBase(world, mesh)
    expect(quatNearlyEqual(world, worldClone)).toBe(true)
  })

  it('writes into provided out quaternion and returns it', () => {
    const mesh = new THREE.Mesh()
    const world = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0))
    const out = new THREE.Quaternion()
    const returned = stripVisualBase(world, mesh, out)
    expect(returned).toBe(out)
    expect(quatNearlyEqual(out, world)).toBe(true)
  })
})

describe('applyVisualBase', () => {
  it('is no-op when mesh has no base', () => {
    const mesh = new THREE.Mesh()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3))
    const before = q.clone()
    applyVisualBase(q, mesh)
    expect(quatNearlyEqual(q, before)).toBe(true)
  })

  it('pre-multiplies the visual base in place and returns the quaternion', () => {
    const mesh = new THREE.Mesh()
    setVisualBaseFromShape(mesh, 'plane')
    const baseQ = getVisualBase(mesh)!
    const logical = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0))
    const expected = logical.clone().premultiply(baseQ)
    const result = applyVisualBase(logical.clone(), mesh)
    expect(quatNearlyEqual(result, expected)).toBe(true)
  })

  it('stripVisualBase is the inverse of applyVisualBase', () => {
    const mesh = new THREE.Mesh()
    setVisualBaseFromShape(mesh, 'plane')
    const original = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, -0.3))
    const world = applyVisualBase(original.clone(), mesh)
    const back = stripVisualBase(world, mesh)
    expect(quatNearlyEqual(back, original)).toBe(true)
  })
})
