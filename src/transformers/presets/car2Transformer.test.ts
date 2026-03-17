import { describe, expect, test } from 'vitest'
import { CarTransformer2 } from './car2Transformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('CarTransformer2', () => {
  const t = new CarTransformer2(10)

  test('when not touching, returns no impulse or addRotation', () => {
    const output = t.transform(
      createMockTransformInput({
        actions: { throttle: 1.0 },
        environment: { isTouchingObject: false },
      }),
      0.016,
    )
    expect(output.impulse).toBeUndefined()
    expect(output.addRotation).toBeUndefined()
  })

  test('when touching, throttle produces impulse', () => {
    const output = t.transform(
      createMockTransformInput({
        actions: { throttle: 1.0 },
        environment: { isTouchingObject: true },
      }),
      0.016,
    )
    expect(output.impulse).toBeDefined()
    expect(output.force).toBeUndefined()
    expect(output.torque).toBeUndefined()
  })

  test('when touching, steer produces addRotation with forward velocity', () => {
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
    expect(output.addRotation![1]).toBeGreaterThan(0)
  })

  describe('lateral-to-forward transfer', () => {
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
      expect(output.impulse).toBeDefined()
      expect(output.addRotation).toBeDefined()
    })
  })
})
