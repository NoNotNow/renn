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
    const out = t.transform(input, 0.016)
    expect(input.target?.speed).toBe(3)
    expect(input.target?.pose.position).toEqual([1, 2, 3])
    expect(input.target?.pose.rotation).toEqual([0, 0, 0])
    expect(input.target?.label).toBe('A')
    expect(out.targetLabel).toBe('A')
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
    const out = t.transform(input, 0.016)
    expect(input.target?.pose.position[0]).toBe(5)
    expect(input.target?.label).toBe('B')
    expect(out.targetLabel).toBe('B')
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

  test('cycles labels A-Z for many waypoints', () => {
    const poses = Array.from({ length: 27 }, (_, i) => ({
      position: [i, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    }))
    const t = new TargetPoseInputTransformer(5, { poses, mode: 'cycle', speed: 1 })
    // Start far away so it doesn't advance immediately
    const input = createMockTransformInput({ position: [999, 999, 999] })
    
    // First is A
    t.transform(input, 0.016)
    expect(input.target?.label).toBe('A')
    
    // Move through 25 more to reach Z (index 25)
    for (let i = 0; i < 25; i++) {
      // Move to current target to trigger next pick
      input.position = [...input.target!.pose.position] as [number, number, number]
      t.transform(input, 0.016)
    }
    expect(input.target?.label).toBe('Z')
    
    // Next one (index 26) should be A again
    input.position = [...input.target!.pose.position] as [number, number, number]
    t.transform(input, 0.016)
    expect(input.target?.label).toBe('A')
  })
})
