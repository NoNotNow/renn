import { describe, expect, test } from 'vitest'
import { KinematicMovementTransformer, stepLinearPosition } from './kinematicMovementTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('stepLinearPosition', () => {
  test('caps step by speed * dt', () => {
    const from: [number, number, number] = [0, 0, 0]
    const to: [number, number, number] = [10, 0, 0]
    const p = stepLinearPosition(from, to, 2, 0.5)
    expect(p[0]).toBeCloseTo(1)
    expect(p[1]).toBe(0)
    expect(p[2]).toBe(0)
  })

  test('snaps to target when within one step', () => {
    const from: [number, number, number] = [9.9, 0, 0]
    const to: [number, number, number] = [10, 0, 0]
    const p = stepLinearPosition(from, to, 5, 0.5)
    expect(p[0]).toBe(10)
  })
})

describe('KinematicMovementTransformer', () => {
  test('no target yields empty output', () => {
    const km = new KinematicMovementTransformer(6, {})
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    const out = km.transform(input, 0.016)
    expect(out.setPose).toBeUndefined()
  })

  test('uses target.speed for translation only', () => {
    const km = new KinematicMovementTransformer(6, { maxRotationRate: 100 })
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      target: {
        pose: {
          position: [1, 0, 0],
          rotation: [0, 0, 0],
        },
        speed: 10,
      },
    })
    const out = km.transform(input, 0.1)
    expect(out.setPose).toBeDefined()
    expect(out.setPose!.position[0]).toBeCloseTo(1)
    expect(out.setPose!.position[1]).toBe(0)
  })
})
