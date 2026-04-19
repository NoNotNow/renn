/**
 * Pure (no WebGL) helpers extracted from modelPreview.ts so they can be unit-tested
 * without a GL context. Camera framing only uses Box3 / Vector3 math; disposal is
 * structural traversal of Three.js scene graphs and material maps.
 */
import * as THREE from 'three'

/** Distance/offset multiplier applied after the FOV-fit distance to leave headroom. */
export const FRAMING_OFFSET_MULTIPLIER = 1.8
/** Diagonal direction for the framing offset, normalised before scaling. */
export const FRAMING_OFFSET_DIRECTION: readonly [number, number, number] = [1, 0.8, 1]
/** Default fallback camera position when the bounding box is empty (no geometry). */
export const FALLBACK_CAMERA_POSITION: readonly [number, number, number] = [2, 2, 2]

/**
 * Position `camera` to frame `object`. For an empty bounding box (no geometry),
 * falls back to a fixed isometric-ish position. Otherwise, computes the distance
 * required to fit the object's largest dimension within the camera's FOV and
 * offsets the camera diagonally from the centre.
 *
 * Mutates `camera`'s position, near, far, and projection matrix.
 */
export function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) {
    camera.position.set(FALLBACK_CAMERA_POSITION[0], FALLBACK_CAMERA_POSITION[1], FALLBACK_CAMERA_POSITION[2])
    camera.lookAt(0, 0, 0)
    return
  }
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const distance = maxDim / (2 * Math.tan(fov / 2))
  const offset = new THREE.Vector3(
    FRAMING_OFFSET_DIRECTION[0],
    FRAMING_OFFSET_DIRECTION[1],
    FRAMING_OFFSET_DIRECTION[2],
  ).normalize().multiplyScalar(distance * FRAMING_OFFSET_MULTIPLIER)
  camera.position.copy(center).add(offset)
  camera.near = Math.max(distance / 100, 0.01)
  camera.far = distance * 10
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

/** Dispose every Texture-typed property of a material, then dispose the material. */
export function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}

/**
 * Recursively dispose every Mesh's geometry and material(s) under `obj`.
 * Safe to call on any Object3D; non-Mesh nodes are skipped.
 */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial)
      } else if (material) {
        disposeMaterial(material)
      }
    }
  })
}
