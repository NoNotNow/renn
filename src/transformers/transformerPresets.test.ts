import { describe, expect, test } from 'vitest'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
} from './transformerPresets'
import { CAR_PRESET } from '@/input/inputPresets'

describe('transformerPresets', () => {
  test('TRANSFORMER_PRESET_OPTIONS includes only input and car2', () => {
    const types = TRANSFORMER_PRESET_OPTIONS.map((o) => o.value)
    expect(types).toContain('input')
    expect(types).toContain('car2')
    expect(types).toHaveLength(2)
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
    })
  })
})
