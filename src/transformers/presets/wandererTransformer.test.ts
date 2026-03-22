import { describe, expect, test, vi } from 'vitest'
import {
  WandererTransformer,
  wandererTestExports,
} from './wandererTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'
import type { Vec3 } from '@/types/world'

const { clampToPerimeter, samplePositionInPerimeter, samplePositionWithJump } =
  wandererTestExports

const perimeter = {
  center: [0, 0, 0] as Vec3,
  halfExtents: [5, 5, 5] as Vec3,
}

describe('WandererTransformer', () => {
  test('publishes target within perimeter cube', () => {
    const t = new WandererTransformer(5, {
      perimeter,
      jumpDistance: 0,
      speed: 2,
    })
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target).toBeDefined()
    expect(input.target?.speed).toBe(2)
    const [x, y, z] = input.target!.pose.position
    expect(x).toBeGreaterThanOrEqual(-5)
    expect(x).toBeLessThanOrEqual(5)
    expect(y).toBeGreaterThanOrEqual(-5)
    expect(y).toBeLessThanOrEqual(5)
    expect(z).toBeGreaterThanOrEqual(-5)
    expect(z).toBeLessThanOrEqual(5)
    vi.restoreAllMocks()
  })

  test('respects linear: false - target position equals current', () => {
    const t = new WandererTransformer(5, {
      perimeter,
      linear: false,
      angular: true,
    })
    const input = createMockTransformInput({
      position: [1, 2, 3],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target?.pose.position).toEqual([1, 2, 3])
  })

  test('respects angular: false - target rotation equals current', () => {
    const t = new WandererTransformer(5, {
      perimeter,
      linear: true,
      angular: false,
    })
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0.1, 0.2, 0.3],
    })
    t.transform(input, 0.016)
    expect(input.target?.pose.rotation).toEqual([0.1, 0.2, 0.3])
  })

  test('jumpDistance constrains next target distance', () => {
    const t = new WandererTransformer(5, {
      perimeter,
      jumpDistance: 1.5,
      speed: 2,
    })
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    for (let i = 0; i < 50; i++) {
      t.transform(input, 0.016)
      const pos = input.target!.pose.position
      const dist = Math.sqrt(
        (pos[0] - input.position[0]) ** 2 +
          (pos[1] - input.position[1]) ** 2 +
          (pos[2] - input.position[2]) ** 2,
      )
      // Clamping to cube can push slightly over jumpDistance when near edges
      expect(dist).toBeLessThanOrEqual(1.5 + 0.02)
      input.position = pos as Vec3
      input.rotation = input.target!.pose.rotation
    }
  })

  test('advances to new target when current is reached', () => {
    const t = new WandererTransformer(5, {
      perimeter,
      jumpDistance: 0,
      positionEpsilon: 0.1,
      rotationEpsilon: 0.5,
      speed: 2,
    })
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    let idx = 0
    vi.spyOn(Math, 'random').mockImplementation(() => seq[idx++ % seq.length] ?? 0)
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    const firstTarget = [...input.target!.pose.position]
    input.position = firstTarget as Vec3
    input.rotation = input.target!.pose.rotation
    t.transform(input, 0.016)
    const secondTarget = [...input.target!.pose.position]
    expect(secondTarget).not.toEqual(firstTarget)
    vi.restoreAllMocks()
  })

  test('clampToPerimeter keeps points within bounds', () => {
    expect(clampToPerimeter([10, -10, 0], perimeter)).toEqual([5, -5, 0])
    expect(clampToPerimeter([-100, 0, 100], perimeter)).toEqual([-5, 0, 5])
  })

  test('samplePositionInPerimeter stays in bounds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(samplePositionInPerimeter(perimeter)).toEqual([-5, -5, -5])
    vi.spyOn(Math, 'random').mockReturnValue(1)
    expect(samplePositionInPerimeter(perimeter)).toEqual([5, 5, 5])
    vi.restoreAllMocks()
  })

  test('samplePositionWithJump clamps to perimeter', () => {
    const p = {
      center: [0, 0, 0] as Vec3,
      halfExtents: [1, 1, 1] as Vec3,
    }
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
    const result = samplePositionWithJump([0, 0, 0], 100, p)
    expect(result[0]).toBeLessThanOrEqual(1)
    expect(result[0]).toBeGreaterThanOrEqual(-1)
    vi.restoreAllMocks()
  })
})
