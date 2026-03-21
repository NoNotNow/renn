import { describe, expect, test } from 'vitest'
import {
  TargetPoseInputTransformer,
  targetPoseInputTestExports,
} from './targetPoseInputTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

const { poseReached } = targetPoseInputTestExports

describe('TargetPoseInputTransformer', () => {
  test('empty poses clears target', () => {
    const t = new TargetPoseInputTransformer(5, { poses: [] })
    const input = createMockTransformInput({ position: [0, 0, 0], rotation: [0, 0, 0] })
    const out = t.transform(input, 0.016)
    expect(input.target).toBeUndefined()
    expect(out.force).toBeUndefined()
  })

  test('publishes target pose and linear speed only', () => {
    const t = new TargetPoseInputTransformer(5, {
      poses: [
        { position: [1, 2, 3], rotation: [0, 0, 0] },
        { position: [10, 0, 0], rotation: [0, 1, 0] },
      ],
      speed: 3,
    })
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target?.speed).toBe(3)
    expect(input.target?.pose.position).toEqual([1, 2, 3])
    expect(input.target?.pose.rotation).toEqual([0, 0, 0])
  })

  test('poseReached helper matches waypoint', () => {
    expect(
      poseReached([0, 0, 0], [0, 0, 0], { position: [0, 0, 0], rotation: [0, 0, 0] }, 0.1, 1),
    ).toBe(true)
  })

  test('cycle advances to next waypoint when first is reached', () => {
    const t = new TargetPoseInputTransformer(5, {
      poses: [
        { position: [0, 0, 0], rotation: [0, 0, 0] },
        { position: [5, 0, 0], rotation: [0, 0, 0] },
      ],
      mode: 'cycle',
      positionEpsilon: 0.1,
      rotationEpsilon: 1,
      speed: 1,
    })
    const input = createMockTransformInput({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target?.pose.position[0]).toBe(5)
  })

  test('stopAtEnd latches on last waypoint', () => {
    const t = new TargetPoseInputTransformer(5, {
      poses: [
        { position: [0, 0, 0], rotation: [0, 0, 0] },
        { position: [1, 0, 0], rotation: [0, 0, 0] },
      ],
      mode: 'stopAtEnd',
      positionEpsilon: 0.2,
      rotationEpsilon: 1,
      speed: 1,
    })
    t.transform(
      createMockTransformInput({ position: [0, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    t.transform(
      createMockTransformInput({ position: [1, 0, 0], rotation: [0, 0, 0] }),
      0.016,
    )
    const latched = createMockTransformInput({
      position: [1, 0, 0],
      rotation: [0, 0, 0],
    })
    t.transform(latched, 0.016)
    expect(latched.target?.pose.position[0]).toBe(1)
  })
})
