/**
 * Default input mapping presets for different vehicle/character types.
 *
 * Each preset maps raw keyboard/trackpad input to semantic action names
 * that transformers can understand.
 */

import type { InputMapping } from '@/types/transformer'

/**
 * Airplane preset: W/S = thrust/brake, A/D = roll, wheel = yaw/pitch
 */
export const AIRPLANE_PRESET: InputMapping = {
  keyboard: {
    w: 'thrust',
    s: 'brake',
    a: 'roll_left',
    d: 'roll_right',
    space: 'boost',
  },
  wheel: {
    horizontal: 'yaw',
    vertical: 'pitch',
  },
  sensitivity: {
    keyboard: 1.0,
    wheel: 0.8,
  },
}

/**
 * Character preset: W/S = forward/backward, A/D = strafe, wheel = turn
 */
export const CHARACTER_PRESET: InputMapping = {
  keyboard: {
    w: 'forward',
    s: 'backward',
    a: 'strafe_left',
    d: 'strafe_right',
    space: 'jump',
  },
  wheel: {
    horizontal: 'turn',
  },
  sensitivity: {
    keyboard: 1.0,
    wheel: 1.0,
  },
}

/**
 * Car preset: W/S = throttle/brake, A/D = steering
 */
export const CAR_PRESET: InputMapping = {
  keyboard: {
    w: 'throttle',
    s: 'brake',
    a: 'steer_left',
    d: 'steer_right',
    space: 'handbrake',
  },
  sensitivity: {
    keyboard: 1.0,
    wheel: 1.0,
  },
}

/**
 * Get preset by name.
 */
export function getPresetMapping(
  presetName: 'airplane' | 'character' | 'car',
): InputMapping {
  switch (presetName) {
    case 'airplane':
      return AIRPLANE_PRESET
    case 'character':
      return CHARACTER_PRESET
    case 'car':
      return CAR_PRESET
    default:
      return CHARACTER_PRESET // fallback
  }
}
