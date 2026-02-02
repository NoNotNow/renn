import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { Vec3, Quat } from '@/types/world'
import { RenderItem } from './renderItem'

/**
 * Registry of render items: one per entity. Owns body→mesh sync each frame.
 * All pose read/write goes through this layer.
 */
export class RenderItemRegistry {
  private items = new Map<string, RenderItem>()

  /**
   * Build registry from loaded entities and physics world. Call after
   * createPhysicsWorld so bodies exist. Bodies are resolved by entity id.
   */
  static create(loadedEntities: LoadedEntity[], physicsWorld: PhysicsWorld | null): RenderItemRegistry {
    const registry = new RenderItemRegistry()
    for (const { entity, mesh } of loadedEntities) {
      const body = physicsWorld?.getBody(entity.id) ?? null
      registry.items.set(entity.id, new RenderItem(entity, mesh, body))
    }
    return registry
  }

  get(id: string): RenderItem | undefined {
    return this.items.get(id)
  }

  getPosition(id: string): Vec3 | null {
    const item = this.items.get(id)
    return item ? item.getPosition() : null
  }

  /**
   * getPosition as THREE.Vector3 for consumers that expect a vector (e.g. CameraController).
   * Writes into out if provided to avoid allocation.
   */
  getPositionAsVector3(id: string, out?: THREE.Vector3): THREE.Vector3 | null {
    const item = this.items.get(id)
    if (!item) return null
    const [x, y, z] = item.getPosition()
    if (out) {
      out.set(x, y, z)
      return out
    }
    return new THREE.Vector3(x, y, z)
  }

  setPosition(id: string, v: Vec3): void {
    this.items.get(id)?.setPosition(v)
  }

  getRotation(id: string): Quat | null {
    const item = this.items.get(id)
    return item ? item.getRotation() : null
  }

  setRotation(id: string, v: Quat): void {
    this.items.get(id)?.setRotation(v)
  }

  /**
   * Copy body translation/rotation to mesh for all items that have a body.
   * Call once per frame after physics.step().
   */
  syncFromPhysics(): void {
    for (const item of this.items.values()) {
      if (!item.hasPhysicsBody() || !item.body) continue
      const pos = item.body.translation()
      const rot = item.body.rotation()
      item.mesh.position.set(pos.x, pos.y, pos.z)
      item.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
    }
  }

  /**
   * Get all current poses (position and rotation) for all entities.
   * Used to preserve poses across scene reloads.
   */
  getAllPoses(): Map<string, { position: Vec3; rotation: Quat }> {
    const poses = new Map<string, { position: Vec3; rotation: Quat }>()
    for (const [id, item] of this.items) {
      poses.set(id, {
        position: item.getPosition(),
        rotation: item.getRotation(),
      })
    }
    return poses
  }

  clear(): void {
    this.items.clear()
  }
}
