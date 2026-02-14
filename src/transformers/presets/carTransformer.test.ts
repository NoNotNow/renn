import { describe, expect, test } from 'vitest'
import { CarTransformer } from './carTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('CarTransformer', () => {
  test('throttle generates forward force', () => {
    const transformer = new CarTransformer(10, { acceleration: 15.0 })
    const input = createMockTransformInput({
      actions: { throttle: 1.0 },
      rotation: [0, 0, 0],
    })

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeDefined()
    expect(output.force![2]).toBeLessThan(0) // Forward = -Z
  })

  test('steering generates torque when moving', () => {
    const transformer = new CarTransformer(10, { steering: 1.2 })
    const input = createMockTransformInput({
      actions: { steer_right: 1.0 },
      velocity: [0, 0, -10], // Moving forward
    })

    const output = transformer.transform(input, 0.016)

    expect(output.torque).toBeDefined()
    expect(output.torque![1]).toBeGreaterThan(0) // Turn right = +Y
  })

  test('handbrake generates deceleration force', () => {
    const transformer = new CarTransformer(10, { acceleration: 15.0, handbrakeMultiplier: 2.0 })
    const input = createMockTransformInput({
      actions: { handbrake: 1.0 },
      velocity: [0, 0, -10], // Moving forward
    })

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeDefined()
    // Handbrake should create a force opposing the velocity direction
    expect(output.force![2]).toBeGreaterThan(0) // Opposes forward movement (-Z), so positive Z force
  })
})
