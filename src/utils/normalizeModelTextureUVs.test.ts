import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeModelTextureUVs } from './normalizeModelTextureUVs'

function uvBounds(geom: THREE.BufferGeometry): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const uv = geom.getAttribute('uv')!
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (let i = 0; i < uv.count; i++) {
    uMin = Math.min(uMin, uv.getX(i))
    uMax = Math.max(uMax, uv.getX(i))
    vMin = Math.min(vMin, uv.getY(i))
    vMax = Math.max(vMax, uv.getY(i))
  }
  return { uMin, uMax, vMin, vMax }
}

describe('normalizeModelTextureUVs', () => {
  it('replaces degenerate (constant) UVs with planar XZ projection so repeat can vary sampling', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1)
    const uv = geom.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, 0.25, 0.25)
    }
    uv.needsUpdate = true
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())
    const root = new THREE.Group()
    root.add(mesh)

    normalizeModelTextureUVs(root)
    const b = uvBounds(geom)
    expect(b.uMax - b.uMin).toBeGreaterThan(0.05)
    expect(b.vMax - b.vMin).toBeGreaterThan(0.05)
  })

  it('translates huge UV offsets to origin so fractional range responds to texture repeat', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1)
    const uv = geom.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      uv.setXY(i, u + 900, v + 900)
    }
    uv.needsUpdate = true
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())
    const root = new THREE.Group()
    root.add(mesh)

    normalizeModelTextureUVs(root)
    const b = uvBounds(geom)
    expect(b.uMin).toBeGreaterThanOrEqual(-1e-4)
    expect(b.vMin).toBeGreaterThanOrEqual(-1e-4)
    expect(b.uMax - b.uMin).toBeGreaterThan(0.2)
    expect(b.vMax - b.vMin).toBeGreaterThan(0.2)
    expect(b.uMax).toBeLessThan(2)
    expect(b.vMax).toBeLessThan(2)
  })

  it('squashes extreme UV span into [0,1] per axis', () => {
    const geom = new THREE.PlaneGeometry(1, 1, 1, 1)
    const uv = geom.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, i * 80, i * 80)
    }
    uv.needsUpdate = true
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())
    const root = new THREE.Group()
    root.add(mesh)

    normalizeModelTextureUVs(root)
    const b = uvBounds(geom)
    expect(b.uMin).toBeGreaterThanOrEqual(-1e-4)
    expect(b.vMin).toBeGreaterThanOrEqual(-1e-4)
    expect(b.uMax).toBeLessThanOrEqual(1 + 1e-4)
    expect(b.vMax).toBeLessThanOrEqual(1 + 1e-4)
  })

  it('creates uv attribute when missing (planar XZ)', () => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3),
    )
    geom.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1))
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())
    const root = new THREE.Group()
    root.add(mesh)

    normalizeModelTextureUVs(root)
    const uv = geom.getAttribute('uv')
    expect(uv).toBeTruthy()
    expect(uv!.count).toBe(3)
  })
})
