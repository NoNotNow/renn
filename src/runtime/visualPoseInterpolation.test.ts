import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { clampInterpolationAlpha, interpolateVisualPose } from './visualPoseInterpolation'

describe('visual pose interpolation', () => {
  it('clamps alpha to the render interpolation range', () => {
    expect(clampInterpolationAlpha(-1)).toBe(0)
    expect(clampInterpolationAlpha(0.25)).toBe(0.25)
    expect(clampInterpolationAlpha(2)).toBe(1)
    expect(clampInterpolationAlpha(Number.NaN)).toBe(1)
  })

  it('interpolates position and quaternion endpoints', () => {
    const prevPos = new THREE.Vector3(0, 0, 0)
    const currPos = new THREE.Vector3(10, 0, 0)
    const prevRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
    const currRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))
    const outPos = new THREE.Vector3()
    const outRot = new THREE.Quaternion()

    interpolateVisualPose(outPos, outRot, prevPos, currPos, prevRot, currRot, 0)
    expect(outPos.x).toBeCloseTo(0)
    expect(outRot.angleTo(prevRot)).toBeCloseTo(0)

    interpolateVisualPose(outPos, outRot, prevPos, currPos, prevRot, currRot, 1)
    expect(outPos.x).toBeCloseTo(10)
    expect(outRot.angleTo(currRot)).toBeCloseTo(0)
  })

  it('interpolates halfway between previous and current poses', () => {
    const prevPos = new THREE.Vector3(2, 4, 6)
    const currPos = new THREE.Vector3(4, 8, 10)
    const prevRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
    const currRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
    const outPos = new THREE.Vector3()
    const outRot = new THREE.Quaternion()

    interpolateVisualPose(outPos, outRot, prevPos, currPos, prevRot, currRot, 0.5)

    expect(outPos.toArray()).toEqual([3, 6, 8])
    expect(outRot.angleTo(prevRot)).toBeCloseTo(currRot.angleTo(prevRot) / 2)
  })
})
