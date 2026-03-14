import * as THREE from 'three'

/**
 * Normalizes a scene so all mesh geometry fits in a 1×1×1 cube centered at the origin.
 * Computes world-space bounding box, then bakes (center + scale) into each mesh's
 * position attribute and resets mesh transforms. Mutates the scene in place.
 *
 * Used at import time for trimesh shapes and entity.model so stored geometry is
 * in [-0.5, 0.5]³; entity scale is then applied in physics/rendering.
 */
export function normalizeSceneToUnitCube(scene: THREE.Object3D): void {
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  if (box.isEmpty()) {
    return
  }

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim <= 0) {
    return
  }
  const scale = 1 / maxDim

  const vWorld = new THREE.Vector3()
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) {
      return
    }
    const mesh = child
    const positionAttr = mesh.geometry.getAttribute('position')
    if (!positionAttr) {
      return
    }

    mesh.updateMatrixWorld(true)
    const worldMatrix = mesh.matrixWorld
    const vertexCount = positionAttr.count

    for (let j = 0; j < vertexCount; j++) {
      vWorld.fromBufferAttribute(positionAttr, j).applyMatrix4(worldMatrix)
      vWorld.sub(center).multiplyScalar(scale)
      positionAttr.setXYZ(j, vWorld.x, vWorld.y, vWorld.z)
    }

    if (positionAttr.needsUpdate !== undefined) {
      positionAttr.needsUpdate = true
    }

    mesh.position.set(0, 0, 0)
    mesh.quaternion.identity()
    mesh.scale.set(1, 1, 1)
  })
}
