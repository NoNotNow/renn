import { describe, expect, test } from 'vitest'
import { TRANSFORMER_PRESET_TYPES } from '@/transformers/transformerPresets'
import {
  getTransformerParamDoc,
  TRANSFORMER_PARAMS_DOCS,
} from '@/transformers/transformerParamDocs'
import type { PresetTransformerType } from '@/types/transformer'

describe('transformerParamDocs', () => {
  test('every preset type has a params doc map (input may be empty)', () => {
    for (const t of TRANSFORMER_PRESET_TYPES) {
      expect(TRANSFORMER_PARAMS_DOCS[t as PresetTransformerType]).toBeDefined()
      expect(typeof TRANSFORMER_PARAMS_DOCS[t as PresetTransformerType]).toBe('object')
    }
  })

  test('car2 documents core driving params', () => {
    const d = TRANSFORMER_PARAMS_DOCS.car2
    expect(d.power).toMatch(/impulse|throttle/i)
    expect(d.lateralGrip).toBeDefined()
    expect(d.tireGripSlipSpeedThreshold).toBeDefined()
  })

  test('getTransformerParamDoc returns undefined for unknown type', () => {
    expect(getTransformerParamDoc('not_a_real_type', 'power')).toBeUndefined()
  })

  test('getTransformerParamDoc resolves known keys', () => {
    expect(getTransformerParamDoc('car2', 'power')).toBe(TRANSFORMER_PARAMS_DOCS.car2.power)
  })
})
