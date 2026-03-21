import { describe, expect, test } from 'vitest'
import { PersonTransformer } from './personTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('PersonTransformer', () => {
  const t = new PersonTransformer(10)

  describe('touch-gating', () => {
    test('when not touching, returns no impulse or addRotation', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0 },
          environment: { isTouchingObject: false },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
      expect(output.torque).toBeUndefined()
    })

    test('when isTouchingObject is undefined, no impulse and no addRotation', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0, turn_right: 1.0 },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
      expect(output.torque).toBeUndefined()
    })

    test('when touching, impulse and addRotation can be present', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0, turn_right: 1.0 },
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.torque).toBeDefined()
    })
  })

  describe('forward impulse and speed cap', () => {
    test('when touching and below max speed, forward produces impulse', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0 },
          velocity: [0, 0, 0],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.impulse![2]).toBeLessThan(0) // forward is -Z
      expect(Math.abs(output.impulse![2])).toBe(200) // default walkForce
    })

    test('when at max walk speed, no forward impulse', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0 },
          velocity: [0, 0, -4],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
    })

    test('when above max walk speed, no forward impulse', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0 },
          velocity: [0, 0, -5],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
    })

    test('run uses runForce when run action is set', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0, run: 1.0 },
          velocity: [0, 0, 0],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(Math.abs(output.impulse![2])).toBe(350)
    })

    test('when at max run speed, no forward impulse', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0, run: 1.0 },
          velocity: [0, 0, -8],
          rotation: [0, 0, 0],
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeUndefined()
    })
  })

  describe('turning', () => {
    test('turn_right produces negative yaw torque (turn_left − turn_right)', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { turn_right: 1.0 },
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.torque).toBeDefined()
      expect(Math.abs(output.torque![0])).toBeLessThan(1e-6)
      expect(Math.abs(output.torque![2])).toBeLessThan(1e-6)
      expect(output.torque![1]).toBeLessThan(0)
    })

    test('turn_left produces positive yaw torque (turn_left − turn_right)', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { turn_left: 1.0 },
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.torque).toBeDefined()
      expect(output.torque![1]).toBeGreaterThan(0)
    })

    test('no turn input produces no torque', () => {
      const output = t.transform(
        createMockTransformInput({
          actions: { forward: 1.0 },
          environment: { isTouchingObject: true },
        }),
        0.016,
      )
      expect(output.impulse).toBeDefined()
      expect(output.torque).toBeUndefined()
    })
  })
})
