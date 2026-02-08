/**
 * Raw input capture from keyboard and trackpad/mouse wheel.
 *
 * Provides hooks and utilities to capture hardware input events
 * and convert them to RawInput snapshots.
 */

import { useEffect, useRef } from 'react'
import type {
  RawInput,
  RawKeyboardState,
  RawWheelState,
} from '@/types/transformer'

const DEFAULT_KEYBOARD_STATE: RawKeyboardState = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false,
}

const DEFAULT_WHEEL_STATE: RawWheelState = {
  deltaX: 0,
  deltaY: 0,
}

/**
 * Check if the currently focused element is editable (input, textarea, etc.).
 */
function isEditableElement(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  )
}

/**
 * React hook to capture raw keyboard input.
 * Returns a ref that holds the current keyboard state.
 */
export function useRawKeyboardInput(): React.RefObject<RawKeyboardState> {
  const keysRef = useRef<RawKeyboardState>({ ...DEFAULT_KEYBOARD_STATE })

  useEffect(() => {
    const keys = keysRef.current

    const onKeyDown = (e: KeyboardEvent): void => {
      const editable = isEditableElement()
      const tracked = e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight'
      if (editable) return

      switch (e.code) {
        case 'KeyW':
          keys.w = true
          break
        case 'KeyA':
          keys.a = true
          break
        case 'KeyS':
          keys.s = true
          break
        case 'KeyD':
          keys.d = true
          break
        case 'Space':
          keys.space = true
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.shift = true
          break
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      const editable = isEditableElement()
      if (editable) return

      switch (e.code) {
        case 'KeyW':
          keys.w = false
          break
        case 'KeyA':
          keys.a = false
          break
        case 'KeyS':
          keys.s = false
          break
        case 'KeyD':
          keys.d = false
          break
        case 'Space':
          keys.space = false
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.shift = false
          break
      }
    }

    const onBlur = (): void => {
      keys.w = false
      keys.a = false
      keys.s = false
      keys.d = false
      keys.space = false
      keys.shift = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return keysRef
}

/**
 * React hook to capture raw wheel/trackpad input.
 * Returns a ref that holds accumulated wheel deltas.
 * Deltas are reset each frame after reading.
 * 
 * @param containerRef Optional ref to a container element. If provided, the listener
 *                     will only attach to that element (e.g., canvas container).
 *                     If not provided, attaches to window (for backward compatibility).
 */
export function useRawWheelInput(
  containerRef?: React.RefObject<HTMLElement>
): React.RefObject<RawWheelState> {
  const wheelRef = useRef<RawWheelState>({ ...DEFAULT_WHEEL_STATE })

  useEffect(() => {
    const wheel = wheelRef.current
    const target = containerRef?.current || window

    const onWheel = (e: WheelEvent): void => {
      // Ignore pinch-zoom (Ctrl+wheel)
      if (e.ctrlKey) return

      // Prevent default scrolling only on canvas (not in UI panels)
      e.preventDefault()

      // Accumulate deltas
      wheel.deltaX += e.deltaX
      wheel.deltaY += e.deltaY
    }

    // Use passive: false to allow preventDefault()
    target.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      target.removeEventListener('wheel', onWheel)
    }
  }, [containerRef])

  return wheelRef
}

/**
 * Get current raw input snapshot.
 * For wheel, this also resets the accumulated deltas.
 */
export function getRawInputSnapshot(
  keyboard: React.RefObject<RawKeyboardState>,
  wheel: React.RefObject<RawWheelState>,
): RawInput {
  const keys = keyboard.current ?? DEFAULT_KEYBOARD_STATE
  const wheelState = wheel.current ?? DEFAULT_WHEEL_STATE
  const now = Date.now()
  if (typeof (getRawInputSnapshot as { _lastLog?: number })._lastLog === 'undefined') {
    ;(getRawInputSnapshot as { _lastLog?: number })._lastLog = 0
  }
  const lastLog = (getRawInputSnapshot as { _lastLog?: number })._lastLog ?? 0
  if (now - lastLog > 500) {
    ;(getRawInputSnapshot as { _lastLog?: number })._lastLog = now
  }

  // Read and reset wheel deltas
  const snapshot: RawInput = {
    keys: { ...keys },
    wheel: {
      deltaX: wheelState.deltaX,
      deltaY: wheelState.deltaY,
    },
  }
  const anyKey = Object.values(snapshot.keys).some(Boolean)
  void anyKey

  // Reset wheel deltas for next frame
  if (wheel.current) {
    wheel.current.deltaX = 0
    wheel.current.deltaY = 0
  }

  return snapshot
}
