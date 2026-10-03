import { describe, expect, test } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import * as THREE from 'three'
import { CameraController } from '@/camera/cameraController'
import { getRawInputSnapshot, useRawWheelInput } from './rawInput'
import { wheelZoomLog } from './wheelZoom'
import { setWheelBehavior } from './wheelGesture'

/**
 * Whole path of one frame: DOM wheel events → `useRawWheelInput` → `wheelZoomLog` → `CameraController`.
 * Event streams mimic what real devices send; this is the mouse-wheel coverage the trackpad-only testing missed.
 */
function rig() {
  setWheelBehavior('auto')
  const { result } = renderHook(() => useRawWheelInput())
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  const scene = new THREE.Scene()
  scene.userData.camera = { control: 'follow', mode: 'follow', target: 'player', distance: 10, height: 2 }
  const c = new CameraController({ camera, scene, getEntityPosition: () => new THREE.Vector3() })
  const dist = () => (c as unknown as { orbitDistance: number }).orbitDistance
  const fire = (init: WheelEventInit, timeStamp: number) => {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    Object.defineProperty(e, 'timeStamp', { value: timeStamp })
    act(() => {
      document.dispatchEvent(e)
    })
  }
  /** One rendered frame: consume the wheel like `runSceneFrame` does. */
  const frame = () => {
    const w = getRawInputSnapshot({ current: null }, result.current).wheel
    c.zoomByLog(wheelZoomLog(w.mouseWheelDelta ?? 0, w.pinchDelta ?? 0))
    return w
  }
  return { fire, frame, dist }
}

describe('wheel → camera pipeline', () => {
  test('Chrome/Windows mouse wheel: 12 notches in, 12 out walk through many distinct levels and come back', () => {
    const { fire, frame, dist } = rig()
    const levels = new Set<number>()
    let t = 1000
    for (let i = 0; i < 12; i++) {
      fire({ deltaY: -100 }, t)
      frame()
      levels.add(Math.round(dist() * 100))
      t += 300
    }
    expect(dist()).toBeGreaterThan(2) // ≈ 10·e^(−1.44) ≈ 2.4 m — not pinned to the 1 m limit
    for (let i = 0; i < 12; i++) {
      fire({ deltaY: 100 }, t)
      frame()
      levels.add(Math.round(dist() * 100))
      t += 300
    }
    expect(dist()).toBeCloseTo(10, 4)
    expect(levels.size).toBeGreaterThanOrEqual(12) // every notch is its own level; zooming back re-visits them
  })

  test('Firefox mouse wheel (line mode): same feel as Chrome', () => {
    const { fire, frame, dist } = rig()
    fire({ deltaY: -3, deltaMode: 1 }, 1000)
    frame()
    const after = dist()
    expect(after).toBeLessThan(10)
    expect(after).toBeGreaterThan(8.5)
  })

  test('several notches inside one frame (fast spin) are summed but capped, never a full-range jump', () => {
    const { fire, frame, dist } = rig()
    for (let i = 0; i < 30; i++) fire({ deltaY: -100 }, 1000 + i * 4)
    frame()
    expect(dist()).toBeGreaterThan(10 * Math.exp(-0.61))
  })

  test('trackpad two-finger swipe orbits and does not zoom', () => {
    const { fire, frame, dist } = rig()
    let t = 5000
    for (const dy of [1.5, 6.25, 18.5, 33.25, 21.5, 9.75, 3.5]) {
      fire({ deltaY: dy }, t)
      t += 12
    }
    const wheel = frame()
    expect(wheel.deltaY).toBeGreaterThan(90)
    expect(wheel.mouseWheelDelta).toBe(0)
    expect(dist()).toBe(10)
  })

  test('trackpad pinch (ctrl+wheel) zooms smoothly by small steps', () => {
    const { fire, frame, dist } = rig()
    const seen: number[] = []
    let t = 9000
    for (const dy of [-2.5, -3, -3.5, -4, -4.5]) {
      fire({ deltaY: dy, ctrlKey: true }, t)
      frame()
      seen.push(dist())
      t += 16
    }
    expect(new Set(seen).size).toBe(5)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThan(seen[i - 1]!)
    expect(seen.at(-1)!).toBeGreaterThan(5) // a short pinch is not a jump to the limit
  })

  test('Mac external mouse (small steps) can be switched to zoom via the wheel-behavior setting', () => {
    const { fire, frame, dist } = rig()
    fire({ deltaY: 4 }, 1000) // auto: indistinguishable from a trackpad nudge → orbit, no zoom
    frame()
    expect(dist()).toBe(10)
    setWheelBehavior('zoom')
    fire({ deltaY: 4 }, 2000)
    frame()
    expect(dist()).not.toBe(10)
    setWheelBehavior('auto')
  })
})
