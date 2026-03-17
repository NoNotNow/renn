/**
 * Default transformer configurations for the Builder "Add transformer" dropdown.
 * Each preset provides a sensible starting config that users can edit.
 */

import type { TransformerConfig } from '@/types/transformer'
import { CAR_PRESET } from '@/input/inputPresets'

export const TRANSFORMER_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: 'input', label: 'input' },
  { value: 'car2', label: 'car2' },
  { value: 'person', label: 'person' },
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
    case 'car2':
      return {
        type: 'car2',
        priority: 10,
        enabled: true,
        params: {
          power: 1000,
          steeringIntensity: 0.05,
          steeringSpeed: 0.05,
          lateralGrip: 120,
        },
      }
    case 'person':
      return {
        type: 'person',
        priority: 10,
        enabled: true,
        params: {
          walkForce: 200,
          runForce: 350,
          maxWalkSpeed: 4,
          maxRunSpeed: 8,
          turnSpeed: 2,
        },
      }
    default:
      return {
        type: type as TransformerConfig['type'],
        priority: 10,
        enabled: true,
      }
  }
}
