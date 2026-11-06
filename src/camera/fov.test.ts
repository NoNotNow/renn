import { describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import {
  applyCameraFov,
  horizontalFovToVerticalDeg,
  MAX_VERTICAL_FOV_DEG,
} from './fov'
import { DEFAULT_HORIZONTAL_FOV_DEG } from '@/types/world'

describe('horizontalFovToVerticalDeg', () => {
  test('90° horizontal on a 21:9 window keeps the same left-right span', () => {
    const v = horizontalFovToVerticalDeg(90, 21 / 9)
    // A horizontal span of 2·tan(45°) at that aspect maps to a vertical span of 2·atan(9/21) ≈ 46.4°.
    expect(v).toBeCloseTo((2 * Math.atan(9 / 21) * 180) / Math.PI, 2)
  })

  test('is monotonic and saturates at the half-space limit from both sides', () => {
    expect(horizontalFovToVerticalDeg(20, 16 / 9)).toBeLessThan(horizontalFovToVerticalDeg(30, 16 / 9))
    expect(horizontalFovToVerticalDeg(179, 16 / 9)).toBeLessThan(MAX_VERTICAL_FOV_DEG)
    expect(horizontalFovToVerticalDeg(180, 1)).toBe(MAX_VERTICAL_FOV_DEG)
    expect(horizontalFovToVerticalDeg(360, 1)).toBe(MAX_VERTICAL_FOV_DEG)
    expect(horizontalFovToVerticalDeg(300, 16 / 9)).toBe(MAX_VERTICAL_FOV_DEG)
  })
})

describe('applyCameraFov', () => {
  test('applies the default 90° horizontal on first call', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
    const spy = vi.spyOn(camera, 'updateProjectionMatrix')
    applyCameraFov(camera)
    expect(camera.fov).toBeCloseTo(horizontalFovToVerticalDeg(90, 16 / 9))
    expect(spy).toHaveBeenCalled()
  })

  test('same value and aspect is a no-op (no projection rebuilds in the frame loop)', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
    applyCameraFov(camera)
    const fov = camera.fov
    const spy = vi.spyOn(camera, 'updateProjectionMatrix')
    applyCameraFov(camera)
    expect(camera.fov).toBe(fov)
    expect(spy).not.toHaveBeenCalled()
  })

  test('clamps out-of-range settings to the 20–360 slider bounds', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
    applyCameraFov(camera, 5)
    expect(camera.fov).toBeCloseTo(horizontalFovToVerticalDeg(20, 16 / 9))
    applyCameraFov(camera, 2000)
    expect(camera.fov).toBe(MAX_VERTICAL_FOV_DEG)
  })
})

describe('default', () => {
  test('is 90° horizontal', () => {
    expect(DEFAULT_HORIZONTAL_FOV_DEG).toBe(90)
  })
})
