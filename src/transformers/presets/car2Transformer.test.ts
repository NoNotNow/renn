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
    // Forward velocity so forwardDistance > 0 and we get non-zero yaw (rotation [0,0,0] => forward -Z)
    const output = t.transform(
      createMockTransformInput({
        actions: { steer_right: 1.0 },
        velocity: [0, 0, -5],
        rotation: [0, 0, 0],
        environment: { isTouchingObject: true },
      }),
      0.016,
    )
    expect(output.torque).toBeUndefined()
    expect(output.addRotation).toBeDefined()
    expect(Math.abs(output.addRotation![0])).toBe(0)
    expect(Math.abs(output.addRotation![2])).toBe(0)
    // steer_right: wheelAngle moves positive; yaw delta = forwardDistance * wheelAngle * steeringIntensity
    expect(output.addRotation![1]).toBeGreaterThan(0)
  })

  describe('lateral-to-forward transfer', () => {
    // rotation [0,0,0] => forward = (0, 0, -1); velocity [5,0,0] is purely lateral
    const lateralInput = createMockTransformInput({
      actions: {},
      velocity: [5, 0, 0],
      rotation: [0, 0, 0],
      environment: { isTouchingObject: true },
    })
    const forward: [number, number, number] = [0, 0, -1]

    test('with lateralToForwardTransfer > 0, impulse has forward component from lateral', () => {
      const tWithTransfer = new CarTransformer2(10, {
        lateralToForwardTransfer: 0.2,
        lateralGrip: 100,
      })
      const output = tWithTransfer.transform(lateralInput, 0.016)
      expect(output.impulse).toBeDefined()
      const dot = (output.impulse![0] * forward[0] + output.impulse![1] * forward[1] + output.impulse![2] * forward[2])
      // magSide=5, lateralGrip=100, k=0.2 => forwardFromLateral magnitude = 100
      expect(dot).toBeCloseTo(100, 0)
    })

    test('with lateralToForwardTransfer = 0, no forward component from lateral', () => {
      const tNoTransfer = new CarTransformer2(10, {
        lateralToForwardTransfer: 0,
        lateralGrip: 100,
      })
      const output = tNoTransfer.transform(lateralInput, 0.016)
      expect(output.impulse).toBeDefined()
      const dot = (output.impulse![0] * forward[0] + output.impulse![1] * forward[1] + output.impulse![2] * forward[2])
      expect(dot).toBeCloseTo(0, 0)
    })
  })

  describe('touch-gating: physics only when touching', () => {
    test('when isTouchingObject is false, no impulse and no addRotation', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { throttle: 1.0, steer_right: 1.0 },
          velocity: [0, 0, -5],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: false },
        }),
        0.016,
      )
      expect(output.color).toBeDefined()
      expect(output.impulse).toBeUndefined()
      expect(output.addRotation).toBeUndefined()
    })

    test('when isTouchingObject is undefined, no impulse and no addRotation', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { throttle: 1.0 },
          velocity: [0, 0, -3],
          rotation: [0, 0, 0],
        }),
        0.016,
      )
      expect(output.color).toBeDefined()
      expect(output.impulse).toBeUndefined()
      expect(output.addRotation).toBeUndefined()
    })

    test('when isTouchingObject is true, impulse and addRotation are present', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { throttle: 1.0, steer_right: 1.0 },
          velocity: [0, 0, -5],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.color).toBeDefined()
      expect(output.impulse).toBeDefined()
      expect(output.addRotation).toBeDefined()
    })
  })
})
