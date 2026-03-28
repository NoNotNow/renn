import { describe, expect, test } from 'vitest'
import { FollowTransformer } from './followTransformer'
import { createMockTransformInput } from '@/test/helpers/transformer'

describe('FollowTransformer', () => {
  const leadPose = {
    position: [10, 2, -3] as const,
    rotation: [0, 1.57, 0] as const,
  }

  test('sets target from lead pose when getter returns pose', () => {
    const getter = (id: string) => (id === 'lead' ? { ...leadPose } : null)
    const t = new FollowTransformer(5, { targetEntityId: 'lead', speed: 3 }, getter)
    const input = createMockTransformInput({
      entityId: 'follower',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target).toEqual({
      pose: {
        position: [10, 2, -3],
        rotation: [0, 1.57, 0],
      },
      speed: 3,
    })
  })

  test('linear false keeps follower position in target pose', () => {
    const getter = () => ({ ...leadPose })
    const t = new FollowTransformer(
      5,
      { targetEntityId: 'lead', linear: false, angular: true },
      getter,
    )
    const input = createMockTransformInput({
      entityId: 'follower',
      position: [1, 1, 1],
      rotation: [0, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target?.pose.position).toEqual([1, 1, 1])
    expect(input.target?.pose.rotation).toEqual([0, 1.57, 0])
  })

  test('angular false keeps follower rotation in target pose', () => {
    const getter = () => ({ ...leadPose })
    const t = new FollowTransformer(
      5,
      { targetEntityId: 'lead', linear: true, angular: false },
      getter,
    )
    const input = createMockTransformInput({
      entityId: 'follower',
      position: [0, 0, 0],
      rotation: [0.5, 0, 0],
    })
    t.transform(input, 0.016)
    expect(input.target?.pose.position).toEqual([10, 2, -3])
    expect(input.target?.pose.rotation).toEqual([0.5, 0, 0])
  })

  test('clears target when targetEntityId is empty', () => {
    const getter = () => ({ ...leadPose })
    const t = new FollowTransformer(5, { targetEntityId: '' }, getter)
    const input = createMockTransformInput({
      entityId: 'follower',
      target: { pose: { position: [0, 0, 0], rotation: [0, 0, 0] }, speed: 1 },
    })
    t.transform(input, 0.016)
    expect(input.target).toBeUndefined()
  })

  test('clears target when following self', () => {
    const getter = () => ({ ...leadPose })
    const t = new FollowTransformer(5, { targetEntityId: 'same' }, getter)
    const input = createMockTransformInput({ entityId: 'same' })
    t.transform(input, 0.016)
    expect(input.target).toBeUndefined()
  })

  test('clears target when getter returns null', () => {
    const getter = () => null
    const t = new FollowTransformer(5, { targetEntityId: 'missing' }, getter)
    const input = createMockTransformInput({ entityId: 'follower' })
    t.transform(input, 0.016)
    expect(input.target).toBeUndefined()
  })

  test('clears target when no getter provided', () => {
    const t = new FollowTransformer(5, { targetEntityId: 'lead' })
    const input = createMockTransformInput({ entityId: 'follower' })
    t.transform(input, 0.016)
    expect(input.target).toBeUndefined()
  })

  test('setParams updates targetEntityId', () => {
    const getter = (id: string) =>
      id === 'b' ? { position: [0, 0, 0] as const, rotation: [0, 0, 0] as const } : null
    const t = new FollowTransformer(5, { targetEntityId: 'a' }, getter)
    const input = createMockTransformInput({ entityId: 'follower' })
    t.transform(input, 0.016)
    expect(input.target).toBeUndefined()
    t.setParams({ targetEntityId: 'b' })
    t.transform(input, 0.016)
    expect(input.target?.pose.position).toEqual([0, 0, 0])
  })
})
