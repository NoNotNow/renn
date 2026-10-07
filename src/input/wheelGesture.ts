/**
 * Wheel events from very different devices end up in one `wheel` stream:
 *   • physical mouse wheel — Chrome/Edge (Win, Linux): pixel mode, ±100 per notch (×display scale);
 *     Firefox: line mode, ±3 per notch; Safari/Chrome (Mac): small accelerated pixel steps
 *   • trackpad two-finger scroll — pixel mode, many small, often fractional events + momentum tail
 *   • trackpad pinch — `ctrlKey` + small deltaY
 * This module normalises the magnitude and decides which kind an event is, so camera code can treat
 * "one notch" the same everywhere (see `wheelZoom.ts`).
 */

/** One mouse-wheel notch in normalised pixels (Chrome's value on Windows / Linux). */
export const WHEEL_NOTCH_PX = 100

const LINE_PX = WHEEL_NOTCH_PX / 3 // Firefox reports 3 lines per notch
const DEFAULT_PAGE_PX = 800

/** DOM_DELTA_PIXEL = 0, DOM_DELTA_LINE = 1, DOM_DELTA_PAGE = 2 → pixels. */
export function normalizeWheelDeltaPx(delta: number, deltaMode: number, pagePx = DEFAULT_PAGE_PX): number {
  if (deltaMode === 1) return delta * LINE_PX
  if (deltaMode === 2) return delta * pagePx
  return delta
}

export type WheelKind = 'pinch' | 'mouse' | 'trackpad'

/** User override for plain (non-pinch) wheel events: `auto` guesses from the event stream. */
export type WheelBehavior = 'auto' | 'zoom' | 'orbit'

export interface WheelLikeEvent {
  ctrlKey: boolean
  deltaX: number
  deltaY: number
  deltaMode: number
}

/** A pause this long ends a gesture; events inside one gesture keep the kind of its first event. */
export const WHEEL_GESTURE_GAP_MS = 180
/** A fresh integer pixel delta at least this large is a wheel notch, not a trackpad swipe start. */
export const WHEEL_MOUSE_NOTCH_MIN_PX = 40

/**
 * True when `deltaY` is a whole number of *device* pixels. Chrome reports wheel deltas in CSS px, so a 100-unit notch
 * becomes 75.19 / 66.67 / 80 … on a 1.33× / 1.5× / 1.25× display or at a browser zoom ≠ 100 % — fractional, yet still a
 * discrete wheel step. (Trackpads are fractional without lining up with the device grid, and rarely start ≥ 40 px.)
 */
export function isWholeDevicePixels(deltaY: number, dpr = 1): boolean {
  if (Number.isInteger(deltaY)) return true
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const device = Math.abs(deltaY) * scale
  return Math.abs(device - Math.round(device)) < 0.02
}

/**
 * Stateful classifier. Per-gesture continuity matters: a trackpad swipe's momentum tail must not flip to
 * "mouse" halfway, and a quickly spun wheel must not flip to "trackpad" when single deltas get small.
 */
export class WheelClassifier {
  private lastTime = Number.NEGATIVE_INFINITY
  private lastKind: WheelKind = 'trackpad'

  classify(ev: WheelLikeEvent, nowMs: number, behavior: WheelBehavior = 'auto', dpr = 1): WheelKind {
    if (ev.ctrlKey) return 'pinch' // trackpad pinch (browsers send ctrl+wheel); ctrl+wheel on a mouse zooms too

    const continuing = nowMs - this.lastTime < WHEEL_GESTURE_GAP_MS
    this.lastTime = nowMs

    let kind: WheelKind
    if (behavior === 'zoom') kind = 'mouse'
    else if (behavior === 'orbit') kind = 'trackpad'
    else if (ev.deltaMode !== 0) kind = 'mouse' // line / page mode only comes from wheels
    else if (ev.deltaX !== 0) kind = 'trackpad' // only trackpads scroll sideways
    else if (continuing) kind = this.lastKind
    else kind = isWholeDevicePixels(ev.deltaY, dpr) && Math.abs(ev.deltaY) >= WHEEL_MOUSE_NOTCH_MIN_PX ? 'mouse' : 'trackpad'

    this.lastKind = kind
    return kind
  }

  reset(): void {
    this.lastTime = Number.NEGATIVE_INFINITY
    this.lastKind = 'trackpad'
  }
}

const STORAGE_KEY = 'rennWheelBehavior'
let behavior: WheelBehavior | null = null

function isBehavior(v: unknown): v is WheelBehavior {
  return v === 'auto' || v === 'zoom' || v === 'orbit'
}

/** Persisted choice of what plain wheel events do (View → Mouse wheel). */
export function getWheelBehavior(): WheelBehavior {
  if (behavior) return behavior
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    behavior = isBehavior(stored) ? stored : 'auto'
  } catch {
    behavior = 'auto'
  }
  return behavior
}

export function setWheelBehavior(next: WheelBehavior): void {
  behavior = next
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next)
  } catch {
    /* storage unavailable (private mode): keep the in-memory choice */
  }
}
