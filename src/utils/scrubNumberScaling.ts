import { clamp } from '@/utils/numberUtils'

/** Default px/s at which scrub sensitivity approaches `maxScale`. */
export const SCRUB_REFERENCE_VELOCITY_PX_PER_SEC = 600

export interface ScrubVelocityState {
  lastX: number
  lastTimeMs: number
  smoothedVelocityPxPerSec: number
}

export interface ScrubScaleOptions {
  /** Units per pixel at low speed (fine control). */
  baseSensitivity: number
  /** Multiplier at rest; default 1. */
  minScale?: number
  /** Multiplier cap at high drag speed; default 24. */
  maxScale?: number
  /** |velocity| at which scale nears `maxScale` (quadratic curve); default 600 px/s. */
  referenceVelocityPxPerSec?: number
  /** EMA blend for measured pointer velocity (0–1); default 0.35. */
  velocitySmoothing?: number
  /** EMA blend for the applied scale multiplier (0–1); default 0.4. */
  scaleSmoothing?: number
}

const DEFAULT_MIN_SCALE = 1
const DEFAULT_MAX_SCALE = 24
const DEFAULT_VELOCITY_SMOOTHING = 0.35
const DEFAULT_SCALE_SMOOTHING = 0.4

/**
 * Advance smoothed horizontal pointer velocity (px/s) from a pointer-move sample.
 */
export function advanceScrubVelocity(
  state: ScrubVelocityState,
  clientX: number,
  timeMs: number,
  velocitySmoothing = DEFAULT_VELOCITY_SMOOTHING,
): ScrubVelocityState {
  const dtSec = (timeMs - state.lastTimeMs) / 1000
  if (dtSec <= 0) {
    return { ...state, lastX: clientX, lastTimeMs: timeMs }
  }

  const instantVelocity = (clientX - state.lastX) / dtSec
  const alpha = clamp(velocitySmoothing, 0, 1)
  const smoothed =
    state.smoothedVelocityPxPerSec +
    alpha * (instantVelocity - state.smoothedVelocityPxPerSec)

  return {
    lastX: clientX,
    lastTimeMs: timeMs,
    smoothedVelocityPxPerSec: smoothed,
  }
}

export function createScrubVelocityState(clientX: number, timeMs: number): ScrubVelocityState {
  return {
    lastX: clientX,
    lastTimeMs: timeMs,
    smoothedVelocityPxPerSec: 0,
  }
}

/**
 * Quadratic scale from |velocity|: slow drags stay near `minScale`, fast drags approach `maxScale`.
 * Returns the smoothed multiplier to apply to `baseSensitivity`.
 */
export function scrubScaleFromVelocity(
  velocityPxPerSec: number,
  prevScale: number,
  options: ScrubScaleOptions,
): number {
  const minScale = options.minScale ?? DEFAULT_MIN_SCALE
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE
  const ref = options.referenceVelocityPxPerSec ?? SCRUB_REFERENCE_VELOCITY_PX_PER_SEC
  const scaleSmoothing = options.scaleSmoothing ?? DEFAULT_SCALE_SMOOTHING

  const t = clamp(Math.abs(velocityPxPerSec) / ref, 0, 1)
  const targetScale = minScale + (maxScale - minScale) * t * t
  const alpha = clamp(scaleSmoothing, 0, 1)
  return prevScale + alpha * (targetScale - prevScale)
}

/**
 * Value delta for one horizontal pointer step using velocity-scaled sensitivity.
 */
export function scrubValueDelta(
  deltaXPx: number,
  velocityPxPerSec: number,
  smoothedScale: number,
  baseSensitivity: number,
): number {
  return deltaXPx * baseSensitivity * smoothedScale
}
