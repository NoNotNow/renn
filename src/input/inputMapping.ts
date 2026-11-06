/**
 * Input mapping engine: converts raw input to semantic actions.
 *
 * Takes RawInput and an InputMapping configuration, and produces
 * a map of action names to values (0-1 or -1-1).
 */

import type {
  RawInput,
  InputMapping,
} from '@/types/transformer'

/**
 * Normalize wheel delta to -1..1 range.
 * Uses exponential smoothing to prevent jitter.
 */
function normalizeWheelDelta(delta: number, sensitivity: number = 1.0): number {
  // Scale by sensitivity and clamp
  const scaled = delta * sensitivity * 0.01 // 0.01 = rough normalization factor
  return Math.max(-1, Math.min(1, scaled))
}

/**
 * Write semantic actions into `out`. When `clearOut` is true, existing keys in `out` are removed first
 * (use false when `out` was already cleared by the caller, e.g. `clearActionRecord`).
 */
export function applyInputMappingInto(
  rawInput: RawInput,
  mapping: InputMapping,
  out: Record<string, number>,
  clearOut: boolean,
): void {
  if (clearOut) {
    for (const k of Object.keys(out)) {
      delete out[k]
    }
  }

  // Keyboard mappings
  if (mapping.keyboard) {
    const kbSensitivity = mapping.sensitivity?.keyboard ?? 1.0

    if (mapping.keyboard.w && rawInput.keys.w) {
      out[mapping.keyboard.w] = kbSensitivity
    }
    if (mapping.keyboard.a && rawInput.keys.a) {
      out[mapping.keyboard.a] = kbSensitivity
    }
    if (mapping.keyboard.s && rawInput.keys.s) {
      out[mapping.keyboard.s] = kbSensitivity
    }
    if (mapping.keyboard.d && rawInput.keys.d) {
      out[mapping.keyboard.d] = kbSensitivity
    }
    if (mapping.keyboard.space && rawInput.keys.space) {
      out[mapping.keyboard.space] = kbSensitivity
    }
    if (mapping.keyboard.shift && rawInput.keys.shift) {
      out[mapping.keyboard.shift] = kbSensitivity
    }
  }

  // Wheel mappings
  if (mapping.wheel) {
    const wheelSensitivity = mapping.sensitivity?.wheel ?? 1.0

    if (mapping.wheel.horizontal && rawInput.wheel.deltaX !== 0) {
      const actionName = mapping.wheel.horizontal
      out[actionName] = normalizeWheelDelta(rawInput.wheel.deltaX, wheelSensitivity)
    }

    if (mapping.wheel.vertical && rawInput.wheel.deltaY !== 0) {
      const actionName = mapping.wheel.vertical
      out[actionName] = normalizeWheelDelta(rawInput.wheel.deltaY, wheelSensitivity)
    }
  }

  // Touch drive (HUD steering-wheel drag): analog values written onto the SAME actions the
  // keys press, so saved worlds drive too. Forward/backward action names come from the saved
  // keyboard mapping (`w`/`s`); `steering_angle` is car2's analog steer action (positive =
  // left, like key `a`), consumed with rate limiting; 0 is absent so car2's binary path
  // self-centers the wheel. Non-car transformers ignore unknown action names.
  const touch = rawInput.touch
  if (touch) {
    if (touch.steer !== 0) {
      out.steering_angle = touch.steer
    }
    const forwardAction = mapping.keyboard?.w
    if (forwardAction && touch.drive > 0) {
      out[forwardAction] = touch.drive
    }
    const backwardAction = mapping.keyboard?.s
    if (backwardAction && touch.drive < 0) {
      out[backwardAction] = -touch.drive
    }
  }
}

/**
 * Apply input mapping to raw input, producing semantic actions.
 *
 * @param rawInput Raw hardware input
 * @param mapping Input mapping configuration
 * @returns Map of action names to values (0-1 for buttons, -1-1 for axes)
 */
export function applyInputMapping(
  rawInput: RawInput,
  mapping: InputMapping,
): Record<string, number> {
  const actions: Record<string, number> = {}
  applyInputMappingInto(rawInput, mapping, actions, true)
  return actions
}
