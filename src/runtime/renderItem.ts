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
  entity: Entity

  constructor(
    entity: Entity,
    readonly mesh: THREE.Mesh,
    readonly body: RAPIER.RigidBody | null
  ) {
    this.entity = entity
  }

  /** Returns position from mesh (physics-driven) or entity (static). No copy from body in getter. */
  getPosition(): Vec3 {
    if (this.body) {
      return [this.mesh.position.x, this.mesh.position.y, this.mesh.position.z]
    }
    return this.entity.position ?? DEFAULT_POSITION
  }

  /** Writes position to body + mesh. Updates `entity.position` in place (same object as `userData.entity` when set). */
  setPosition(v: Vec3): void {
    this.setPositionXYZ(v[0], v[1], v[2])
  }

  /** Same as {@link setPosition} but avoids allocating a temporary `Vec3` (e.g. game API). */
  setPositionXYZ(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z)
    if (this.body) {
      this.body.setTranslation({ x, y, z }, true)
    }
    if (!this.entity.position) {
      this.entity.position = [x, y, z]
    } else {
      this.entity.position[0] = x
      this.entity.position[1] = y
      this.entity.position[2] = z
    }
  }

  /** Returns rotation from mesh (physics-driven) or entity (static).
   *  Compensates for visual base quaternion (e.g. plane layout rotation)
   *  so the returned value reflects the entity's logical rotation. */
  getRotation(): Rotation {
    if (this.body) {
      const q = this.mesh.quaternion.clone()
      const baseQ = this.mesh.userData.visualBaseQuaternion as THREE.Quaternion | undefined
      if (baseQ) {
        q.premultiply(baseQ.clone().invert())
      }
      return quaternionToEuler(q)
    }
    return this.entity.rotation ?? DEFAULT_ROTATION
  }

  /** Writes rotation to body + mesh. Re-applies visual base quaternion. Updates `entity.rotation` in place. */
  setRotation(v: Rotation): void {
    this.setRotationEuler(v[0], v[1], v[2])
  }

  /** Same as {@link setRotation} without a temporary `Rotation` array. */
  setRotationEuler(rx: number, ry: number, rz: number): void {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'))
    const baseQ = this.mesh.userData.visualBaseQuaternion as THREE.Quaternion | undefined
    if (baseQ) {
      quat.premultiply(baseQ)
    }
    this.mesh.quaternion.copy(quat)
    if (this.body) {
      const rapierQuat = eulerToRapierQuaternion([rx, ry, rz])
      this.body.setRotation(rapierQuat, true)
    }
    if (!this.entity.rotation) {
      this.entity.rotation = [rx, ry, rz]
    } else {
      this.entity.rotation[0] = rx
      this.entity.rotation[1] = ry
      this.entity.rotation[2] = rz
    }
  }

  /** Mesh scale (entity scale); used by collider and gizmo scale mode. */
  getScale(): Vec3 {
    return [this.mesh.scale.x, this.mesh.scale.y, this.mesh.scale.z]
  }

  /**
   * Updates mesh scale and serialised entity only (no physics).
   * Used while dragging the scale gizmo; caller commits physics separately.
   */
  patchScale(v: Vec3): void {
    const [sx, sy, sz] = v
    this.mesh.scale.set(sx, sy, sz)
    this.entity = { ...this.entity, scale: v }
    if (this.mesh.userData.entity !== undefined) {
      this.mesh.userData.entity = this.entity
    }
  }

  /** Whether pose is driven by physics (body) or from entity. */
  hasPhysicsBody(): boolean {
    return this.body != null
  }
}
