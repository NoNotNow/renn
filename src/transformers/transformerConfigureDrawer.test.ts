import { describe, it, expect } from 'vitest'
import type { TransformerConfig } from '@/types/transformer'
import {
  mergeConfigureDrawerApply,
  transformerConfigForConfigureDrawer,
} from './transformerConfigureDrawer'

describe('transformerConfigureDrawer', () => {
  const custom: TransformerConfig = {
    type: 'custom',
    name: 'MyCustom',
    priority: 2,
    enabled: true,
    params: { x: 1 },
    code: 'return { force: [1, 0, 0] };',
  }

  it('omits code from configure drawer JSON for custom transformers', () => {
    expect(transformerConfigForConfigureDrawer(custom)).not.toHaveProperty('code')
    expect(transformerConfigForConfigureDrawer(custom).name).toBe('MyCustom')
  })

  it('preserves existing code when applying drawer JSON for custom', () => {
    const applied = mergeConfigureDrawerApply(custom, {
      type: 'custom',
      name: 'Renamed',
      priority: 0,
      enabled: true,
      params: {},
      code: 'return { force: [9, 9, 9] };',
    })
    expect(applied.name).toBe('Renamed')
    expect(applied.code).toBe('return { force: [1, 0, 0] };')
  })

  it('passes through full config for presets', () => {
    const input: TransformerConfig = { type: 'input', priority: 0, enabled: true, params: {} }
    const updated: TransformerConfig = { type: 'input', priority: 1, enabled: false, params: { k: 1 } }
    expect(mergeConfigureDrawerApply(input, updated)).toEqual(updated)
  })
})
