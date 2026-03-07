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

  test('car with timeToMaxSpeed and entity mass derives acceleration', async () => {
    const config: TransformerConfig = {
      type: 'car',
      priority: 1,
      params: { timeToMaxSpeed: 7.5, maxSpeed: 25, steeringTorqueScale: 40 },
    }
    const entity = { id: 'car', mass: 20 } as import('@/types/world').Entity
    const transformer = await createTransformer(config, undefined, entity)
    const input = createMockTransformInput({ actions: { throttle: 1.0 }, velocity: [0, 0, 0], rotation: [0, 0, 0] })
    const output = transformer.transform(input, 0.016)
    // Resolved acceleration = mass * maxSpeed / timeToMaxSpeed = 20 * 25 / 7.5 = 200/3 ≈ 66.67
    const expectedForce = (entity.mass! * 25) / 7.5
    expect(output.force).toBeDefined()
    const magnitude = Math.sqrt(
      (output.force![0] ** 2) + (output.force![1] ** 2) + (output.force![2] ** 2),
    )
    expect(magnitude).toBeCloseTo(expectedForce, 1)
  })
})
