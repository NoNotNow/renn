import { describe, expect, test } from 'vitest'
import { CarTransformer2 } from './car2Transformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('CarTransformer2 – color feedback', () => {
  const t = new CarTransformer2(10)

  test('single key throttle produces green', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0 } }),
      0.016,
    )
    expect(output.color).toBeDefined()
    expect(output.color![0]).toBeCloseTo(0.2, 2)
    expect(output.color![1]).toBeCloseTo(0.9, 2)
    expect(output.color![2]).toBeCloseTo(0.2, 2)
    expect(output.force).toBeUndefined()
    expect(output.torque).toBeUndefined()
  })

  test('single key brake produces red', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { brake: 1.0 } }),
      0.016,
    )
    expect(output.color![0]).toBeCloseTo(0.9, 2)
    expect(output.color![1]).toBeCloseTo(0.2, 2)
    expect(output.color![2]).toBeCloseTo(0.2, 2)
  })

  test('single key steer_left produces blue, slight brightening in one frame', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { steer_left: 1.0 } }),
      0.016,
    )
    // Blue [0.2, 0.2, 0.9]; wheel angle builds over frames so only slight brightening in one call
    expect(output.color![0]).toBeCloseTo(0.2, 1)
    expect(output.color![1]).toBeCloseTo(0.2, 1)
    expect(output.color![2]).toBeCloseTo(0.9, 1)
  })

  test('no keys produces neutral color', () => {
    const output = t.transform(
      createMockTransformInput({ actions: {} }),
      0.016,
    )
    expect(output.color).toBeDefined()
    // NEUTRAL_COLOR is [0.5, 0, 0.5]
    expect(output.color![0]).toBeCloseTo(0.5, 2)
    expect(output.color![1]).toBeCloseTo(0, 2)
    expect(output.color![2]).toBeCloseTo(0.5, 2)
  })

  test('two keys blend colors – throttle + steer_left', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0, steer_left: 1.0 } }),
      0.016,
    )
    expect(output.color).toBeDefined()
    // Blend of throttle green and steer_left blue
    expect(output.color![0]).toBeCloseTo(0.2, 1)
    expect(output.color![1]).toBeGreaterThan(0.2)
    expect(output.color![2]).toBeGreaterThan(0.5)
  })

  test('handbrake produces magenta', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { handbrake: 1.0 } }),
      0.016,
    )
    expect(output.color![0]).toBeCloseTo(0.9, 2)
    expect(output.color![1]).toBeCloseTo(0.2, 2)
    expect(output.color![2]).toBeCloseTo(0.9, 2)
  })

  test('outputs addRotation (yaw delta) and no torque', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { steer_right: 1.0 } }),
      0.016,
    )
    expect(output.torque).toBeUndefined()
    expect(output.addRotation).toBeDefined()
    expect(output.addRotation![0]).toBe(0)
    expect(output.addRotation![2]).toBe(0)
    // steer_right: wheelAngle moves positive; yawDelta = wheelAngle * TURN_RATE * dt
    expect(output.addRotation![1]).toBeGreaterThan(0)
  })
})
