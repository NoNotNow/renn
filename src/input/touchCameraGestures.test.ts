import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  TouchCameraGestureRecognizer,
  useTouchCameraGestures,
} from './touchCameraGestures'
import type { RawMouseDragState } from '@/input/rawMouseDrag'
import type { RawWheelState } from '@/types/transformer'

describe('TouchCameraGestureRecognizer (pure classification + delta math)', () => {
  it('one finger produces per-move orbit deltas', () => {
    const r = new TouchCameraGestureRecognizer()
    expect(r.pointerDown(1, 100, 100)).toBe('orbit')
    expect(r.pointerMove(1, 130, 90)).toEqual({ kind: 'orbit', orbitX: 30, orbitY: -10, pinchPx: 0 })
    expect(r.pointerMove(1, 120, 110)).toEqual({ kind: 'orbit', orbitX: -10, orbitY: 20, pinchPx: 0 })
  })

  it('a second finger switches to pinch: spread zooms in, close zooms out, orbit stops', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    expect(r.pointerDown(2, 200, 100)).toBe('pinch')

    // Fingers apart: distance 100 -> 150.
    expect(r.pointerMove(2, 250, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: 50 })
    // Fingers together: distance 150 -> 120.
    expect(r.pointerMove(1, 130, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: -30 })
  })

  it('parallel two-finger movement (pan attempt) nets zero pinch pixels', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    // Both fingers translate by the same vector: each move changes the distance,
    // but the sum over the completed translation is zero.
    const a = r.pointerMove(1, 140, 140)
    const b = r.pointerMove(2, 240, 140)
    expect(a.kind).toBe('pinch')
    expect(b.kind).toBe('pinch')
    expect(a.pinchPx + b.pinchPx).toBeCloseTo(0, 6)
  })

  it('lifting one finger after a pinch leaves the gesture inert (no camera jump)', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    r.pointerMove(2, 250, 100)
    r.pointerEnd(2)
    // Remaining finger moving must not orbit.
    expect(r.pointerMove(1, 300, 300)).toEqual({ kind: 'none', orbitX: 0, orbitY: 0, pinchPx: 0 })
    // After all fingers lift, a fresh one-finger gesture orbits again.
    r.pointerEnd(1)
    expect(r.pointerDown(3, 50, 50)).toBe('orbit')
    expect(r.pointerMove(3, 70, 60)).toEqual({ kind: 'orbit', orbitX: 20, orbitY: 10, pinchPx: 0 })
  })

  it('a third finger is ignored (no deltas, no pinch corruption)', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    r.pointerDown(3, 300, 300)
    expect(r.pointerMove(1, 130, 100)).toEqual({ kind: 'none', orbitX: 0, orbitY: 0, pinchPx: 0 })
    // Back to two fingers: pinch baseline re-established on lift.
    r.pointerEnd(3)
    expect(r.pointerMove(2, 250, 100).kind).toBe('pinch')
  })

  it('moves from unknown pointers are ignored', () => {
    const r = new TouchCameraGestureRecognizer()
    expect(r.pointerMove(9, 100, 100)).toEqual({ kind: 'none', orbitX: 0, orbitY: 0, pinchPx: 0 })
    expect(r.pointerEnd(9)).toBe(false)
  })

  it('exposes the pinch midpoint while exactly two fingers are down', () => {
    const r = new TouchCameraGestureRecognizer()
    expect(r.pinchMidpoint()).toBeNull()
    r.pointerDown(1, 100, 100)
    expect(r.pinchMidpoint()).toBeNull()
    r.pointerDown(2, 200, 140)
    expect(r.pinchMidpoint()).toEqual({ x: 150, y: 120 })
    r.pointerEnd(2)
    expect(r.pinchMidpoint()).toBeNull()
  })
})

function makeSinks() {
  const orbitDragRef = { current: { deltaX: 0, deltaY: 0 } as RawMouseDragState }
  const wheelRef = { current: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 } as RawWheelState }
  return { orbitDragRef, wheelRef }
}

function makeContainerRef() {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return { current: div }
}

function fireTouch(target: Element | Window, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', pointerId: number, x: number, y: number) {
  const init: Record<string, unknown> = {
    pointerId,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
  }
  const event = new PointerEvent(type, init)
  target.dispatchEvent(event)
}

describe('useTouchCameraGestures (hook wiring into scene-loop refs)', () => {
  it('one-finger touch drag feeds the orbit drag ref the frame loop consumes', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(window, 'pointermove', 1, 130, 90)
      fireTouch(window, 'pointermove', 1, 140, 100)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(40)
    expect(sinks.orbitDragRef.current.deltaY).toBe(0)
    expect(sinks.wheelRef.current.pinchDelta).toBe(0)
  })

  it('mouse pointers are ignored (mouse behavior unchanged)', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      const down = new PointerEvent('pointerdown', { pointerType: 'mouse', button: 0, bubbles: true })
      containerRef.current.dispatchEvent(down)
      const move = new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 300, clientY: 300, bubbles: true })
      window.dispatchEvent(move)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
    expect(sinks.orbitDragRef.current.deltaY).toBe(0)
  })

  it('two-finger pinch feeds pinch pixels into the wheel pinch accumulator', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(containerRef.current, 'pointerdown', 2, 200, 100)
      fireTouch(window, 'pointermove', 2, 250, 100)
      fireTouch(window, 'pointermove', 1, 90, 100)
    })

    // 100 -> 150 (finger 2 out), then 150 -> 160 (finger 1 back): +60 px total.
    expect(sinks.wheelRef.current.pinchDelta).toBe(60)
    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
  })

  it('pointercancel removes the pointer; later moves of that finger are ignored', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(window, 'pointermove', 1, 110, 100)
      fireTouch(window, 'pointercancel', 1, 110, 100)
      fireTouch(window, 'pointermove', 1, 200, 200)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(10)
  })

  it('does not claim a pointer that another surface captured (gizmo handle / texture paint)', () => {
    const containerRef = makeContainerRef()
    const target = document.createElement('div')
    target.hasPointerCapture = vi.fn(() => true)
    containerRef.current.appendChild(target)
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      const down = new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 5, button: 0, bubbles: true })
      target.dispatchEvent(down)
      fireTouch(window, 'pointermove', 5, 500, 500)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
    expect(target.hasPointerCapture).toHaveBeenCalledWith(5)
  })

  it('isBlocked (gizmo drag active) suppresses gesture feeding', () => {
    const containerRef = makeContainerRef()
    const sinks = { ...makeSinks(), isBlocked: () => true }
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(window, 'pointermove', 1, 130, 100)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
    expect(sinks.wheelRef.current.pinchDelta).toBe(0)
  })
})
