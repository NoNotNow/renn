import { describe, expect, test } from 'vitest'
import { createTransformer } from './transformerRegistry'
import { InputTransformer } from './presets/inputTransformer'
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

  test('creates CustomTransformer from code and executes it', async () => {
    const config: TransformerConfig = {
      type: 'custom',
      priority: 7,
      code: 'return { force: [1, 2, 3] };',
    }

    const transformer = await createTransformer(config)

    // Ensure transformer was created and runs the supplied code
    const output = transformer.transform(createMockTransformInput(), 0.016)
    expect(output.force).toEqual([1, 2, 3])
  })

  test('throws when creating custom transformer without code', async () => {
    const config = { type: 'custom' } as any
    await expect(createTransformer(config)).rejects.toThrow()
  })

  test('throws for unknown transformer type', async () => {
    const config = { type: 'nope' } as any
    await expect(createTransformer(config)).rejects.toThrow(/Unknown transformer type/)
  })
})
