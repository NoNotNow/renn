import { describe, expect, test } from 'vitest'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
} from './transformerPresets'
import { CAR_PRESET } from '@/input/inputPresets'

describe('transformerPresets', () => {
  test('TRANSFORMER_PRESET_OPTIONS includes known preset types', () => {
    const types = TRANSFORMER_PRESET_OPTIONS.map((o) => o.value)
    expect(types).toContain('input')
    expect(types).toContain('car2')
    expect(types).toContain('person')
    expect(types).toContain('targetPoseInput')
    expect(types).toContain('kinematicMovement')
    expect(types).toContain('wanderer')
    expect(types).toContain('follow')
    expect(types).toHaveLength(7)
  })

  test('getDefaultTransformerConfig returns valid config for each type', () => {
    for (const { value } of TRANSFORMER_PRESET_OPTIONS) {
      const config = getDefaultTransformerConfig(value)
      expect(config.type).toBe(value)
      expect(config.priority).toBeDefined()
      expect(config.enabled).toBe(true)
    }
  })

  test('input preset uses CAR_PRESET mapping', () => {
    const config = getDefaultTransformerConfig('input')
    expect(config.inputMapping).toEqual(CAR_PRESET)
    expect(config.priority).toBe(0)
  })

  test('car2 preset has user-specified params', () => {
    const config = getDefaultTransformerConfig('car2')
    expect(config.params).toMatchObject({
      power: 1000,
      steeringIntensity: 0.05,
      steeringSpeed: 0.05,
      lateralGrip: 120,
      jumpImpulse: 200,
    })
  })

  test('person preset has user-specified params', () => {
    const config = getDefaultTransformerConfig('person')
    expect(config.params).toMatchObject({
      walkForce: 200,
      runForce: 350,
      maxWalkSpeed: 4,
      maxRunSpeed: 8,
      turnSpeed: 2,
    })
  })
})
