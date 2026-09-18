import * as THREE from 'three'
import type { Vec3 } from '@/types/world'

export interface SceneCameraPose {
  position: Vec3
  forward: Vec3
  fovRadians: number
  aspect: number
}

export function perspectiveCameraToSceneCameraPose(cam: THREE.PerspectiveCamera): SceneCameraPose {
  const pos = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  cam.getWorldPosition(pos)
  cam.getWorldDirection(fwd)
  const fovRad = THREE.MathUtils.degToRad(cam.fov)
  return {
    position: [pos.x, pos.y, pos.z],
    forward: [fwd.x, fwd.y, fwd.z],
    fovRadians: fovRad,
    aspect: cam.aspect,
  }
}
