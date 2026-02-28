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

  test('zero input produces zero output', () => {
    const transformer = new CarTransformer(10, { acceleration: 15.0, steering: 1.2 })
    const input = createMockTransformInput({
      actions: {},
      velocity: [0, 0, 0],
      rotation: [0, 0, 0],
    })

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeUndefined()
    expect(output.torque).toBeUndefined()
    expect(output.earlyExit).toBe(false)
  })

  test('torque is deterministic across repeated calls', () => {
    const transformer = new CarTransformer(10, { steering: 5.0 })
    const input = createMockTransformInput({
      actions: { steer_right: 1.0 },
      velocity: [0, 0, -10],
    })

    const out1 = transformer.transform(input, 0.016)
    const out2 = transformer.transform(input, 0.016)

    expect(out1.torque).toBeDefined()
    expect(out2.torque).toEqual(out1.torque)
  })

  test('multi-frame idempotency: N identical calls produce identical output', () => {
    const transformer = new CarTransformer(10, { acceleration: 20.0, steering: 2.0 })
    const input = createMockTransformInput({
      actions: { throttle: 0.5, steer_left: 0.5 },
      velocity: [0, 0, -5],
      rotation: [0, 0, 0],
    })

    const outputs = Array.from({ length: 10 }, () =>
      transformer.transform({ ...input }, 0.016),
    )

    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i].force).toEqual(outputs[0].force)
      expect(outputs[i].torque).toEqual(outputs[0].torque)
    }
  })

  test('speedFactor at zero speed still applies minimum 20% torque', () => {
    const steering = 10
    const transformer = new CarTransformer(10, { steering })
    const input = createMockTransformInput({
      actions: { steer_right: 1.0 },
      velocity: [0, 0, 0], // Zero speed
    })

    const output = transformer.transform(input, 0.016)

    expect(output.torque).toBeDefined()
    // speedFactor = max(0.2, min(1, 0/10)) = 0.2, steerAmount = 1 * steering * 0.2
    expect(output.torque![1]).toBeCloseTo(steering * 0.2, 5)
  })

  test('production params (steering 200.5) produce expected torque magnitude at zero speed', () => {
    const transformer = new CarTransformer(10, {
      steering: 200.5,
      acceleration: 120.0,
      handbrakeMultiplier: 3.0,
    })
    const input = createMockTransformInput({
      actions: { steer_right: 1.0 },
      velocity: [0, 0, 0],
    })

    const output = transformer.transform(input, 0.016)

    expect(output.torque).toBeDefined()
    expect(output.torque![1]).toBeCloseTo(200.5 * 0.2, 2) // 40.1
  })
})
