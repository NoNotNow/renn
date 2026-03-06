import { describe, test, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useRawMouseDrag } from './rawMouseDrag'

function makeContainerRef() {
  const div = document.createElement('div')
  document.body.appendChild(div)
  const ref = { current: div }
  return ref
}

describe('useRawMouseDrag', () => {
  test('initial state is zero', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useRawMouseDrag(containerRef))
    expect(result.current.current).toEqual({ deltaX: 0, deltaY: 0 })
  })

  test('middle-button drag accumulates deltas', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useRawMouseDrag(containerRef))

    act(() => {
      containerRef.current.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 5, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 8, bubbles: true }))
    })

    expect(result.current.current.deltaX).toBe(20)
    expect(result.current.current.deltaY).toBe(8)
  })

  test('left-button mousedown does not start tracking', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useRawMouseDrag(containerRef))

    act(() => {
      containerRef.current.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50, bubbles: true }))
    })

    expect(result.current.current.deltaX).toBe(0)
    expect(result.current.current.deltaY).toBe(0)
  })

  test('middle-button mouseup stops tracking', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useRawMouseDrag(containerRef))

    act(() => {
      containerRef.current.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mouseup', { button: 1, bubbles: true }))
      // Move after release – should not accumulate
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30, bubbles: true }))
    })

    // Only the first move (10px) should be accumulated
    expect(result.current.current.deltaX).toBe(10)
    expect(result.current.current.deltaY).toBe(10)
  })

  test('deltas accumulate across multiple moves', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useRawMouseDrag(containerRef))

    act(() => {
      containerRef.current.dispatchEvent(new MouseEvent('mousedown', { button: 1, clientX: 0, clientY: 0, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 3, clientY: 0, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 7, clientY: 0, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 0, bubbles: true }))
    })

    expect(result.current.current.deltaX).toBe(10)
  })
})
