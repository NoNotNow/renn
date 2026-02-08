import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Entity, Vec3, Rotation } from '@/types/world'
import { DEFAULT_POSITION, DEFAULT_ROTATION } from '@/types/world'
import { quaternionToEuler, eulerToRapierQuaternion } from '@/utils/rotationUtils'
import type { TransformerChain } from '@/transformers/transformer'

/**
 * Runtime representation of an entity: holds references to the serialised entity,
 * the Three.js mesh, and the physics body (when present). Pose is read from
 * body (via mesh after sync) or from entity; no owned copy of pose.
 */
export class RenderItem {
  transformerChain: TransformerChain | null = null

  constructor(
    readonly entity: Entity,
    readonly mesh: THREE.Mesh,
    readonly body: RAPIER.RigidBody | null
  ) {}

  /** Returns position from mesh (physics-driven) or entity (static). No copy from body in getter. */
  getPosition(): Vec3 {
    if (this.body) {
      return [this.mesh.position.x, this.mesh.position.y, this.mesh.position.z]
    }
    return this.entity.position ?? DEFAULT_POSITION
  }

  /** Writes position to body + mesh (and mesh only for static). Does not write back to entity. */
  setPosition(v: Vec3): void {
    const [x, y, z] = v
    this.mesh.position.set(x, y, z)
    if (this.body) {
      this.body.setTranslation({ x, y, z }, true)
    }
  }

  /** Returns rotation from mesh (physics-driven) or entity (static). */
  getRotation(): Rotation {
    if (this.body) {
      return quaternionToEuler(this.mesh.quaternion)
    }
    return this.entity.rotation ?? DEFAULT_ROTATION
  }

  /** Writes rotation to body + mesh (and mesh only for static). Does not write back to entity. */
  setRotation(v: Rotation): void {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0], v[1], v[2], 'XYZ'))
    this.mesh.quaternion.copy(quat)
    if (this.body) {
      const rapierQuat = eulerToRapierQuaternion(v)
      this.body.setRotation(rapierQuat, true)
    }
  }

  /** Whether pose is driven by physics (body) or from entity. */
  hasPhysicsBody(): boolean {
    return this.body != null
  }
}
