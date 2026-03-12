import * as THREE from 'three'
import { hasEntityId } from '@/types/sceneUserData'

/**
 * Raycast hits may land on nested GLTF meshes without userData.entityId.
 * Walks up the parent chain to the entity root (scene child) that owns entityId.
 */
export function findEntityRootForPicking(obj: THREE.Object3D | null): THREE.Object3D | null {
  let o: THREE.Object3D | null = obj
  while (o) {
    if (hasEntityId(o.userData as Record<string, unknown>)) return o
    o = o.parent
  }
  return null
}
