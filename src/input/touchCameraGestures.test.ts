import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  TouchCameraGestureRecognizer,
  useTouchCameraGestures,
} from './touchCameraGestures'
import type { RawMouseDragState } from '@/input/rawMouseDrag'
import type { RawWheelState } from '@/types/transformer'

const NONE = { kind: 'none', orbitX: 0, orbitY: 0, pinchPx: 0 }

describe('TouchCameraGestureRecognizer (pure classification + delta math)', () => {
  it('one finger is inert: no deltas at all (reserved for future touch selection)', () => {
    const r = new TouchCameraGestureRecognizer()
    expect(r.pointerDown(1, 100, 100)).toBe('none')
    expect(r.pointerMove(1, 130, 90)).toEqual(NONE)
    expect(r.pointerMove(1, 120, 110)).toEqual(NONE)
  })

  it('two-finger drag orbits at full finger speed (midpoint ×2)', () => {
    const r = new TouchCameraGestureRecognizer()
    expect(r.pointerDown(1, 100, 100)).toBe('none')
    expect(r.pointerDown(2, 300, 100)).toBe('pinch')
    // Lead finger alone, small travel: undecided, silent.
    expect(r.pointerMove(1, 110, 110)).toEqual(NONE)
    // Second finger follows: same-direction motion → orbit decision.
    expect(r.pointerMove(2, 310, 110)).toEqual({ kind: 'orbit', orbitX: 10, orbitY: 10, pinchPx: 0 })
    expect(r.pointerMove(1, 140, 140)).toEqual({ kind: 'orbit', orbitX: 30, orbitY: 30, pinchPx: 0 })
  })

  it('symmetric two-finger pinch zooms: opposed axis motion decides pinch', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    // Both fingers spread by 10 (sequentially): opposed axis components → pinch.
    expect(r.pointerMove(1, 90, 100)).toEqual(NONE)
    // Decision frame emits the cumulative spread: distance 100 -> 120.
    expect(r.pointerMove(2, 210, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: 20 })
    expect(r.pointerMove(1, 80, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: 10 })
    expect(r.pointerMove(2, 200, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: -10 })
  })

  it('anchor-finger pinch (one finger parked, other spreads ≥30 along the axis) zooms', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    expect(r.pointerMove(2, 250, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: 50 })
    expect(r.pointerMove(1, 130, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: -30 })
  })

  it('lifting one finger after a gesture leaves the leftover finger inert (no camera jump)', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    r.pointerMove(2, 250, 100)
    r.pointerEnd(2)
    expect(r.pointerMove(1, 300, 300)).toEqual(NONE)
    // All fingers up: a fresh pair gestures again.
    r.pointerEnd(1)
    expect(r.pointerDown(3, 50, 50)).toBe('none')
    expect(r.pointerDown(4, 150, 50)).toBe('pinch')
    r.pointerMove(3, 60, 60)
    expect(r.pointerMove(4, 160, 60).kind).toBe('orbit')
  })

  it('a third finger suspends the gesture until it lifts', () => {
    const r = new TouchCameraGestureRecognizer()
    r.pointerDown(1, 100, 100)
    r.pointerDown(2, 200, 100)
    r.pointerDown(3, 300, 300)
    expect(r.pointerMove(1, 130, 100)).toEqual(NONE)
    // Back to two fingers: gesture re-begins from the current positions.
    r.pointerEnd(3)
    expect(r.pointerMove(2, 250, 100)).toEqual({ kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx: 50 })
    expect(r.pointerMove(1, 110, 100).kind).toBe('pinch')
  })

  it('moves from unknown pointers are ignored', () => {
    const r = new TouchCameraGestureRecognizer()
    expect(r.pointerMove(9, 100, 100)).toEqual(NONE)
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
  it('two-finger drag feeds the orbit drag ref the frame loop consumes', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(containerRef.current, 'pointerdown', 2, 200, 100)
      fireTouch(window, 'pointermove', 1, 120, 100)
      fireTouch(window, 'pointermove', 2, 220, 100)
      fireTouch(window, 'pointermove', 1, 150, 100)
    })

    // Orbit decision on finger 2 (+20 mid), then finger 1 continues (+30 mid) → 50 fed.
    expect(sinks.orbitDragRef.current.deltaX).toBe(50)
    expect(sinks.orbitDragRef.current.deltaY).toBe(0)
    expect(sinks.wheelRef.current.pinchDelta).toBe(0)
  })

  it('one-finger touch drag feeds nothing (1-finger orbit removed)', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(window, 'pointermove', 1, 130, 90)
      fireTouch(window, 'pointermove', 1, 140, 100)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
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
      fireTouch(window, 'pointermove', 1, 110, 100)
      fireTouch(window, 'pointermove', 2, 270, 100)
    })

    // Static-anchor decision frame feeds the cumulative +50; then −10 and +20 net 60.
    expect(sinks.wheelRef.current.pinchDelta).toBe(60)
    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
  })

  it('pointers starting inside a data-touch-input-sink never join camera gestures', () => {
    const containerRef = makeContainerRef()
    const sink = document.createElement('div')
    sink.dataset.touchInputSink = ''
    containerRef.current.appendChild(sink)
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    // Finger A on the wheel strip (sink), finger B on the canvas: B alone must not orbit.
    act(() => {
      fireTouch(sink, 'pointerdown', 1, 100, 100)
      fireTouch(containerRef.current, 'pointerdown', 2, 400, 300)
      fireTouch(window, 'pointermove', 2, 450, 300)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
    expect(sinks.wheelRef.current.pinchDelta).toBe(0)
  })

  it('pointercancel removes the pointer; later moves of that finger are ignored', () => {
    const containerRef = makeContainerRef()
    const sinks = makeSinks()
    renderHook(() => useTouchCameraGestures(containerRef, sinks))

    act(() => {
      fireTouch(containerRef.current, 'pointerdown', 1, 100, 100)
      fireTouch(containerRef.current, 'pointerdown', 2, 200, 100)
      fireTouch(window, 'pointermove', 2, 250, 100)
      fireTouch(window, 'pointercancel', 2, 250, 100)
      fireTouch(window, 'pointermove', 2, 300, 300)
    })

    // The cancel leaves a lone finger (inert); the trailing move of finger 2 feeds nothing.
    // (Its pre-cancel move decided the pinch and fed the cumulative +50.)
    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
    expect(sinks.wheelRef.current.pinchDelta).toBe(50)
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
      fireTouch(containerRef.current, 'pointerdown', 2, 200, 100)
      fireTouch(window, 'pointermove', 1, 110, 100)
      fireTouch(window, 'pointermove', 2, 210, 100)
    })

    expect(sinks.orbitDragRef.current.deltaX).toBe(0)
    expect(sinks.wheelRef.current.pinchDelta).toBe(0)
  })
})
