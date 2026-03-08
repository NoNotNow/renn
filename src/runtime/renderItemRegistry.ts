import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { Vec3, Rotation, Entity } from '@/types/world'
import { createShapeGeometry, materialFromRef } from '@/loader/createPrimitive'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
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
  /** Reused buffer for addVectorToPosition to avoid allocation on hot path. */
  private _addVecBuf: Vec3 = [0, 0, 0]

  /**
   * Build registry from loaded entities and physics world. Call after
   * createPhysicsWorld so bodies exist. Bodies are resolved by entity id.
   */
  static create(
    loadedEntities: LoadedEntity[],
    physicsWorld: PhysicsWorld | null,
    rawInputGetter?: () => RawInput | null,
  ): RenderItemRegistry {
    const registry = new RenderItemRegistry()
    registry.physicsWorld = physicsWorld
    registry.rawInputGetter = rawInputGetter ?? null
    for (const { entity, mesh } of loadedEntities) {
      const body = physicsWorld?.getBody(entity.id) ?? null
      const item = new RenderItem(entity, mesh, body)

      // Create transformer chain if entity has transformers.
      // Creation may be async (custom transformers); initialize asynchronously
      // so callers receive a registry immediately (tests expect sync create()).
      if (entity.transformers && entity.transformers.length > 0) {
        createTransformerChain(entity.transformers, rawInputGetter ?? undefined, entity)
          .then(chain => {
            if (chain) item.transformerChain = chain
          })
          .catch(error => {
            console.error(`[RenderItemRegistry] Failed to create transformer chain for ${entity.id}:`, error)
          })
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

  /**
   * getRotation as THREE.Quaternion for consumers that need a quaternion (e.g. CameraController).
   * Compensates for visual base quaternion so the result reflects logical rotation.
   */
  getRotationAsQuaternion(id: string, out?: THREE.Quaternion): THREE.Quaternion | null {
    const item = this.items.get(id)
    if (!item) return null
    const q = item.mesh.quaternion.clone()
    const baseQ = item.mesh.userData.visualBaseQuaternion as THREE.Quaternion | undefined
    if (baseQ) q.premultiply(baseQ.clone().invert())
    if (out) { out.copy(q); return out }
    return q
  }

  setRotation(id: string, v: Rotation): void {
    this.items.get(id)?.setRotation(v)
  }

  /** Set entity rotation to identity [0, 0, 0] (Euler radians). */
  resetRotation(id: string): void {
    this.setRotation(id, [0, 0, 0])
  }

  /** Add a vector to the entity position. Uses internal buffer to avoid allocation. When resetVelocity is true, zeroes linear velocity so the move persists (e.g. under gravity). */
  addVectorToPosition(id: string, x: number, y: number, z: number, resetVelocity?: boolean): void {
    const pos = this.getPosition(id)
    if (!pos) return
    this._addVecBuf[0] = pos[0] + x
    this._addVecBuf[1] = pos[1] + y
    this._addVecBuf[2] = pos[2] + z
    this.setPosition(id, this._addVecBuf)
    if (resetVelocity && this.physicsWorld) {
      this.physicsWorld.setLinearVelocity(id, 0, 0, 0)
    }
  }

  /** Set mesh color (RGB 0–1). Sync; only updates material.color on existing materials. */
  setColor(id: string, r: number, g: number, b: number): void {
    const item = this.items.get(id)
    if (!item) return
    const mesh = item.mesh
    const setColorOn = (mat: THREE.Material) => {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        mat.color.setRGB(r, g, b)
      }
    }
    if (mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(setColorOn)
        }
      })
    } else {
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach(setColorOn)
      }
    }
  }

  /**
   * World-space up direction for the entity (Y-up convention). Useful for detecting orientation
   * (e.g. upside down: getUpVector(id).y < -0.5). Compensates for visual base quaternion.
   */
  getUpVector(id: string): Vec3 | null {
    const q = this.getRotationAsQuaternion(id)
    if (!q) return null
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    return [up.x, up.y, up.z]
  }

  /**
   * World-space forward direction for the entity (Three.js: -Z). Compensates for visual base quaternion.
   */
  getForwardVector(id: string): Vec3 | null {
    const q = this.getRotationAsQuaternion(id)
    if (!q) return null
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    return [fwd.x, fwd.y, fwd.z]
  }

  /**
   * Apply incremental physics property changes to an entity's body/collider directly.
   * Only the properties present in the patch are updated; others are left unchanged.
   */
  updatePhysics(id: string, patch: Partial<Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>>): void {
    if (!this.physicsWorld) return
    const item = this.items.get(id)
    if (!item) return
    const pw = this.physicsWorld
    if (patch.linearDamping !== undefined) pw.setLinearDamping(id, patch.linearDamping)
    if (patch.angularDamping !== undefined) pw.setAngularDamping(id, patch.angularDamping)
    if (patch.restitution !== undefined) pw.setRestitution(id, patch.restitution)
    if (patch.friction !== undefined) pw.setFriction(id, patch.friction)
    if (patch.mass !== undefined) {
      const entity = item.entity
      pw.setMass(id, patch.mass, entity.shape, entity.scale)
    }
    if (patch.bodyType !== undefined) {
      const entity = item.entity
      pw.setBodyType(id, patch.bodyType, entity.linearDamping, entity.angularDamping)
    }
  }

  /**
   * Hot-swap the mesh geometry and rebuild the physics collider for a primitive shape change.
   * Returns true if the update was applied, false if the shape is trimesh (caller must fall back
   * to a full scene rebuild for trimesh shapes).
   */
  updateShape(id: string, newEntity: Entity): boolean {
    if (newEntity.shape?.type === 'trimesh') return false
    const item = this.items.get(id)
    if (!item) return false

    const newGeometry = createShapeGeometry(newEntity.shape ?? { type: 'box', width: 1, height: 1, depth: 1 })
    if (!newGeometry) return false

    const mesh = item.mesh
    const wasFlatShape = item.entity.shape?.type === 'plane' || item.entity.shape?.type === 'ring'
    const isNowFlatShape = newEntity.shape?.type === 'plane' || newEntity.shape?.type === 'ring'

    // Handle plane/ring visual base quaternion transition (both lie flat via -90° X rotation)
    if (wasFlatShape !== isNowFlatShape) {
      const currentRotation = item.getRotation()
      if (isNowFlatShape) {
        const planeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        mesh.userData.visualBaseQuaternion = planeQ
      } else {
        delete mesh.userData.visualBaseQuaternion
      }
      // Re-apply rotation so it is consistent with the new (or absent) visual base quaternion
      item.setRotation(currentRotation)
    }

    // Swap geometry
    const oldGeometry = mesh.geometry
    mesh.geometry = newGeometry
    oldGeometry.dispose()

    // Update shadow casting (planes don't cast shadows)
    mesh.castShadow = newEntity.shape?.type === 'plane' ? false : true

    // Update entity reference so future operations (e.g. mass change) use the new shape
    item.entity = newEntity
    mesh.userData.entity = newEntity

    // Rebuild physics collider with new shape
    if (this.physicsWorld) {
      this.physicsWorld.updateShape(id, newEntity, mesh)
    }

    return true
  }

  /**
   * Replace the material on an entity's mesh with one created from the new MaterialRef.
   * For model-based meshes all child meshes are updated too.
   * Old material(s) are disposed. Async because texture loading may be required.
   */
  async updateMaterial(id: string, newEntity: Entity, assetResolver?: DisposableAssetResolver): Promise<void> {
    const item = this.items.get(id)
    if (!item) return
    const mesh = item.mesh
    const newMat = await materialFromRef(newEntity.material, assetResolver)
    const isModelMesh = mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true
    if (isModelMesh) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const old = child.material
          child.material = newMat
          if (old) {
            if (Array.isArray(old)) old.forEach(m => m.dispose())
            else old.dispose()
          }
        }
      })
    } else {
      const old = mesh.material
      mesh.material = newMat
      if (old) {
        if (Array.isArray(old)) old.forEach(m => m.dispose())
        else old.dispose()
      }
    }
    item.entity = newEntity
    mesh.userData.entity = newEntity
  }

  /**
   * Execute transformers for all entities before physics step.
   * This generates forces that are then applied to physics bodies.
   */
  executeTransformers(dt: number, wind?: Vec3): void {
    if (!this.physicsWorld) return
    this.physicsWorld.resetAllForces()

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
      if (output.addRotation != null && body) {
        const newRotation: Rotation = [
          rotation[0] + output.addRotation[0],
          rotation[1] + output.addRotation[1],
          rotation[2] + output.addRotation[2],
        ]
        this.physicsWorld.setRotation(item.entity.id, newRotation)
        this.physicsWorld.setAngularVelocity(item.entity.id, 0, 0, 0)
      }
      if (output.color) {
        this.setColor(item.entity.id, output.color[0], output.color[1], output.color[2])
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
