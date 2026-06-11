import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { applySceneFog } from './sceneFog'
import { resolveFogSettings, DEFAULT_FOG } from '@/types/world'

describe('applySceneFog', () => {
  it('clears fog when settings are null', () => {
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xffffff, 1, 2)
    applySceneFog(scene, null)
    expect(scene.fog).toBeNull()
  })

  it('sets linear fog from resolved settings', () => {
    const scene = new THREE.Scene()
    applySceneFog(scene, { color: [0.2, 0.3, 0.4], near: 5, far: 50 })
    expect(scene.fog).toBeInstanceOf(THREE.Fog)
    const fog = scene.fog as THREE.Fog
    expect(fog.near).toBe(5)
    expect(fog.far).toBe(50)
    expect(fog.color.r).toBeCloseTo(0.2)
    expect(fog.color.g).toBeCloseTo(0.3)
    expect(fog.color.b).toBeCloseTo(0.4)
  })
})

describe('resolveFogSettings', () => {
  it('returns null when omitted or false', () => {
    expect(resolveFogSettings(undefined)).toBeNull()
    expect(resolveFogSettings(false)).toBeNull()
  })

  it('merges partial settings and defaults color from skyColor', () => {
    const resolved = resolveFogSettings({ near: 20 }, [1, 0, 0])
    expect(resolved).toEqual({
      color: [1, 0, 0],
      near: 20,
      far: DEFAULT_FOG.far,
    })
  })

  it('ensures far is greater than near', () => {
    const resolved = resolveFogSettings({ near: 100, far: 50 })
    expect(resolved?.near).toBe(100)
    expect(resolved?.far).toBeGreaterThan(100)
  })
})
