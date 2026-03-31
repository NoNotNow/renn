import * as THREE from 'three'
import type { Rotation, Vec3 } from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'

/** Transform vertices by model rotation, model scale, then entity scale (order matches rendering). */
export function transformTrimeshVertices(
  vertices: Float32Array,
  modelRotation: Rotation,
  modelScale: Vec3,
  entityScale: Vec3
): Float32Array {
  const quat = eulerToQuaternion(modelRotation)
  const [msx, msy, msz] = modelScale
  const [sx, sy, sz] = entityScale
  const v = new THREE.Vector3()
  const out = new Float32Array(vertices.length)
  for (let i = 0; i < vertices.length; i += 3) {
    v.set(vertices[i], vertices[i + 1], vertices[i + 2])
    v.applyQuaternion(quat)
    v.x *= msx
    v.y *= msy
    v.z *= msz
    out[i] = v.x * sx
    out[i + 1] = v.y * sy
    out[i + 2] = v.z * sz
  }
  return out
}
