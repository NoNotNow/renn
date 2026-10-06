import { describe, expect, test } from 'vitest'
import { WandererTransformer } from './wandererTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('WandererTransformer goal feedback (goal unreachable)', () => {
  test('gives up the current goal when its own entity reports giveUp, re-picks within maxDistance, ignores other entities', () => {
    const t = new WandererTransformer(0, {
      perimeter: { center: [0, 0, 0], halfExtents: [500, 5, 500] },
      jumpDistance: 900,
      planar: true,
      positionEpsilon: 1,
      angular: false,
    })
    const input = createMockTransformInput({ position: [0, 0, 0], rotation: [0, 0, 0], entityId: 'car' })
    t.transform(input, 0.016)
    const first = [...input.target!.pose.position]
    t.transform(input, 0.016)
    expect(input.target!.pose.position).toEqual(first) // holds its goal
    input.goalFeedback = { other: { giveUp: true } }
    t.transform(input, 0.016)
    expect(input.target!.pose.position).toEqual(first) // not for us
    input.goalFeedback = { car: { giveUp: true, maxDistance: 40 } }
    t.transform(input, 0.016)
    const next = input.target!.pose.position
    expect(next).not.toEqual(first)
    expect(Math.hypot(next[0], next[2])).toBeLessThanOrEqual(40.001)
    expect(input.goalFeedback.car).toBeUndefined() // consumed
  })
})
