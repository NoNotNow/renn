/**
 * Touch camera gestures for the 3D viewport (Builder edit navigation and free cameras).
 *
 * Touch vocabulary (deliberately matches the MacBook trackpad, where one finger is the
 * cursor and two fingers orbit — mouse and pen pointers are always ignored):
 *
 * - 2-finger drag  → orbit: feeds the same per-frame pixel deltas the middle-mouse drag
 *   hook (`useRawMouseDrag`) accumulates, so the frame loop's `gizmoDragging` gating and
 *   `setOrbitDelta` plumbing apply unchanged. The gesture mode (drag vs pinch) is decided
 *   once per two-finger touch and latched — see the recognizer docs below.
 * - 2-finger pinch → zoom: feeds pinch pixels into the raw wheel `pinchDelta` accumulator
 *   (the same field trackpad pinch uses); the frame loop maps them through `wheelZoomLog`.
 * - 1-finger drag does nothing (reserved for future touch selection on the canvas).
 * - Pointers starting inside a `[data-touch-input-sink]` element (e.g. the HUD steering
 *   wheel) are not tracked, so a wheel finger never compromises a two-finger camera
 *   gesture — wheel steering and camera gestures work simultaneously.
 * - 2-finger pan is not implemented (CameraController has no pan primitive).
 *
 * Gestures never `setPointerCapture`, so gizmo handles and texture paint keep their own
 * capture.
 */

import { useEffect, useRef, type RefObject } from 'react'
import type { RawMouseDragState } from '@/input/rawMouseDrag'
import type { RawWheelState } from '@/types/transformer'

export type TouchCameraGestureKind = 'none' | 'orbit' | 'pinch'

export interface TouchGestureFrame {
  kind: TouchCameraGestureKind
  /** Orbit pixels since the last move event (two-finger drag at full finger speed). */
  orbitX: number
  orbitY: number
  /** Pinch distance change in px since the last move event (positive = fingers apart). */
  pinchPx: number
}

const EMPTY_FRAME: TouchGestureFrame = { kind: 'none', orbitX: 0, orbitY: 0, pinchPx: 0 }

/** Cumulative finger travel (px) before the gesture decides its mode. */
const DECIDE_TRAVEL_PX = 6
/** Finger travel (px) past which one parked finger + axis motion decides pinch. */
const STATIC_ANCHOR_TRAVEL_PX = 30

/**
 * Pure multi-touch recognizer: tracks touch pointers on one surface. One finger is inert
 * (reserved for future touch selection); two fingers form a gesture whose mode — orbit
 * (drag) or zoom (pinch) — is decided once and latched for the gesture's lifetime:
 * - both fingers travelled ≥ DECIDE_TRAVEL_PX: opposed axis motion (relative to the
 *   finger-to-finger axis) = pinch; parallel/lateral = orbit (humans move fingers in
 *   separate pointermove events, so per-event classification would misread drags);
 * - one finger parked and the other ≥ STATIC_TRAVEL_PX along the axis: pinch (the
 *   common one-finger-led, anchor-finger-static pinch).
 * Emits per-move deltas after the decision.
 *
 * After a gesture, lifting one finger leaves the remainder inert until every finger is
 * up — the leftover finger must not jump the camera.
 */
export class TouchCameraGestureRecognizer {
  private pointers = new Map<number, { x: number; y: number }>()
  /** Positions when the current two-finger gesture began (per finger). */
  private twoStart = new Map<number, { x: number; y: number }>()
  private twoStartDist = 0
  /** Applied per move once decided: pinch baseline (px) for delta emission. */
  private pinchDist = 0
  private prevMid = { x: 0, y: 0 }
  private decided: 'orbit' | 'pinch' | null = null
  private inert = false

  pointerDown(id: number, x: number, y: number): TouchCameraGestureKind {
    this.pointers.set(id, { x, y })
    if (this.pointers.size === 2) {
      this.beginTwoGesture()
      return 'pinch'
    }
    if (this.pointers.size > 2) {
      // Third finger corrupts the two-finger geometry: suspend until it lifts.
      this.decided = null
      this.twoStart.clear()
      this.inert = true
    }
    return 'none'
  }

  pointerMove(id: number, x: number, y: number): TouchGestureFrame {
    const p = this.pointers.get(id)
    if (!p) return { ...EMPTY_FRAME }
    const prevMidX = this.prevMid.x
    const prevMidY = this.prevMid.y
    p.x = x
    p.y = y

    if (this.pointers.size !== 2 || this.inert || !this.twoStart.has(id)) {
      const mid = this.pinchMidpoint()
      if (mid) this.prevMid = mid
      return { ...EMPTY_FRAME }
    }

    const { dist, midX, midY } = this.currentTwoGeometry()
    if (!this.decided) this.maybeDecide()

    let frame: TouchGestureFrame
    if (this.decided === 'pinch') {
      const pinchPx = dist - this.pinchDist
      this.pinchDist = dist
      frame = pinchPx === 0 ? { ...EMPTY_FRAME } : { kind: 'pinch', orbitX: 0, orbitY: 0, pinchPx }
    } else if (this.decided === 'orbit') {
      // Midpoint translation: half of each finger's move — doubled back to finger speed.
      frame = { kind: 'orbit', orbitX: (midX - prevMidX) * 2, orbitY: (midY - prevMidY) * 2, pinchPx: 0 }
    } else {
      frame = { ...EMPTY_FRAME }
    }
    this.prevMid = { x: midX, y: midY }
    return frame
  }

  /** Removes the pointer; returns true when the pointer was tracked. */
  pointerEnd(id: number): boolean {
    if (!this.pointers.delete(id)) return false
    this.twoStart.delete(id)
    if (this.pointers.size === 0) {
      this.inert = false
      this.decided = null
    } else if (this.pointers.size === 1) {
      // Leftover finger of an ended gesture: inert until every finger is up.
      this.inert = true
      this.decided = null
    } else if (this.pointers.size === 2) {
      this.beginTwoGesture()
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

  private beginTwoGesture(): void {
    const { dist, midX, midY } = this.currentTwoGeometry()
    this.twoStartDist = dist
    this.prevMid = { x: midX, y: midY }
    this.pinchDist = dist
    this.twoStart.clear()
    for (const [pid, pos] of this.pointers) {
      this.twoStart.set(pid, { x: pos.x, y: pos.y })
    }
    this.decided = null
    this.inert = false
  }

  /**
   * Decide orbit vs pinch from cumulative finger displacement since gesture start.
   * Sets the pinch baseline to the gesture-start distance so the decision frame emits
   * the full cumulative delta (real pinches are continuous event streams).
   */
  private maybeDecide(): void {
    const [idA, idB] = [...this.twoStart.keys()]
    if (idA === undefined || idB === undefined) return
    const dA = this.fingerDisplacement(idA)
    const dB = this.fingerDisplacement(idB)
    const travelA = Math.hypot(dA.x, dA.y)
    const travelB = Math.hypot(dB.x, dB.y)

    // Finger-to-finger axis at gesture start (unit; degenerate start → horizontal).
    const [a0, b0] = [this.twoStart.get(idA)!, this.twoStart.get(idB)!]
    const axisLen = Math.hypot(b0.x - a0.x, b0.y - a0.y)
    const ux = axisLen > 1e-6 ? (b0.x - a0.x) / axisLen : 1
    const uy = axisLen > 1e-6 ? (b0.y - a0.y) / axisLen : 0

    if (Math.min(travelA, travelB) >= DECIDE_TRAVEL_PX) {
      // Axis components of both displacements: opposed motion = pinch, else drag.
      const axisA = dA.x * ux + dA.y * uy
      const axisB = dB.x * ux + dB.y * uy
      this.decided = axisA * axisB < 0 ? 'pinch' : 'orbit'
    } else if (Math.max(travelA, travelB) >= STATIC_ANCHOR_TRAVEL_PX) {
      // One finger parked: axis-dominant motion of the other = anchor-finger pinch.
      const moving = travelA >= travelB ? dA : dB
      const axis = moving.x * ux + moving.y * uy
      const perp = Math.sqrt(Math.max(0, (travelA >= travelB ? travelA : travelB) ** 2 - axis * axis))
      this.decided = Math.abs(axis) > perp ? 'pinch' : 'orbit'
    } else {
      return
    }
    this.pinchDist = this.twoStartDist
  }

  private fingerDisplacement(id: number): { x: number; y: number } {
    const start = this.twoStart.get(id)
    const pos = this.pointers.get(id)
    if (!start || !pos) return { x: 0, y: 0 }
    return { x: pos.x - start.x, y: pos.y - start.y }
  }

  private currentTwoGeometry(): { dist: number; midX: number; midY: number } {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return { dist: 0, midX: 0, midY: 0 }
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    }
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
      // Fingers that start inside a `[data-touch-input-sink]` (e.g. the HUD steering wheel
      // strip) belong to that surface — never to the camera recognizer.
      const { target } = e
      if (target instanceof Element && target.closest('[data-touch-input-sink]')) return
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
