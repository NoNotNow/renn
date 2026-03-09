/**
 * Default transformer configurations for the Builder "Add transformer" dropdown.
 * Each preset provides a sensible starting config that users can edit.
 */

import type { TransformerConfig } from '@/types/transformer'
import { CAR_PRESET } from '@/input/inputPresets'

export const TRANSFORMER_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: 'input', label: 'input' },
  { value: 'airplane', label: 'airplane' },
  { value: 'character', label: 'character' },
  { value: 'car', label: 'car' },
  { value: 'car2', label: 'car2' },
  { value: 'animal', label: 'animal' },
  { value: 'butterfly', label: 'butterfly' },
  { value: 'custom', label: 'custom' },
]

/**
 * Returns the default TransformerConfig for the given type.
 * Used when adding a transformer via the Builder dropdown.
 */
export function getDefaultTransformerConfig(type: string): TransformerConfig {
  switch (type) {
    case 'input':
      return {
        type: 'input',
        priority: 0,
        enabled: true,
        inputMapping: CAR_PRESET,
      }
    case 'airplane':
      return {
        type: 'airplane',
        priority: 10,
        enabled: true,
        params: {
          thrustForce: 50,
          liftCoefficient: 2.5,
          dragCoefficient: 0.1,
        },
      }
    case 'character':
      return {
        type: 'character',
        priority: 10,
        enabled: true,
        params: {
          walkSpeed: 5,
          jumpForce: 8,
          turnSpeed: 2,
        },
      }
    case 'car':
      return {
        type: 'car',
        priority: 10,
        enabled: true,
        params: {
          maxSpeed: 25,
          acceleration: 200,
          brakeForce: 400,
          engineBrake: 30,
          maxSteerAngle: 0.5,
          wheelbase: 2.0,
          lateralGrip: 25,
          handbrakeGripFactor: 0.15,
          handbrakeMultiplier: 3,
          steeringTorqueScale: 40,
        },
      }
    case 'car2':
      return {
        type: 'car2',
        priority: 10,
        enabled: true,
        params: {
          power: 500,
          steeringIntensity: 0.1,
          steeringSpeed: 0.01,
          lateralGrip: 120,
        },
      }
    case 'animal':
      return {
        type: 'animal',
        priority: 10,
        enabled: true,
        params: {
          wanderRadius: 10,
          speed: 2,
          directionChangeInterval: 3,
        },
      }
    case 'butterfly':
      return {
        type: 'butterfly',
        priority: 10,
        enabled: true,
        params: {
          flutterFrequency: 3,
          flightHeight: 2,
          flutterForce: 5,
        },
      }
    case 'custom':
      return {
        type: 'custom',
        priority: 10,
        enabled: true,
        code: 'return {}',
      }
    default:
      return {
        type: type as TransformerConfig['type'],
        priority: 10,
        enabled: true,
      }
  }
}
