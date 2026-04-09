import * as THREE from 'three'
import type { Entity } from '@/types/world'
import { getEntityApproximateSize } from '@/utils/entityApproximateSize'

const _extentBox = new THREE.Box3()
const _extentSize = new THREE.Vector3()

/**
 * Largest world-space edge of the axis-aligned bounding box of `root` and descendants
 * (after `updateMatrixWorld`). Used for distance culling extent; falls back to
 * {@link getEntityApproximateSize} if the box is empty or non-finite.
 */
export function computeMeshWorldMaxExtent(root: THREE.Mesh, entity: Entity): number {
  root.updateMatrixWorld(true)
  _extentBox.setFromObject(root)
  if (_extentBox.isEmpty()) {
    return getEntityApproximateSize(entity)
  }
  _extentBox.getSize(_extentSize)
  const m = Math.max(_extentSize.x, _extentSize.y, _extentSize.z)
  if (!Number.isFinite(m) || m <= 0) {
    return getEntityApproximateSize(entity)
  }
  return m
}
