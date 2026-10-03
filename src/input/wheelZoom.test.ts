import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { CameraController } from '@/camera/cameraController'
import { MAX_ZOOM_LOG_PER_FRAME, MOUSE_ZOOM_LOG_PER_NOTCH, wheelZoomLog } from './wheelZoom'
import { WHEEL_NOTCH_PX } from './wheelGesture'

function orbitController(distance = 10) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  const scene = new THREE.Scene()
  scene.userData.camera = { control: 'follow', mode: 'follow', target: 'player', distance, height: 2 }
  const c = new CameraController({ camera, scene, getEntityPosition: () => new THREE.Vector3(0, 0, 0) })
  const dist = () => (c as unknown as { orbitDistance: number }).orbitDistance
  return { c, dist, camera }
}

describe('wheelZoomLog', () => {
  test('one mouse notch is a fixed percentage', () => {
    expect(wheelZoomLog(WHEEL_NOTCH_PX, 0)).toBeCloseTo(MOUSE_ZOOM_LOG_PER_NOTCH)
    expect(wheelZoomLog(-WHEEL_NOTCH_PX, 0)).toBeCloseTo(-MOUSE_ZOOM_LOG_PER_NOTCH)
  })
  test('is capped per frame so an event burst cannot jump the whole range', () => {
    expect(wheelZoomLog(100000, 0)).toBe(MAX_ZOOM_LOG_PER_FRAME)
    expect(wheelZoomLog(0, -100000)).toBe(-MAX_ZOOM_LOG_PER_FRAME)
  })
  test('no wheel input = no zoom', () => {
    expect(wheelZoomLog(0, 0)).toBe(0)
  })
})

describe('mouse-wheel zoom keeps many intermediate levels (regression: only "very far" / "very near" were reachable)', () => {
  test('each notch changes the distance by a modest, constant percentage', () => {
    const { c, dist } = orbitController(10)
    const levels = [dist()]
    for (let i = 0; i < 8; i++) {
      c.zoomByLog(wheelZoomLog(-WHEEL_NOTCH_PX, 0)) // zoom in
      levels.push(dist())
    }
    for (let i = 1; i < levels.length; i++) {
      const ratio = levels[i]! / levels[i - 1]!
      expect(ratio).toBeGreaterThan(0.85)
      expect(ratio).toBeLessThan(0.95)
    }
    expect(levels[8]!).toBeGreaterThan(3) // 8 notches in from 10 m is nowhere near the 1 m limit
  })

  test('repeated zooming in and out stays reversible: no drift to the clamp limits', () => {
    const { c, dist } = orbitController(10)
    for (let i = 0; i < 200; i++) {
      c.zoomByLog(wheelZoomLog(-WHEEL_NOTCH_PX, 0))
      c.zoomByLog(wheelZoomLog(+WHEEL_NOTCH_PX, 0))
    }
    expect(dist()).toBeCloseTo(10, 5)
  })

  test('a long spin still reaches both limits and is clamped there', () => {
    const { c, dist } = orbitController(10)
    for (let i = 0; i < 60; i++) c.zoomByLog(wheelZoomLog(-WHEEL_NOTCH_PX, 0))
    expect(dist()).toBe(1)
    for (let i = 0; i < 80; i++) c.zoomByLog(wheelZoomLog(+WHEEL_NOTCH_PX, 0))
    expect(dist()).toBe(150)
  })

  test('from 1 m a notch still moves (multiplicative zoom does not get stuck at the limit)', () => {
    const { c, dist } = orbitController(1)
    c.zoomByLog(wheelZoomLog(+WHEEL_NOTCH_PX, 0))
    expect(dist()).toBeGreaterThan(1.1)
  })
})

describe('zoomByLog in the other camera modes', () => {
  function setup(config: Record<string, unknown>) {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 5, 10)
    camera.lookAt(0, 0, 0)
    const scene = new THREE.Scene()
    scene.userData.camera = { target: 'player', distance: 10, height: 2, ...config }
    const target = new THREE.Vector3(0, 0, 0)
    const c = new CameraController({ camera, scene, getEntityPosition: () => target })
    return { c, camera, target }
  }

  test('first person: a notch changes the FOV by a few degrees, many notches are needed for the full range', () => {
    const { c, camera } = setup({ control: 'follow', mode: 'firstPerson' })
    const start = camera.fov
    c.zoomByLog(wheelZoomLog(-WHEEL_NOTCH_PX, 0))
    expect(start - camera.fov).toBeGreaterThan(3)
    expect(start - camera.fov).toBeLessThan(6)
    for (let i = 0; i < 40; i++) c.zoomByLog(wheelZoomLog(-WHEEL_NOTCH_PX, 0))
    expect(camera.fov).toBe(35)
    for (let i = 0; i < 40; i++) c.zoomByLog(wheelZoomLog(WHEEL_NOTCH_PX, 0))
    expect(camera.fov).toBe(75)
  })

  test('edit navigation: multiplicative dolly towards the pivot, no upper clamp', () => {
    const { c, camera, target } = setup({ control: 'follow', mode: 'thirdPerson' })
    c.setForceFreeFlyNavigation(true)
    const d0 = camera.position.distanceTo(target)
    c.zoomByLog(wheelZoomLog(-WHEEL_NOTCH_PX, 0))
    c.update(0.016)
    const d1 = camera.position.distanceTo(target)
    expect(d1 / d0).toBeCloseTo(Math.exp(-MOUSE_ZOOM_LOG_PER_NOTCH), 3)
    for (let i = 0; i < 60; i++) {
      c.zoomByLog(wheelZoomLog(WHEEL_NOTCH_PX, 0))
      c.update(0.016)
    }
    expect(camera.position.distanceTo(target)).toBeGreaterThan(150)
  })

  test('non-finite input is ignored', () => {
    const { c, camera } = setup({ control: 'follow', mode: 'thirdPerson' })
    const before = camera.position.clone()
    c.zoomByLog(Number.NaN)
    c.zoomByLog(Number.POSITIVE_INFINITY)
    c.update(0.016)
    expect(camera.position.distanceTo(before)).toBeLessThan(1e3)
    expect(Number.isFinite(camera.position.x)).toBe(true)
  })
})
