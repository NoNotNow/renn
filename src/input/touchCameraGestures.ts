/**
 * Touch camera gestures for the 3D viewport (Builder edit navigation and free cameras).
 *
 * - 1-finger drag  → orbit: feeds the same per-frame pixel deltas the middle-mouse drag
 *   hook (`useRawMouseDrag`) accumulates, so the frame loop's `gizmoDragging` gating and
 *   `setOrbitDelta` plumbing apply unchanged.
 * - 2-finger pinch → zoom: feeds pinch pixels into the raw wheel `pinchDelta` accumulator
 *   (the same field trackpad pinch uses); the frame loop maps them through `wheelZoomLog`.
 * - 2-finger pan is not implemented yet (CameraController has no pan primitive).
 *
 * Mouse and pen pointers are ignored — mouse behavior is unchanged. Gestures never
 * `setPointerCapture`, so gizmo handles and texture paint keep their own capture.
 */

import { useEffect, useRef, type RefObject } from 'react'
import type { RawMouseDragState } from '@/input/rawMouseDrag'
import type { RawWheelState } from '@/types/transformer'

export type TouchCameraGestureKind = 'none' | 'orbit' | 'pinch'

export interface TouchGestureFrame {
  kind: TouchCameraGestureKind
  /** 1-finger drag pixels since the last move event (0 outside a single-finger orbit). */
  orbitX: number
  orbitY: number
  /** Pinch distance change in px since the last move event (positive = fingers apart). */
  pinchPx: number
}

const EMPTY_FRAME: TouchGestureFrame = { kind: 'none', orbitX: 0, orbitY: 0, pinchPx: 0 }

/**
 * Pure multi-touch recognizer: tracks active touch pointers and classifies the
 * current gesture (single-finger orbit / two-finger pinch). Emits per-move deltas.
 *
 * After a pinch, lifting one finger leaves the gesture inert until every finger is
 * up — the remaining finger must not jump the camera into a fresh orbit.
 */
export class TouchCameraGestureRecognizer {
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private inert = false

  pointerDown(id: number, x: number, y: number): TouchCameraGestureKind {
    this.pointers.set(id, { x, y })
    if (this.pointers.size === 2) {
      this.pinchDist = this.currentPinchDistance()
      return 'pinch'
    }
    if (this.pointers.size > 2) return 'none'
    this.inert = false
    return 'orbit'
  }

  pointerMove(id: number, x: number, y: number): TouchGestureFrame {
    const p = this.pointers.get(id)
    if (!p) return { ...EMPTY_FRAME }

    if (this.pointers.size === 1 && !this.inert) {
      const frame: TouchGestureFrame = {
        kind: 'orbit',
        orbitX: x - p.x,
        orbitY: y - p.y,
        pinchPx: 0,
      }
      p.x = x
      p.y = y
      return frame
    }

    if (this.pointers.size === 2) {
      p.x = x
      p.y = y
      const next = this.currentPinchDistance()
      const frame: TouchGestureFrame = {
        kind: 'pinch',
        orbitX: 0,
        orbitY: 0,
        pinchPx: next - this.pinchDist,
      }
      this.pinchDist = next
      return frame
    }

    // 3+ pointers or an inert leftover finger: track the position, emit no deltas.
    p.x = x
    p.y = y
    return { ...EMPTY_FRAME }
  }

  /** Removes the pointer; returns true when the pointer was tracked. */
  pointerEnd(id: number): boolean {
    if (!this.pointers.delete(id)) return false
    if (this.pointers.size === 0) {
      this.inert = false
    } else if (this.pointers.size === 1) {
      this.inert = true
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.currentPinchDistance()
    }
    return true
  }

  /** Midpoint of the two active pinch pointers (null unless exactly two are down). */
  pinchMidpoint(): { x: number; y: number } | null {
    if (this.pointers.size !== 2) return null
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return null
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
}

export interface TouchCameraGestureSinks {
  /** Orbit pixel deltas; same ref the middle-mouse drag feeds (consumed per frame by the scene loop). */
  orbitDragRef: RefObject<RawMouseDragState | null>
  /** Pinch pixels accumulate into `pinchDelta` (same field the trackpad pinch uses). */
  wheelRef: RefObject<RawWheelState | null>
  /** When set, gestures are suppressed while this returns true (gizmo drag owns the canvas). */
  isBlocked?: () => boolean
}

/**
 * React hook that installs touch camera gestures on a canvas host.
 * Attach to the same container as `useRawMouseDrag`; drags started outside the
 * host are ignored, moves outside its bounds keep tracking via window listeners.
 */
export function useTouchCameraGestures(
  containerRef: RefObject<HTMLElement | null>,
  sinks: TouchCameraGestureSinks,
): void {
  const sinksRef = useRef(sinks)
  sinksRef.current = sinks

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const recognizer = new TouchCameraGestureRecognizer()

    /** True when another surface (gizmo handle, texture paint) already owns this pointer. */
    const pointerIsClaimed = (e: PointerEvent): boolean => {
      const target = e.target
      if (target instanceof Element && typeof target.hasPointerCapture === 'function') {
        try {
          return target.hasPointerCapture(e.pointerId)
        } catch {
          return false
        }
      }
      return false
    }

    const applyFrame = (frame: TouchGestureFrame): void => {
      const current = sinksRef.current
      if (current.isBlocked?.()) return
      if (frame.kind === 'orbit' && current.orbitDragRef.current) {
        current.orbitDragRef.current.deltaX += frame.orbitX
        current.orbitDragRef.current.deltaY += frame.orbitY
      } else if (frame.kind === 'pinch' && current.wheelRef.current) {
        current.wheelRef.current.pinchDelta += frame.pinchPx
      }
    }

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      if (sinksRef.current.isBlocked?.() || pointerIsClaimed(e)) return
      recognizer.pointerDown(e.pointerId, e.clientX, e.clientY)
    }

    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      applyFrame(recognizer.pointerMove(e.pointerId, e.clientX, e.clientY))
    }

    const onPointerEnd = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      recognizer.pointerEnd(e.pointerId)
    }

    // pointerdown on the canvas host; move/up/cancel on window so fast drags don't escape.
    container.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [containerRef])
}
