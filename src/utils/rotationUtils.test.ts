import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { getUpVectorFromRapierQuaternion } from './rotationUtils'

describe('rotationUtils', () => {
  describe('getUpVectorFromRapierQuaternion', () => {
    test('identity quaternion returns world up [0, 1, 0]', () => {
      const up = getUpVectorFromRapierQuaternion({ x: 0, y: 0, z: 0, w: 1 })
      expect(up[0]).toBeCloseTo(0, 10)
      expect(up[1]).toBeCloseTo(1, 10)
      expect(up[2]).toBeCloseTo(0, 10)
    })

    test('quaternion rotated 90° around Y returns correct up', () => {
      const halfY = Math.PI / 4
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        halfY * 2,
      )
      const rapierQuat = { x: q.x, y: q.y, z: q.z, w: q.w }
      const up = getUpVectorFromRapierQuaternion(rapierQuat)
      expect(up[1]).toBeCloseTo(1, 10)
      expect(up[0]).toBeCloseTo(0, 10)
      expect(up[2]).toBeCloseTo(0, 10)
    })
  })

  describe('apply yaw in quaternion space (unbounded angle)', () => {
    test('repeated yaw around body up allows total rotation to exceed 2π', () => {
      // Simulate what renderItemRegistry does: apply addRotation[1] around body's up each step
      const yawPerStep = 0.2
      const steps = 40
      const totalYaw = yawPerStep * steps // 8 rad > 2π
      let currentQ = new THREE.Quaternion(0, 0, 0, 1)
      for (let i = 0; i < steps; i++) {
        const rot = { x: currentQ.x, y: currentQ.y, z: currentQ.z, w: currentQ.w }
        const up = getUpVectorFromRapierQuaternion(rot)
        const upVec = new THREE.Vector3(up[0], up[1], up[2])
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(upVec, yawPerStep)
        currentQ = deltaQ.clone().multiply(currentQ)
      }
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentQ)
      expect(forward.y).toBeCloseTo(0, 5)
      expect(Math.abs(forward.x)).toBeCloseTo(Math.abs(Math.sin(totalYaw)), 5)
      expect(Math.abs(forward.z)).toBeCloseTo(Math.abs(Math.cos(totalYaw)), 5)
      expect(forward.x * forward.x + forward.z * forward.z).toBeCloseTo(1, 5)
    })
  })
})
