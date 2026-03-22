import { describe, expect, test } from 'vitest'
import { createTransformer } from './transformerRegistry'
import { InputTransformer } from './presets/inputTransformer'
import { CarTransformer2 } from './presets/car2Transformer'
import { PersonTransformer } from './presets/personTransformer'
import { TargetPoseInputTransformer } from './presets/targetPoseInputTransformer'
import { KinematicMovementTransformer } from './presets/kinematicMovementTransformer'
import { WandererTransformer } from './presets/wandererTransformer'
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

  test('creates PersonTransformer from config', async () => {
    const config: TransformerConfig = {
      type: 'person',
      priority: 10,
      params: { walkForce: 150, maxWalkSpeed: 3 },
    }

    const transformer = await createTransformer(config)

    expect(transformer).toBeInstanceOf(PersonTransformer)
    expect(transformer.type).toBe('person')
    const input = createMockTransformInput({
      actions: { forward: 1.0 },
      velocity: [0, 0, 0],
      rotation: [0, 0, 0],
      environment: { isTouchingObject: true },
    })
    const output = transformer.transform(input, 0.016)
    expect(output.impulse).toBeDefined()
  })

  test('creates TargetPoseInputTransformer from config', async () => {
    const config: TransformerConfig = {
      type: 'targetPoseInput',
      priority: 5,
      params: {
        poses: [{ position: [0, 0, 0], rotation: [0, 0, 0] }],
        speed: 2,
      },
    }

    const transformer = await createTransformer(config)

    expect(transformer).toBeInstanceOf(TargetPoseInputTransformer)
    expect(transformer.type).toBe('targetPoseInput')
  })

  test('creates KinematicMovementTransformer from config', async () => {
    const config: TransformerConfig = {
      type: 'kinematicMovement',
      priority: 6,
      params: { maxRotationRate: 3 },
    }

    const transformer = await createTransformer(config)

    expect(transformer).toBeInstanceOf(KinematicMovementTransformer)
    expect(transformer.type).toBe('kinematicMovement')
  })

  test('creates WandererTransformer from config', async () => {
    const config: TransformerConfig = {
      type: 'wanderer',
      priority: 5,
      params: {
        speed: 2,
        jumpDistance: 3,
        perimeter: { center: [0, 0, 0], halfExtents: [5, 5, 5] },
      },
    }

    const transformer = await createTransformer(config)

    expect(transformer).toBeInstanceOf(WandererTransformer)
    expect(transformer.type).toBe('wanderer')
  })

  test('throws for unknown transformer type', async () => {
    const config = { type: 'nope' } as any
    await expect(createTransformer(config)).rejects.toThrow(/Unknown transformer type/)
  })
})
