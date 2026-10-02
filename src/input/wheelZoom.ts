import { WHEEL_NOTCH_PX } from '@/input/wheelGesture'

/**
 * Wheel → camera zoom. Zoom is multiplicative (a fixed percentage per step) so every step feels the same
 * from 1 m or from 100 m away. The old additive mapping (`deltaY × 0.75` metres) turned ONE notch
 * (deltaY = 100 → 75 m) into a jump across the whole 1–150 m range: after a few notches only "very far" and
 * "very near" were left.
 */

/** ln(distance ratio) per notch: exp(0.12) ≈ +12.7 % (zoom out), exp(−0.12) ≈ −11.3 % (zoom in). */
export const MOUSE_ZOOM_LOG_PER_NOTCH = 0.12
/** Trackpad pinch deltas are small per event (≈ 1–10 px) but arrive at 60+ Hz. */
export const PINCH_ZOOM_LOG_PER_PX = 0.03
/** A single frame may change the distance by at most exp(0.6) ≈ 1.8× (event bursts, stuck wheels). */
export const MAX_ZOOM_LOG_PER_FRAME = 0.6

/** Normalised mouse px (notch = 100) and raw pinch px accumulated during one frame → ln(distance ratio). */
export function wheelZoomLog(mousePx: number, pinchPx: number): number {
  const raw = (mousePx / WHEEL_NOTCH_PX) * MOUSE_ZOOM_LOG_PER_NOTCH + pinchPx * PINCH_ZOOM_LOG_PER_PX
  return Math.max(-MAX_ZOOM_LOG_PER_FRAME, Math.min(MAX_ZOOM_LOG_PER_FRAME, raw))
}
