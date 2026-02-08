import { describe, expect, test } from 'vitest'
import { CharacterTransformer } from './characterTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('CharacterTransformer', () => {
  test('forward action generates force in look direction', () => {
    const transformer = new CharacterTransformer(10, { walkSpeed: 5.0 })
    const input = createMockTransformInput({
      actions: { forward: 1.0 },
      rotation: [0, 0, 0], // Looking -Z (default forward)
    })

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeDefined()
    expect(output.force![2]).toBeLessThan(0) // Forward = -Z in Three.js
  })

  test('jump only works when grounded', () => {
    const transformer = new CharacterTransformer(10, { jumpForce: 8.0 })
    const inputGrounded = createMockTransformInput({
      actions: { jump: 1.0 },
      environment: { isGrounded: true },
    })
    const inputAir = createMockTransformInput({
      actions: { jump: 1.0 },
      environment: { isGrounded: false },
    })

    const outGrounded = transformer.transform(inputGrounded, 0.016)
    const outAir = transformer.transform(inputAir, 0.016)

    expect(outGrounded.impulse).toBeDefined()
    expect(outGrounded.impulse![1]).toBeGreaterThan(0) // Upward impulse
    expect(outAir.impulse).toBeUndefined()
  })

  test('strafe generates sideways force', () => {
    const transformer = new CharacterTransformer(10, { walkSpeed: 5.0 })
    const input = createMockTransformInput({
      actions: { strafe_right: 1.0 },
      rotation: [0, 0, 0], // Looking -Z
    })

    const output = transformer.transform(input, 0.016)

    expect(output.force).toBeDefined()
    expect(output.force![0]).toBeGreaterThan(0) // Right = +X
  })

  test('turn generates torque', () => {
    const transformer = new CharacterTransformer(10, { turnSpeed: 2.0 })
    const input = createMockTransformInput({
      actions: { turn: 0.5 },
    })

    const output = transformer.transform(input, 0.016)

    expect(output.torque).toBeDefined()
    expect(output.torque![1]).toBeGreaterThan(0) // Turn around Y
  })
})
