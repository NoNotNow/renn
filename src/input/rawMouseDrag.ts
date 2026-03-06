/**
 * Raw middle-mouse (wheel button) drag input capture.
 *
 * Tracks mouse movement while the middle mouse button is held down
 * and exposes accumulated (deltaX, deltaY) pixel deltas.
 * Deltas are consumed (reset) each frame after reading, matching
 * the pattern of useRawWheelInput.
 */

import { useEffect, useRef } from 'react'

export interface RawMouseDragState {
  deltaX: number
  deltaY: number
}

/**
 * React hook that captures middle-mouse-button drag deltas.
 * Attach to the canvas container so drags outside the canvas are ignored.
 */
export function useRawMouseDrag(
  containerRef: React.RefObject<HTMLElement | null>,
): React.RefObject<RawMouseDragState> {
  const dragRef = useRef<RawMouseDragState>({ deltaX: 0, deltaY: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const state = dragRef.current
    let isDragging = false
    let lastX = 0
    let lastY = 0

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 1) return
      e.preventDefault()
      isDragging = true
      lastX = e.clientX
      lastY = e.clientY
    }

    const onMouseMove = (e: MouseEvent): void => {
      if (!isDragging) return
      state.deltaX += e.clientX - lastX
      state.deltaY += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
    }

    const onMouseUp = (e: MouseEvent): void => {
      if (e.button !== 1) return
      isDragging = false
    }

    // mousedown on the canvas container; move/up on window so fast drags don't escape
    container.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      isDragging = false
    }
  }, [containerRef])

  return dragRef
}
