import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { perspectiveCameraToSceneCameraPose } from './sceneCameraPose'

describe('perspectiveCameraToSceneCameraPose', () => {
  it('reads world position, forward, fov, and aspect', () => {
    const cam = new THREE.PerspectiveCamera(90, 2, 0.1, 100)
    cam.position.set(1, 2, 3)
    cam.lookAt(1, 2, 0)
    cam.updateMatrixWorld(true)
    const pose = perspectiveCameraToSceneCameraPose(cam)
    expect(pose.position[0]).toBeCloseTo(1, 5)
    expect(pose.position[1]).toBeCloseTo(2, 5)
    expect(pose.position[2]).toBeCloseTo(3, 5)
    expect(pose.forward[2]).toBeLessThan(0)
    expect(pose.fovRadians).toBeCloseTo(Math.PI / 2, 5)
    expect(pose.aspect).toBe(2)
  })
})
