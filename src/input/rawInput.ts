/**
 * Raw input capture from keyboard and trackpad/mouse wheel.
 *
 * Provides hooks and utilities to capture hardware input events
 * and convert them to RawInput snapshots.
 */

import { useEffect, useRef, type RefObject } from 'react'
import type {
  RawInput,
  RawKeyboardState,
  RawWheelState,
} from '@/types/transformer'
import { WheelClassifier, getWheelBehavior, normalizeWheelDeltaPx } from '@/input/wheelGesture'

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
 * True when `el` is inside a surface where keyboard input should go to the field/editor
 * (native controls, contentEditable, Monaco, common ARIA patterns), not global shortcuts / game input.
 */
export function elementIsInEditableSurface(el: Element | null): boolean {
  let n: Element | null = el
  while (n) {
    if (n instanceof HTMLElement && n.isContentEditable) return true
    const tag = n.tagName
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (tag === 'INPUT' && (n as HTMLInputElement).type !== 'hidden') return true
    if (n.classList.contains('monaco-editor')) return true
    const role = n.getAttribute('role')
    if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true
    n = n.parentElement
  }
  return false
}

/**
 * Prefer this for `keydown`/`keyup` handlers: uses the event target and `composedPath()` so focus
 * and shadow/event paths match what the user is typing into.
 */
export function isKeyboardEventInEditableContext(e: KeyboardEvent): boolean {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : []
  for (const node of path) {
    if (node instanceof Element && elementIsInEditableSurface(node)) return true
  }
  return elementIsInEditableSurface(document.activeElement as Element | null)
}

/**
 * Check if the currently focused element is editable (input, textarea, code editor, etc.).
 */
export function isEditableElement(): boolean {
  return elementIsInEditableSurface(document.activeElement as Element | null)
}

/**
 * React hook to capture raw keyboard input.
 * Returns a ref that holds the current keyboard state.
 */
export function useRawKeyboardInput(): RefObject<RawKeyboardState> {
  const keysRef = useRef<RawKeyboardState>({ ...DEFAULT_KEYBOARD_STATE })

  useEffect(() => {
    const keys = keysRef.current

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isKeyboardEventInEditableContext(e)) return

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
      if (isKeyboardEventInEditableContext(e)) return

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
  containerRef?: RefObject<HTMLElement>
): RefObject<RawWheelState> {
  const wheelRef = useRef<RawWheelState>({ ...DEFAULT_WHEEL_STATE })

  useEffect(() => {
    const wheel = wheelRef.current
    const classifier = new WheelClassifier()

    const onWheel = (e: Event): void => {
      const ev = e as WheelEvent
      const container = containerRef?.current
      if (container) {
        const target = ev.target
        if (!(target instanceof Node) || !container.contains(target)) return
      }

      // Capture phase + preventDefault stops macOS swipe-back while orbiting the camera.
      ev.preventDefault()

      const kind = classifier.classify(ev, ev.timeStamp || performance.now(), getWheelBehavior(), window.devicePixelRatio)
      const pagePx = container?.clientHeight || window.innerHeight
      const deltaY = normalizeWheelDeltaPx(ev.deltaY, ev.deltaMode, pagePx)

      if (kind === 'pinch') {
        // Trackpad pinch-to-zoom (Ctrl+wheel); raw pixels, small per event
        wheel.pinchDelta += deltaY
        return
      }

      if (kind === 'mouse') {
        // Physical wheel: normalised so one notch is ±100 on every browser/OS
        wheel.mouseWheelDelta += deltaY
        return
      }

      // Trackpad two-finger scroll → orbit (yaw + pitch)
      wheel.deltaX += normalizeWheelDeltaPx(ev.deltaX, ev.deltaMode, pagePx)
      wheel.deltaY += deltaY
    }

    document.addEventListener('wheel', onWheel, { passive: false, capture: true })

    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [containerRef])

  return wheelRef
}

/**
 * Get current raw input snapshot.
 * For wheel, this also resets the accumulated deltas.
 */
export function getRawInputSnapshot(
  keyboard: RefObject<RawKeyboardState>,
  wheel: RefObject<RawWheelState>,
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
