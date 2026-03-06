import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useRawKeyboardInput,
  useRawWheelInput,
  getRawInputSnapshot,
} from './rawInput'
import type { RawKeyboardState, RawWheelState } from '@/types/transformer'

describe('useRawKeyboardInput', () => {
  test('initial state is all false', () => {
    const { result } = renderHook(() => useRawKeyboardInput())
    expect(result.current.current).toEqual({
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
      shift: false,
    })
  })

  test('keydown updates state', () => {
    const { result } = renderHook(() => useRawKeyboardInput())

    act(() => {
      const event = new KeyboardEvent('keydown', { code: 'KeyW' })
      window.dispatchEvent(event)
    })

    expect(result.current.current.w).toBe(true)
  })

  test('keyup resets state', () => {
    const { result } = renderHook(() => useRawKeyboardInput())

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    })
    expect(result.current.current.w).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
    })
    expect(result.current.current.w).toBe(false)
  })

  test('blur resets all keys', () => {
    const { result } = renderHook(() => useRawKeyboardInput())

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }))
    })

    expect(result.current.current.w).toBe(true)
    expect(result.current.current.a).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('blur'))
    })

    expect(result.current.current.w).toBe(false)
    expect(result.current.current.a).toBe(false)
  })
})

describe('useRawWheelInput', () => {
  test('initial state is zero', () => {
    const { result } = renderHook(() => useRawWheelInput())
    expect(result.current.current).toEqual({
      deltaX: 0,
      deltaY: 0,
      pinchDelta: 0,
      mouseWheelDelta: 0,
    })
  })

  test('wheel event accumulates deltas', () => {
    const { result } = renderHook(() => useRawWheelInput())

    act(() => {
      const event = new WheelEvent('wheel', { deltaX: 10, deltaY: -5 })
      window.dispatchEvent(event)
    })

    expect(result.current.current.deltaX).toBe(10)
    expect(result.current.current.deltaY).toBe(-5)
  })

  test('multiple wheel events accumulate', () => {
    const { result } = renderHook(() => useRawWheelInput())

    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 5, deltaY: 3 }))
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 2, deltaY: -1 }))
    })

    expect(result.current.current.deltaX).toBe(7)
    expect(result.current.current.deltaY).toBe(2)
  })

  test('ctrl+wheel accumulates pinchDelta and not deltaX/deltaY', () => {
    const { result } = renderHook(() => useRawWheelInput())

    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, ctrlKey: true }))
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, ctrlKey: true }))
    })

    expect(result.current.current.pinchDelta).toBe(6)
    expect(result.current.current.deltaX).toBe(0)
    expect(result.current.current.deltaY).toBe(0)
  })

  test('wheel with deltaMode 1 (lines) accumulates into mouseWheelDelta', () => {
    const { result } = renderHook(() => useRawWheelInput())

    act(() => {
      // deltaMode 1 = DOM_DELTA_LINE, typical for physical mouse wheel
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 40, deltaMode: 1 }))
    })

    expect(result.current.current.mouseWheelDelta).toBe(40)
    expect(result.current.current.deltaX).toBe(0)
    expect(result.current.current.deltaY).toBe(0)
  })

  test('pixel-mode small delta goes to deltaX/deltaY (trackpad scroll)', () => {
    const { result } = renderHook(() => useRawWheelInput())

    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 2, deltaY: 2, deltaMode: 0 }))
    })

    expect(result.current.current.deltaX).toBe(2)
    expect(result.current.current.deltaY).toBe(2)
    expect(result.current.current.mouseWheelDelta).toBe(0)
  })
})

describe('getRawInputSnapshot', () => {
  test('creates snapshot and resets wheel', () => {
    const keyboardRef = { current: { w: true, a: false, s: false, d: false, space: false, shift: false } }
    const wheelRef = { current: { deltaX: 10, deltaY: -5, pinchDelta: 3, mouseWheelDelta: 7 } }

    const snapshot = getRawInputSnapshot(
      keyboardRef as React.RefObject<RawKeyboardState>,
      wheelRef as React.RefObject<RawWheelState>,
    )

    expect(snapshot.keys.w).toBe(true)
    expect(snapshot.wheel.deltaX).toBe(10)
    expect(snapshot.wheel.deltaY).toBe(-5)
    expect(snapshot.wheel.pinchDelta).toBe(3)
    expect(snapshot.wheel.mouseWheelDelta).toBe(7)

    // Wheel should be reset
    expect(wheelRef.current.deltaX).toBe(0)
    expect(wheelRef.current.deltaY).toBe(0)
    expect(wheelRef.current.pinchDelta).toBe(0)
    expect(wheelRef.current.mouseWheelDelta).toBe(0)
  })
})
