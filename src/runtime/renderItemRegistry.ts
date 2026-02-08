import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { Vec3, Rotation } from '@/types/world'
import { RenderItem } from './renderItem'
import { rapierQuaternionToEuler } from '@/utils/rotationUtils'
import { createTransformerChain } from '@/transformers/transformerRegistry'
import type { TransformInput } from '@/types/transformer'
import { createEmptyTransformInput } from '@/types/transformer'
import type { RawInput } from '@/types/transformer'

/**
 * Registry of render items: one per entity. Owns body→mesh sync each frame.
 * All pose read/write goes through this layer.
 */
export class RenderItemRegistry {
  private items = new Map<string, RenderItem>()
  private physicsWorld: PhysicsWorld | null = null
  private rawInputGetter: (() => RawInput | null) | null = null

  /**
   * Build registry from loaded entities and physics world. Call after
   * createPhysicsWorld so bodies exist. Bodies are resolved by entity id.
   */
  static async create(
    loadedEntities: LoadedEntity[],
    physicsWorld: PhysicsWorld | null,
    rawInputGetter?: () => RawInput | null,
  ): Promise<RenderItemRegistry> {
    const registry = new RenderItemRegistry()
    registry.physicsWorld = physicsWorld
    registry.rawInputGetter = rawInputGetter ?? null
    for (const { entity, mesh } of loadedEntities) {
      const body = physicsWorld?.getBody(entity.id) ?? null
      const item = new RenderItem(entity, mesh, body)
      
      // Create transformer chain if entity has transformers
      if (entity.transformers && entity.transformers.length > 0) {
        try {
          const chain = await createTransformerChain(
            entity.transformers,
            rawInputGetter ?? undefined,
          )
          if (chain) {
            item.transformerChain = chain
          }
        } catch (error) {
          console.error(`[RenderItemRegistry] Failed to create transformer chain for ${entity.id}:`, error)
        }
      }
      
      registry.items.set(entity.id, item)
    }
    return registry
  }

  /**
   * Set raw input getter (for InputTransformer).
   */
  setRawInputGetter(getter: () => RawInput | null): void {
    this.rawInputGetter = getter
    // Update all InputTransformers
    for (const item of this.items.values()) {
      if (item.transformerChain) {
        const transformers = item.transformerChain.getAll()
        for (const transformer of transformers) {
          if (transformer.type === 'input' && 'setRawInputGetter' in transformer) {
            ;(transformer as any).setRawInputGetter(getter)
          }
        }
      }
    }
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

  getRotation(id: string): Rotation | null {
    const item = this.items.get(id)
    return item ? item.getRotation() : null
  }

  setRotation(id: string, v: Rotation): void {
    this.items.get(id)?.setRotation(v)
  }

  /**
   * Execute transformers for all entities before physics step.
   * This generates forces that are then applied to physics bodies.
   */
  executeTransformers(dt: number, wind?: Vec3): void {
    if (!this.physicsWorld) return

    for (const item of this.items.values()) {
      if (!item.transformerChain) continue
      if (!item.hasPhysicsBody()) continue

      // Get current physics state
      const cached = this.physicsWorld.getCachedTransform(item.entity.id)
      if (!cached) continue

      const position: Vec3 = [cached.position.x, cached.position.y, cached.position.z]
      const rotation: Rotation = rapierQuaternionToEuler(cached.rotation)
      
      // Get velocity from body (if available)
      const body = this.physicsWorld.getBody(item.entity.id)
      let velocity: Vec3 = [0, 0, 0]
      let angularVelocity: Vec3 = [0, 0, 0]
      if (body) {
        const linvel = body.linvel()
        const angvel = body.angvel()
        velocity = [linvel.x, linvel.y, linvel.z]
        angularVelocity = [angvel.x, angvel.y, angvel.z]
      }

      // Build transform input
      const input: TransformInput = createEmptyTransformInput(item.entity.id, dt)
      input.position = position
      input.rotation = rotation
      input.velocity = velocity
      input.angularVelocity = angularVelocity
      if (wind) {
        input.environment.wind = wind
      }
      // TODO: Add ground detection
      input.environment.isGrounded = false

      // Execute transformer chain
      const output = item.transformerChain.execute(input, dt)

      // Apply forces to physics body
      if (output.force && body) {
        this.physicsWorld.applyForceFromTransformer(item.entity.id, output.force)
      }
      if (output.impulse && body) {
        this.physicsWorld.applyImpulseFromTransformer(item.entity.id, output.impulse)
      }
      if (output.torque && body) {
        this.physicsWorld.applyTorqueFromTransformer(item.entity.id, output.torque)
      }
    }
  }

  /**
   * Copy body translation/rotation to mesh for all items that have a body.
   * Call once per frame after physics.step().
   * Uses cached transforms to avoid WASM aliasing errors.
   */
  syncFromPhysics(): void {
    if (!this.physicsWorld) return
    
    for (const item of this.items.values()) {
      if (!item.hasPhysicsBody()) continue
      
      // Use cached transforms instead of direct body access to avoid WASM aliasing
      const cached = this.physicsWorld.getCachedTransform(item.entity.id)
      if (!cached) continue
      
      const pos = cached.position
      const rot = cached.rotation
      item.mesh.position.set(pos.x, pos.y, pos.z)
      item.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
      // Note: Rotation is stored as Euler in entity, but mesh uses quaternion
      // The conversion happens in getRotation() when reading from entity
    }
  }

  /**
   * Get all current poses (position and rotation) for all entities.
   * Used to preserve poses across scene reloads.
   */
  getAllPoses(): Map<string, { position: Vec3; rotation: Rotation }> {
    const poses = new Map<string, { position: Vec3; rotation: Rotation }>()
    for (const [id, item] of this.items) {
      poses.set(id, {
        position: item.getPosition(),
        rotation: item.getRotation(),
      })
    }
    return poses
  }

  /**
   * Clear all items and dispose resources.
   * Note: This does NOT dispose the physics world - caller should dispose it separately
   * to avoid double-free issues.
   */
  clear(): void {
    // Dispose THREE.js resources for each mesh
    for (const item of this.items.values()) {
      if (item.mesh.geometry) {
        item.mesh.geometry.dispose()
      }
      if (item.mesh.material) {
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach(mat => {
            // Dispose textures before disposing material
            if (mat instanceof THREE.MeshStandardMaterial) {
              if (mat.map) mat.map.dispose()
            }
            mat.dispose()
          })
        } else {
          const mat = item.mesh.material
          // Dispose textures before disposing material
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map) mat.map.dispose()
          }
          mat.dispose()
        }
      }
    }
    
    this.items.clear()
    this.physicsWorld = null
  }
}
