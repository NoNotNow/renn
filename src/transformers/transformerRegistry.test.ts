import { describe, expect, test } from 'vitest'
import { createTransformer } from './transformerRegistry'
import { InputTransformer } from './presets/inputTransformer'
import { CarTransformer2 } from './presets/car2Transformer'
import { createMockTransformInput } from '@/test/helpers/transformer'
import type { TransformerConfig } from '@/types/transformer'
import { CHARACTER_PRESET } from '@/input/inputPresets'

describe('Transformer Registry', () => {
  test('creates InputTransformer with given priority, mapping and enabled flag', async () => {
    const rawInput = {
      keys: { w: true, a: false, s: false, d: false, space: false, shift: false },
      wheel: { deltaX: 0, deltaY: 0 },
    }

    const config: TransformerConfig = {
      type: 'input',
      priority: 5,
      enabled: false,
      inputMapping: CHARACTER_PRESET,
    }

    const transformer = await createTransformer(config, () => rawInput as any)

    expect(transformer).toBeInstanceOf(InputTransformer)
    expect(transformer.type).toBe('input')
    expect(transformer.priority).toBe(5)
    expect(transformer.enabled).toBe(false)
  })

  test('creates CarTransformer2 from config', async () => {
    const config: TransformerConfig = {
      type: 'car2',
      priority: 1,
      params: { power: 500, lateralGrip: 100 },
    }

    const transformer = await createTransformer(config)

    expect(transformer).toBeInstanceOf(CarTransformer2)
    expect(transformer.type).toBe('car2')
    const input = createMockTransformInput({
      actions: { throttle: 1.0 },
      velocity: [0, 0, 0],
      rotation: [0, 0, 0],
      environment: { isTouchingObject: true },
    })
    const output = transformer.transform(input, 0.016)
    expect(output.impulse).toBeDefined()
  })

  test('throws for unknown transformer type', async () => {
    const config = { type: 'nope' } as any
    await expect(createTransformer(config)).rejects.toThrow(/Unknown transformer type/)
  })
})
