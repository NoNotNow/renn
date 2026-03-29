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
  pinchDelta: 0,
  mouseWheelDelta: 0,
}

/**
 * Heuristic: event likely from a physical mouse wheel (not trackpad two-finger scroll).
 * deltaMode !== 0 (lines/pages) is typical for mouse; pixel mode with step-like deltaY also.
 */
function isLikelyMouseWheel(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return true
  return Math.abs(e.deltaX) === 0 && Math.abs(e.deltaY) > 4
}

/**
 * Check if the currently focused element is editable (input, textarea, etc.).
 */
export function isEditableElement(): boolean {
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
      if (isEditableElement()) return

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
      e.preventDefault()

      if (e.ctrlKey) {
        // Trackpad pinch-to-zoom: Ctrl+wheel
        wheel.pinchDelta += e.deltaY
        return
      }

      if (isLikelyMouseWheel(e)) {
        wheel.mouseWheelDelta += e.deltaY
        return
      }

      // Trackpad two-finger scroll → orbit (yaw + pitch)
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

  // Read and reset wheel deltas
  const snapshot: RawInput = {
    keys: { ...keys },
    wheel: {
      deltaX: wheelState.deltaX,
      deltaY: wheelState.deltaY,
      pinchDelta: wheelState.pinchDelta,
      mouseWheelDelta: wheelState.mouseWheelDelta,
    },
  }

  // Reset wheel deltas for next frame
  if (wheel.current) {
    wheel.current.deltaX = 0
    wheel.current.deltaY = 0
    wheel.current.pinchDelta = 0
    wheel.current.mouseWheelDelta = 0
  }

  return snapshot
}
