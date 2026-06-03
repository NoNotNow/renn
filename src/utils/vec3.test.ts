import { describe, expect, test } from 'vitest'
import {
  angleBetweenVec3,
  offsetAlongVec3,
  rightFromForwardVec3,
  signedAngleAroundAxisVec3,
} from './vec3'

describe('vec3 navigation helpers', () => {
  test('offsetAlong adds scaled direction', () => {
    expect(offsetAlongVec3([1, 2, 3], [0, 0, -1], 5)).toEqual([1, 2, -2])
  })

  test('angleBetween returns acos of normalized dot', () => {
    expect(angleBetweenVec3([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.PI / 2, 10)
    expect(angleBetweenVec3([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 10)
  })

  test('signedAngleAroundAxis matches cross-Y sign on flat XZ', () => {
    const forward: [number, number, number] = [0, 0, -1]
    const leftTarget: [number, number, number] = [-1, 0, 0]
    const rightTarget: [number, number, number] = [1, 0, 0]
    expect(signedAngleAroundAxisVec3(forward, leftTarget, [0, 1, 0])).toBeGreaterThan(0)
    expect(signedAngleAroundAxisVec3(forward, rightTarget, [0, 1, 0])).toBeLessThan(0)
  })

  test('signedAngleAroundAxis returns 0 when parallel', () => {
    expect(signedAngleAroundAxisVec3([1, 0, 0], [1, 0, 0], [0, 1, 0])).toBe(0)
  })

  test('rightFromForward is unit vector perpendicular to forward', () => {
    const right = rightFromForwardVec3([0, 0, -1])
    expect(right[0]).toBeCloseTo(1, 10)
    expect(right[1]).toBeCloseTo(0, 10)
    expect(right[2]).toBeCloseTo(0, 10)
  })
})
