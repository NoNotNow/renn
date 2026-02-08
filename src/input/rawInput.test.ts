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
})

describe('getRawInputSnapshot', () => {
  test('creates snapshot and resets wheel', () => {
    const keyboardRef = { current: { w: true, a: false, s: false, d: false, space: false, shift: false } }
    const wheelRef = { current: { deltaX: 10, deltaY: -5 } }

    const snapshot = getRawInputSnapshot(
      keyboardRef as React.RefObject<RawKeyboardState>,
      wheelRef as React.RefObject<RawWheelState>,
    )

    expect(snapshot.keys.w).toBe(true)
    expect(snapshot.wheel.deltaX).toBe(10)
    expect(snapshot.wheel.deltaY).toBe(-5)

    // Wheel should be reset
    expect(wheelRef.current.deltaX).toBe(0)
    expect(wheelRef.current.deltaY).toBe(0)
  })
})
