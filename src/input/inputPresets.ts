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
 * Car preset: W/S = throttle/brake, A/D = steering, Space = jump (car2)
 */
export const CAR_PRESET: InputMapping = {
  keyboard: {
    w: 'throttle',
    s: 'brake',
    a: 'steer_left',
    d: 'steer_right',
    space: 'jump',
  },
  sensitivity: {
    keyboard: 1.0,
    wheel: 1.0,
  },
}

/**
 * Person preset: W/S = walk forward/backward, A/D = turn left/right, Space = run
 */
export const PERSON_PRESET: InputMapping = {
  keyboard: {
    w: 'forward',
    s: 'backward',
    a: 'turn_left',
    d: 'turn_right',
    space: 'run',
  },
  sensitivity: {
    keyboard: 1.0,
  },
}
