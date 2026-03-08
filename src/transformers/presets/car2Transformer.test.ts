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

  test('single key steer_left produces blue, brightened by wheel angle', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { steer_left: 1.0 } }),
      0.016,
    )
    // Blue [0.2, 0.2, 0.9] brightened toward white at full steer
    expect(output.color![0]).toBeCloseTo(1, 2)
    expect(output.color![1]).toBeCloseTo(1, 2)
    expect(output.color![2]).toBeCloseTo(1, 2)
  })

  test('no keys produces neutral gray', () => {
    const output = t.transform(
      createMockTransformInput({ actions: {} }),
      0.016,
    )
    expect(output.color).toBeDefined()
    expect(output.color![0]).toBeCloseTo(0.5, 2)
    expect(output.color![1]).toBeCloseTo(0.5, 2)
    expect(output.color![2]).toBeCloseTo(0.5, 2)
  })

  test('two keys blend colors – throttle + steer_left, brightened by wheel angle', () => {
    const output = t.transform(
      createMockTransformInput({ actions: { throttle: 1.0, steer_left: 1.0 } }),
      0.016,
    )
    expect(output.color).toBeDefined()
    // Blend (0.2, 0.55, 0.55) brightened toward white at full steer
    expect(output.color![0]).toBeCloseTo(1, 2)
    expect(output.color![1]).toBeCloseTo(1, 2)
    expect(output.color![2]).toBeCloseTo(1, 2)
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
})
