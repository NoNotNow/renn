/**
 * Touch drive input from the HUD steering wheel.
 *
 * A single primary touch finger on the wheel strip drives the car: the finger's offset
 * from its touch-down point maps to analog axes (clamped −1…1, 0 at the touch-down
 * point) — vertical drag up = forward throttle, down = backward; horizontal = steering.
 * Lifting the finger zeroes both axes; car2's `steering_angle` path then self-centers
 * the wheel and throttle drops to 0.
 *
 * One finger owns the strip: the first touch pointer is the primary; later fingers on
 * the strip are ignored until it lifts. Non-touch pointers (mouse/pen) are ignored.
 */

import { useEffect, type RefObject } from 'react'
import type { RawDriveTouchState } from '@/types/transformer'
import { clamp } from '@/utils/numberUtils'

/** Below this axis magnitude the value snaps to 0 (a resting thumb must not creep the car). */
const DEAD_ZONE = 0.05

export function zeroTouchDrive(): RawDriveTouchState {
  return { steer: 0, drive: 0 }
}

/**
 * Install touch handlers on a wheel strip element. Writes analog axes into `state`
 * (read each frame by `getRawInputSnapshot`). Returns a detach function.
 */
export function attachTouchDriveStrip(
  strip: HTMLElement,
  state: RawDriveTouchState,
): () => void {
  let primaryPointerId: number | null = null
  let originX = 0
  let originY = 0

  const reset = (): void => {
    primaryPointerId = null
    state.steer = 0
    state.drive = 0
  }

  /** Full deflection in CSS px, from the strip width (re-read per move: cheap, rotation-proof). */
  const deflectionRadius = (): number => {
    const rect = strip.getBoundingClientRect()
    return Math.max(40, rect.width * 0.32)
  }

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return
    if (primaryPointerId !== null) return // single primary finger owns the strip
    primaryPointerId = e.pointerId
    originX = e.clientX
    originY = e.clientY
    try {
      strip.setPointerCapture(e.pointerId)
    } catch {
      // Capture is an optimization; the strip still sees moves that stay inside it.
    }
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || e.pointerId !== primaryPointerId) return
    const r = deflectionRadius()
    // Sign conventions: drag right = steer right = car2 `steering_angle` negative;
    // drag up = forward = positive drive.
    state.steer = clamp(-(e.clientX - originX) / r, -1, 1)
    state.drive = clamp(-(e.clientY - originY) / r, -1, 1)
    if (Math.abs(state.steer) < DEAD_ZONE) state.steer = 0
    if (Math.abs(state.drive) < DEAD_ZONE) state.drive = 0
  }

  const onPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId !== primaryPointerId) return
    reset()
  }

  strip.addEventListener('pointerdown', onPointerDown)
  strip.addEventListener('pointermove', onPointerMove)
  strip.addEventListener('pointerup', onPointerEnd)
  strip.addEventListener('pointercancel', onPointerEnd)
  strip.addEventListener('lostpointercapture', onPointerEnd)

  return () => {
    strip.removeEventListener('pointerdown', onPointerDown)
    strip.removeEventListener('pointermove', onPointerMove)
    strip.removeEventListener('pointerup', onPointerEnd)
    strip.removeEventListener('pointercancel', onPointerEnd)
    strip.removeEventListener('lostpointercapture', onPointerEnd)
    reset()
  }
}

/**
 * React hook binding a wheel strip element to the shared touch-drive state ref.
 * The strip is also marked `data-touch-input-sink` so the camera gesture recognizer
 * never counts its fingers.
 */
export function useTouchDriveStrip(
  stripRef: RefObject<HTMLElement | null>,
  stateRef?: RefObject<RawDriveTouchState | null>,
): void {
  useEffect(() => {
    if (!stateRef) return
    const strip = stripRef.current
    const state = stateRef.current
    if (!strip || !state) return
    strip.dataset.touchInputSink = ''
    return attachTouchDriveStrip(strip, state)
  }, [stripRef, stateRef])
}
