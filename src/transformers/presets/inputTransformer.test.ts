import { describe, expect, test } from 'vitest'
import { InputTransformer } from './inputTransformer'
import { CHARACTER_PRESET, AIRPLANE_PRESET } from '@/input/inputPresets'
import { createMockTransformInput } from '@/test/helpers/transformer'
import type { RawInput } from '@/types/transformer'

function createRawInput(overrides?: Partial<RawInput>): RawInput {
  return {
    keys: {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
      shift: false,
      ...overrides?.keys,
    },
    wheel: {
      deltaX: 0,
      deltaY: 0,
      ...overrides?.wheel,
    },
  }
}

describe('InputTransformer', () => {
  test('fills input.actions from raw input', () => {
    const rawInput = createRawInput({ keys: { w: true, space: true } })
    const transformer = new InputTransformer(
      0,
      CHARACTER_PRESET,
      () => rawInput,
    )
    const input = createMockTransformInput()

    transformer.transform(input, 0.016)

    expect(input.actions.forward).toBe(1.0)
    expect(input.actions.jump).toBe(1.0)
  })

  test('returns empty output (no forces)', () => {
    const rawInput = createRawInput({ keys: { w: true } })
    const transformer = new InputTransformer(0, CHARACTER_PRESET, () => rawInput)
    const input = createMockTransformInput()

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeUndefined()
    expect(output.torque).toBeUndefined()
    expect(output.earlyExit).toBe(false)
  })

  test('uses custom mapping', () => {
    const rawInput = createRawInput({ keys: { w: true } })
    const transformer = new InputTransformer(0, AIRPLANE_PRESET, () => rawInput)
    const input = createMockTransformInput()

    transformer.transform(input, 0.016)

    expect(input.actions.thrust).toBe(1.0)
    expect(input.actions.forward).toBeUndefined()
  })

  test('handles null raw input', () => {
    const transformer = new InputTransformer(0, CHARACTER_PRESET, () => null)
    const input = createMockTransformInput({ actions: { existing: 0.5 } })

    transformer.transform(input, 0.016)

    // Actions should be cleared when no input available
    expect(input.actions.existing).toBeUndefined()
    expect(Object.keys(input.actions)).toHaveLength(0)
  })

  test('merges with existing actions', () => {
    const rawInput = createRawInput({ keys: { w: true } })
    const transformer = new InputTransformer(0, CHARACTER_PRESET, () => rawInput)
    const input = createMockTransformInput({
      actions: { existing: 0.5 },
    })

    transformer.transform(input, 0.016)

    expect(input.actions.forward).toBe(1.0)
    expect(input.actions.existing).toBe(0.5) // Preserved
  })

  test('can update mapping', () => {
    const rawInput = createRawInput({ keys: { w: true } })
    const transformer = new InputTransformer(0, CHARACTER_PRESET, () => rawInput)
    const input = createMockTransformInput()

    transformer.transform(input, 0.016)
    expect(input.actions.forward).toBe(1.0)

    // Change mapping - new actions should be added
    transformer.setMapping(AIRPLANE_PRESET)
    transformer.transform(input, 0.016)
    expect(input.actions.thrust).toBe(1.0)
    // Note: forward is still there from previous transform (merging behavior)
    expect(input.actions.forward).toBe(1.0)
  })
})
