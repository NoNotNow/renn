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

  // Keyboard mappings
  if (mapping.keyboard) {
    const kbSensitivity = mapping.sensitivity?.keyboard ?? 1.0

    if (mapping.keyboard.w && rawInput.keys.w) {
      actions[mapping.keyboard.w] = kbSensitivity
    }
    if (mapping.keyboard.a && rawInput.keys.a) {
      actions[mapping.keyboard.a] = kbSensitivity
    }
    if (mapping.keyboard.s && rawInput.keys.s) {
      actions[mapping.keyboard.s] = kbSensitivity
    }
    if (mapping.keyboard.d && rawInput.keys.d) {
      actions[mapping.keyboard.d] = kbSensitivity
    }
    if (mapping.keyboard.space && rawInput.keys.space) {
      actions[mapping.keyboard.space] = kbSensitivity
    }
    if (mapping.keyboard.shift && rawInput.keys.shift) {
      actions[mapping.keyboard.shift] = kbSensitivity
    }
  }

  // Wheel mappings
  if (mapping.wheel) {
    const wheelSensitivity = mapping.sensitivity?.wheel ?? 1.0

    if (mapping.wheel.horizontal && rawInput.wheel.deltaX !== 0) {
      const actionName = mapping.wheel.horizontal
      const value = normalizeWheelDelta(rawInput.wheel.deltaX, wheelSensitivity)
      // For axes, we can accumulate or replace
      // For now, replace (last value wins)
      actions[actionName] = value
    }

    if (mapping.wheel.vertical && rawInput.wheel.deltaY !== 0) {
      const actionName = mapping.wheel.vertical
      const value = normalizeWheelDelta(rawInput.wheel.deltaY, wheelSensitivity)
      actions[actionName] = value
    }
  }

  return actions
}

/**
 * Merge multiple action maps, with later maps overriding earlier ones.
 */
export function mergeActions(
  ...actionMaps: Record<string, number>[]
): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const map of actionMaps) {
    Object.assign(merged, map)
  }
  return merged
}
