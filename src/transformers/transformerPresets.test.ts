import { describe, expect, test } from 'vitest'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
} from './transformerPresets'
import { CAR_PRESET } from '@/input/inputPresets'

describe('transformerPresets', () => {
  test('TRANSFORMER_PRESET_OPTIONS includes all preset types', () => {
    const types = TRANSFORMER_PRESET_OPTIONS.map((o) => o.value)
    expect(types).toContain('input')
    expect(types).toContain('airplane')
    expect(types).toContain('character')
    expect(types).toContain('car')
    expect(types).toContain('car2')
    expect(types).toContain('animal')
    expect(types).toContain('butterfly')
    expect(types).toContain('custom')
    expect(types).toHaveLength(8)
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
      power: 500,
      steeringIntensity: 0.1,
      steeringSpeed: 0.01,
      lateralGrip: 120,
    })
  })

  test('custom preset has minimal code', () => {
    const config = getDefaultTransformerConfig('custom')
    expect(config.code).toBe('return {}')
  })
})
