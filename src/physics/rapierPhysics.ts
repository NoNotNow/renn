import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type {
  RennWorld,
  Shape,
  Entity,
  TrimeshSimplificationConfig,
  ScriptDef,
  WorldSleepingSettings,
} from '@/types/world'
import type { Rotation } from '@/types/world'
import { DEFAULT_GRAVITY, DEFAULT_ROTATION } from '@/types/world'
import {
  extractMeshGeometry,
  getGeometryInfo,
  withTrimeshSceneDetachedFromEntityWrapper,
} from '@/utils/geometryExtractor'
import { simplifyGeometry, shouldSimplifyGeometry, ensureMeshoptSimplifierReady } from '@/utils/meshSimplifier'
import { eulerToRapierQuaternion } from '@/utils/rotationUtils'
import { transformTrimeshVertices } from '@/utils/trimeshTransform'
import type { CollisionImpact } from '@/scripts/scriptCtx'

export type CollisionPair = { entityIdA: string; entityIdB: string; impact?: CollisionImpact }

export interface RaycastResult {
  hit: boolean
  /** Distance along the ray to the hit point. 0 when no hit. */
  distance: number
  /** Id of the hit entity. Empty string when no hit. */
  entityId: string
}

function pairKey(handle1: number, handle2: number): string {
  const lo = Math.min(handle1, handle2)
  const hi = Math.max(handle1, handle2)
  return `${lo},${hi}`
}

export type CachedTransform = {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  linvel: { x: number; y: number; z: number }
  angvel: { x: number; y: number; z: number }
  isKinematic: boolean
  isSleeping: boolean
}

export class PhysicsWorld {
  private world: RAPIER.World
  private bodyMap: Map<string, RAPIER.RigidBody> = new Map()
  private colliderMap: Map<string, RAPIER.Collider> = new Map()
  private colliderHandleToEntityId: Map<number, string> = new Map()
  private lastCollisions: CollisionPair[] = []
  private disposed: boolean = false
  private stepping: boolean = false
  private cachedTransforms: Map<string, CachedTransform> = new Map()
  /** Reused each step in drainContactForceEvents; cleared before fill. */
  private contactForceByPair: Map<string, CollisionImpact> = new Map()
  private eventQueue: RAPIER.EventQueue | null = null
  /** When set from world JSON, per-body timers advance toward `body.sleep()`. */
  private sleepingConfig: WorldSleepingSettings | undefined
  private customSleepTimers: Map<string, number> = new Map()

  /**
   * Per-entity touching/support cache, rebuilt once per step() from narrow-phase.
   * Avoids N separate contactPairsWith+contactPair calls during executeTransformers,
   * which otherwise create thousands of temporary WASM wrapper objects per frame
   * (each triggering FinalizationRegistry register/unregister overhead).
   */
  private touchingCache: Map<string, { touching: boolean; supportVelocity?: [number, number, number] }> = new Map()
  /** Entity ids that need touching cache rebuilt each step (set by caller). */
  private touchingCacheEntityIds: Set<string> = new Set()
  /** Bodies disabled via distance-culling sleep (Rapier `setEnabled(false)`). */
  private culledForDistance: Set<string> = new Set()

  constructor(gravity: [number, number, number] = DEFAULT_GRAVITY, sleeping?: WorldSleepingSettings) {
    this.world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] })
    this.eventQueue = new RAPIER.EventQueue(true)
    this.sleepingConfig = sleeping
  }

  setGravity(gravity: [number, number, number]): void {
    this.world.gravity = { x: gravity[0], y: gravity[1], z: gravity[2] }
  }

  addEntity(entity: Entity, mesh: THREE.Mesh, scriptDefs?: Record<string, ScriptDef>): void {
    const bodyType = entity.bodyType ?? 'static'
    const position = entity.position ?? [0, 0, 0]
    const rotation = entity.rotation ?? DEFAULT_ROTATION

    // Create rigid body description
    let rigidBodyDesc: RAPIER.RigidBodyDesc
    switch (bodyType) {
      case 'dynamic':
        rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        if (this.sleepingConfig) {
          rigidBodyDesc.setCanSleep(true)
        }
        break
      case 'kinematic':
        rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        break
      case 'static':
      default:
        rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        break
    }

    // Set position
    rigidBodyDesc.setTranslation(position[0], position[1], position[2])
    
    // Convert Euler angles to quaternion for Rapier
    const quat = eulerToRapierQuaternion(rotation)
    // Rapier quaternions are already normalized by eulerToRapierQuaternion
    rigidBodyDesc.setRotation(quat)

    // Create the rigid body
    const rigidBody = this.world.createRigidBody(rigidBodyDesc)
    this.bodyMap.set(entity.id, rigidBody)

    // Set damping for dynamic bodies to provide natural friction-like behavior
    if (bodyType === 'dynamic') {
      // Linear damping: resists linear motion (like air/rolling resistance)
      rigidBody.setLinearDamping(entity.linearDamping ?? 0.3)
      // Angular damping: resists rotation
      rigidBody.setAngularDamping(entity.angularDamping ?? 0.3)
    }

    // Create collider for the shape (pass mesh for trimesh extraction)
    const colliderDesc = this.createColliderDesc(entity.shape, entity, mesh)
    if (colliderDesc) {
      // Set physics properties
      colliderDesc.setRestitution(entity.restitution ?? 0)
      const frictionValue = entity.friction ?? 0.5
      colliderDesc.setFriction(frictionValue)

      // Enable collision events for entities with onCollision scripts
      const hasCollisionScript =
        scriptDefs &&
        entity.scripts &&
        entity.scripts.some((id) => {
          const d = scriptDefs[id]
          return d && typeof d === 'object' && 'event' in d && d.event === 'onCollision'
        })
      if (hasCollisionScript) {
        colliderDesc.setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS
        )
      }

      if (bodyType === 'dynamic' && entity.mass !== undefined) {
        const volume = this.computeColliderVolume(entity.shape, entity.scale)
        if (volume > 0) {
          colliderDesc.setDensity(entity.mass / volume)
        } else {
          colliderDesc.setMass(entity.mass) // trimesh, plane when dynamic
        }
      }

      const collider = this.world.createCollider(colliderDesc, rigidBody)
      this.colliderMap.set(entity.id, collider)
      this.colliderHandleToEntityId.set(collider.handle, entity.id)
    }
  }

  /** Compute the volume of a collider shape so density = mass / volume. */
  private computeColliderVolume(shape: Shape | undefined, scale?: [number, number, number]): number {
    const [sx, sy, sz] = scale ?? [1, 1, 1]
    if (!shape) return 1 * sx * sy * sz // default unit box

    switch (shape.type) {
      case 'box':
        return shape.width * sx * shape.height * sy * shape.depth * sz
      case 'sphere': {
        const avgS = (sx + sy + sz) / 3
        const r = shape.radius * avgS
        return (4 / 3) * Math.PI * r * r * r
      }
      case 'cylinder': {
        const r = shape.radius * Math.max(sx, sz)
        const h = shape.height * sy
        return Math.PI * r * r * h
      }
      case 'capsule': {
        const r = shape.radius * Math.max(sx, sz)
        const h = Math.max(0, (shape.height - 2 * shape.radius)) * sy
        return Math.PI * r * r * h + (4 / 3) * Math.PI * r * r * r
      }
      case 'cone': {
        const r = shape.radius * Math.max(sx, sz)
        const h = shape.height * sy
        return (1 / 3) * Math.PI * r * r * h
      }
      case 'pyramid': {
        const b = shape.baseSize * Math.max(sx, sz)
        const h = shape.height * sy
        return (1 / 3) * b * b * h
      }
      case 'plane':
        return 0 // HalfSpace is infinite; static ground has no density/mass
      default:
        return 0 // trimesh and unknown shapes; mass is set via setMass when volume is 0
    }
  }

  private createColliderDesc(shape: Shape | undefined, entity: Entity, mesh?: THREE.Mesh): RAPIER.ColliderDesc | null {
    if (!shape) {
      // Default to a unit box
      return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    }

    const scale = entity.scale ?? [1, 1, 1]

    switch (shape.type) {
      case 'box':
        return RAPIER.ColliderDesc.cuboid(
          (shape.width / 2) * scale[0],
          (shape.height / 2) * scale[1],
          (shape.depth / 2) * scale[2]
        )

      case 'sphere': {
        // Use average scale for sphere
        const avgScale = (scale[0] + scale[1] + scale[2]) / 3
        return RAPIER.ColliderDesc.ball(shape.radius * avgScale)
      }

      case 'cylinder':
        return RAPIER.ColliderDesc.cylinder(
          (shape.height / 2) * scale[1],
          shape.radius * Math.max(scale[0], scale[2])
        )

      case 'capsule': {
        const halfHeight = Math.max(1e-4, (shape.height / 2 - shape.radius) * scale[1])
        return RAPIER.ColliderDesc.capsule(
          halfHeight,
          shape.radius * Math.max(scale[0], scale[2])
        )
      }

      case 'cone':
        return RAPIER.ColliderDesc.cone(
          (shape.height / 2) * scale[1],
          shape.radius * Math.max(scale[0], scale[2])
        )

      case 'pyramid': {
        // Square-base pyramid: convex hull of 5 points so collision matches visual (ConeGeometry with 4 segments).
        // Cone would use a circular base that circumscribes the square, making collision larger than the mesh.
        const halfH = shape.height / 2
        const r = shape.baseSize / Math.SQRT2 // half-diagonal of base square (= radius of cone with 4 segments)
        const [sx, sy, sz] = scale
        const points = new Float32Array(5 * 3)
        // Apex (index 0)
        points[0] = 0
        points[1] = halfH * sy
        points[2] = 0
        // Base corners (same layout as Three.js ConeGeometry with 4 radial segments)
        points[3] = r * sx
        points[4] = -halfH * sy
        points[5] = 0
        points[6] = 0
        points[7] = -halfH * sy
        points[8] = r * sz
        points[9] = -r * sx
        points[10] = -halfH * sy
        points[11] = 0
        points[12] = 0
        points[13] = -halfH * sy
        points[14] = -r * sz
        const hull = RAPIER.ColliderDesc.convexHull(points)
        if (hull) return hull
        // Fallback if convex hull fails (e.g. degenerate points)
        return RAPIER.ColliderDesc.cone(
          halfH * sy,
          r * Math.max(sx, sz)
        )
      }

      case 'plane': {
        // Infinite half-space so items never fall through away from center.
        // Outward normal: up (0, 1, 0) so solid is below the plane at body position.
        const planeShape = shape as { type: 'plane'; normal?: [number, number, number] }
        const [nx = 0, ny = 1, nz = 0] = planeShape.normal ?? [0, 1, 0]
        const len = Math.hypot(nx, ny, nz) || 1
        const normal = { x: nx / len, y: ny / len, z: nz / len }
        const halfSpace = new RAPIER.HalfSpace(normal)
        return new RAPIER.ColliderDesc(halfSpace)
      }

      case 'trimesh': {
        // Check if we have a mesh with trimesh metadata
        if (mesh && mesh.userData.isTrimeshSource) {
          try {
            // Extract geometry from the trimesh scene (stored in userData).
            // Use world transforms so internal GLTF hierarchy (e.g. -90° X on an intermediate node)
            // matches rendering. Detach from the entity wrapper so entity rotation/position are not
            // baked in (Rapier applies those on the body). Model rotation/scale from the inspector
            // are already on `modelScene` via applyModelTransform before this runs.
            const sourceScene = mesh.userData.trimeshScene || mesh
            let extractedGeometry = withTrimeshSceneDetachedFromEntityWrapper(sourceScene, () =>
              extractMeshGeometry(sourceScene, true),
            )

            if (extractedGeometry && extractedGeometry.vertices.length > 0 && extractedGeometry.indices.length > 0) {
              const transformedVertices = transformTrimeshVertices(
                extractedGeometry.vertices,
                [0, 0, 0],
                [1, 1, 1],
                scale
              )
              extractedGeometry = { vertices: transformedVertices, indices: extractedGeometry.indices }
              
              const originalInfo = getGeometryInfo(extractedGeometry)
              
              // Check if simplification is needed
              const trimeshShape = shape as { type: 'trimesh'; model: string; simplification?: TrimeshSimplificationConfig }
              const preSimplified = mesh.userData.trimeshGeometriesSimplified === true
              if (
                !preSimplified &&
                shouldSimplifyGeometry(originalInfo.triangleCount, trimeshShape.simplification)
              ) {
                if (import.meta.env.DEV) console.log(`[PhysicsWorld] Simplifying trimesh: ${originalInfo.triangleCount} triangles`)
                
                try {
                  const simplificationResult = simplifyGeometry(extractedGeometry, trimeshShape.simplification!)
                  
                  // Check if simplification actually worked
                  if (simplificationResult.reductionPercentage > 0) {
                    extractedGeometry = {
                      vertices: simplificationResult.vertices,
                      indices: simplificationResult.indices
                    }
                    
                    if (import.meta.env.DEV) console.log(
                      `[PhysicsWorld] Simplified: ${simplificationResult.originalTriangleCount} → ` +
                      `${simplificationResult.simplifiedTriangleCount} triangles ` +
                      `(${simplificationResult.reductionPercentage.toFixed(1)}% reduction)`
                    )
                  } else {
                    console.warn(
                      `[PhysicsWorld] Simplification failed or target already met (${simplificationResult.originalTriangleCount} triangles). ` +
                      `Using original geometry. Try adjusting maxTriangles threshold.`
                    )
                  }
                } catch (error) {
                  console.error('[PhysicsWorld] Simplification error, using original geometry:', error)
                }
              }
              
              const finalInfo = getGeometryInfo(extractedGeometry)
              if (import.meta.env.DEV) console.log(`[PhysicsWorld] Creating trimesh collider: ${finalInfo.vertexCount} vertices, ${finalInfo.triangleCount} triangles`)
              
              // Warn about large meshes
              if (finalInfo.triangleCount > 10000) {
                console.warn(`[PhysicsWorld] Large trimesh (${finalInfo.triangleCount} triangles) may impact performance. Consider enabling simplification.`)
              }
              
              return RAPIER.ColliderDesc.trimesh(extractedGeometry.vertices, extractedGeometry.indices)
            } else {
              console.warn('[PhysicsWorld] Failed to extract geometry from trimesh (empty or null), using box fallback')
            }
          } catch (error) {
            console.error('[PhysicsWorld] Error creating trimesh collider:', error)
          }
        }
        
        // Fallback to box if extraction fails or no mesh provided
        console.warn('[PhysicsWorld] Trimesh collider could not be created, using box fallback')
        return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
      }

      default:
        return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    }
  }

  /**
   * After Rapier step, optional custom sleep: if `world.sleeping` is set, bodies whose linear/angular
   * speed stay below thresholds for `timeUntilSleep` seconds call `body.sleep()`.
   */
  private applyCustomSleeping(dt: number): void {
    const cfg = this.sleepingConfig
    if (!cfg || cfg.timeUntilSleep < 0) {
      return
    }

    const { linearThreshold, angularThreshold, timeUntilSleep } = cfg

    for (const [entityId, body] of this.bodyMap) {
      if (!body.isDynamic()) {
        continue
      }
      if (this.culledForDistance.has(entityId)) {
        continue
      }

      if (body.isSleeping()) {
        this.customSleepTimers.delete(entityId)
        continue
      }

      const ct = this.cachedTransforms.get(entityId)
      const lv = ct ? ct.linvel : body.linvel()
      const av = ct ? ct.angvel : body.angvel()
      const linMag = Math.hypot(lv.x, lv.y, lv.z)
      const angMag = Math.hypot(av.x, av.y, av.z)

      const linearOk = linearThreshold < 0 || linMag < linearThreshold
      const angularOk = angularThreshold < 0 || angMag < angularThreshold

      if (linearOk && angularOk) {
        const prev = this.customSleepTimers.get(entityId) ?? 0
        const next = prev + dt
        if (next >= timeUntilSleep) {
          body.sleep()
          this.customSleepTimers.delete(entityId)
        } else {
          this.customSleepTimers.set(entityId, next)
        }
      } else {
        this.customSleepTimers.set(entityId, 0)
      }
    }
  }

  step(dt: number): void {
    if (this.disposed || this.stepping) {
      return
    }
    if (!this.eventQueue) {
      return
    }
    
    this.stepping = true
    try {
      this.world.timestep = dt
      this.world.step(this.eventQueue)

      // Cache transforms + velocities AFTER step to avoid WASM aliasing errors.
      // Reuse CachedTransform structs per entity to avoid per-frame allocation / GC.
      for (const [entityId, body] of this.bodyMap) {
        if (this.culledForDistance.has(entityId)) {
          continue
        }
        this.syncCachedTransformFromBody(entityId, body, false)
      }

      this.applyCustomSleeping(dt)

      if (this.touchingCacheEntityIds.size > 0) {
        this.rebuildTouchingCache()
      }

      this.lastCollisions.length = 0
      this.contactForceByPair.clear()
      this.eventQueue.drainContactForceEvents((event: RAPIER.TempContactForceEvent) => {
        const h1 = event.collider1()
        const h2 = event.collider2()
        const key = pairKey(h1, h2)
        const tf = event.totalForce()
        const mfd = event.maxForceDirection()
        this.contactForceByPair.set(key, {
          totalForce: [tf.x, tf.y, tf.z],
          totalForceMagnitude: event.totalForceMagnitude(),
          maxForceMagnitude: event.maxForceMagnitude(),
          maxForceDirection: [mfd.x, mfd.y, mfd.z],
        })
      })
      this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
        if (!started) return
        const entityIdA = this.colliderHandleToEntityId.get(handle1)
        const entityIdB = this.colliderHandleToEntityId.get(handle2)
        if (entityIdA && entityIdB) {
          const impact = this.contactForceByPair.get(pairKey(handle1, handle2))
          this.lastCollisions.push({ entityIdA, entityIdB, impact })
        }
      })
    } finally {
      this.stepping = false
    }
  }

  /**
   * Mark entity ids whose touching/support data should be cached after each step.
   * Called once when transformer set changes, not per frame.
   */
  setTouchingCacheEntityIds(ids: Iterable<string>): void {
    this.touchingCacheEntityIds.clear()
    for (const id of ids) {
      this.touchingCacheEntityIds.add(id)
    }
  }

  /**
   * Read cached touching/support state for an entity (from last step).
   * Falls back to live query if entity is not in the cache set.
   */
  getCachedTouching(entityId: string): { touching: boolean; supportVelocity?: [number, number, number] } | undefined {
    return this.touchingCache.get(entityId)
  }

  /**
   * Rebuild touching cache for all registered entity ids in one pass.
   * Replaces per-entity contactPairsWith+contactPair calls, dramatically reducing
   * WASM wrapper object churn (FinalizationRegistry overhead).
   */
  private rebuildTouchingCache(): void {
    for (const entityId of this.touchingCacheEntityIds) {
      const collider = this.colliderMap.get(entityId)
      if (!collider) {
        const entry = this.touchingCache.get(entityId)
        if (entry) {
          entry.touching = false
          entry.supportVelocity = undefined
        }
        continue
      }

      let touching = false
      let sx = 0, sy = 0, sz = 0, n = 0

      this.world.contactPairsWith(collider, (other) => {
        const otherEntityId = this.colliderHandleToEntityId.get(other.handle)
        if (!otherEntityId || otherEntityId === entityId) return
        this.world.contactPair(collider, other, (manifold, _flipped) => {
          const ns = manifold.numSolverContacts()
          if (ns > 0) {
            touching = true
            const otherBody = other.parent()
            if (otherBody) {
              for (let i = 0; i < ns; i++) {
                const p = manifold.solverContactPoint(i)
                const v = otherBody.velocityAtPoint(p)
                sx += v.x; sy += v.y; sz += v.z
                n++
              }
            }
          } else if (manifold.numContacts() > 0) {
            touching = true
            const otherBody = other.parent()
            if (otherBody) {
              const v = otherBody.linvel()
              sx += v.x; sy += v.y; sz += v.z
              n++
            }
          }
        })
      })

      let entry = this.touchingCache.get(entityId)
      if (!entry) {
        entry = { touching: false }
        this.touchingCache.set(entityId, entry)
      }
      entry.touching = touching
      if (n > 0) {
        if (!entry.supportVelocity) {
          entry.supportVelocity = [sx / n, sy / n, sz / n]
        } else {
          entry.supportVelocity[0] = sx / n
          entry.supportVelocity[1] = sy / n
          entry.supportVelocity[2] = sz / n
        }
      } else {
        entry.supportVelocity = undefined
      }
    }
  }

  getCollisions(): CollisionPair[] {
    return this.lastCollisions
  }

  getBody(entityId: string): RAPIER.RigidBody | undefined {
    return this.bodyMap.get(entityId)
  }

  getCachedTransform(entityId: string): CachedTransform | undefined {
    return this.cachedTransforms.get(entityId)
  }

  /**
   * Returns true if the entity's collider has at least one contact with another collider.
   * Uses narrow-phase contact (manifold.numContacts() > 0), not broad-phase pairs.
   * Ignores pairs where the other collider belongs to the same entity. Uses contact state from the last physics step.
   */
  isEntityTouchingAny(entityId: string): boolean {
    const collider = this.colliderMap.get(entityId)
    if (!collider) return false
    let touching = false
    this.world.contactPairsWith(collider, (other) => {
      if (touching) return
      const otherEntityId = this.colliderHandleToEntityId.get(other.handle)
      if (otherEntityId === entityId) return
      this.world.contactPair(collider, other, (manifold, _flipped) => {
        if (manifold.numContacts() > 0) touching = true
      })
    })
    return touching
  }

  /**
   * Entity ids with at least one narrow-phase contact to this entity's collider.
   * Same rules as {@link isEntityTouchingAny}; each other entity appears once.
   */
  getTouchingEntityIds(entityId: string): string[] {
    const collider = this.colliderMap.get(entityId)
    if (!collider) return []
    const seen = new Set<string>()
    this.world.contactPairsWith(collider, (other) => {
      const otherEntityId = this.colliderHandleToEntityId.get(other.handle)
      if (!otherEntityId || otherEntityId === entityId) return
      this.world.contactPair(collider, other, (manifold, _flipped) => {
        if (manifold.numContacts() > 0) seen.add(otherEntityId)
      })
    })
    return [...seen]
  }

  /**
   * Average world-space linear velocity of contacting **other** bodies at solver contact points.
   * Used so transformers (e.g. car2) can use velocity relative to the surface. Undefined if no samples.
   */
  getAverageSupportVelocity(entityId: string): [number, number, number] | undefined {
    const collider = this.colliderMap.get(entityId)
    if (!collider) return undefined
    let sx = 0
    let sy = 0
    let sz = 0
    let n = 0
    this.world.contactPairsWith(collider, (other) => {
      const otherEntityId = this.colliderHandleToEntityId.get(other.handle)
      if (!otherEntityId || otherEntityId === entityId) return
      const otherBody = other.parent()
      if (!otherBody) return
      this.world.contactPair(collider, other, (manifold, _flipped) => {
        const ns = manifold.numSolverContacts()
        if (ns > 0) {
          for (let i = 0; i < ns; i++) {
            const p = manifold.solverContactPoint(i)
            const v = otherBody.velocityAtPoint(p)
            sx += v.x
            sy += v.y
            sz += v.z
            n++
          }
        } else if (manifold.numContacts() > 0) {
          const v = otherBody.linvel()
          sx += v.x
          sy += v.y
          sz += v.z
          n++
        }
      })
    })
    if (n === 0) return undefined
    return [sx / n, sy / n, sz / n]
  }

  /**
   * Call once per frame before applying transformer forces so that
   * addForce/addTorque do not accumulate across steps.
   */
  resetAllForces(): void {
    for (const [entityId, body] of this.bodyMap) {
      if (this.culledForDistance.has(entityId)) continue
      if (body.isDynamic() && !body.isSleeping()) {
        body.resetForces(true)
        body.resetTorques(true)
      }
    }
  }

  /** Disable rigid body + colliders for distance culling (no simulation cost). Idempotent. */
  disableBodyForCulling(entityId: string): void {
    const body = this.bodyMap.get(entityId)
    if (!body || this.culledForDistance.has(entityId)) return
    body.setEnabled(false)
    this.culledForDistance.add(entityId)
  }

  /** Re-enable body after distance culling; wakes dynamic bodies. Idempotent. */
  enableBodyFromCulling(entityId: string): void {
    if (!this.culledForDistance.has(entityId)) return
    const body = this.bodyMap.get(entityId)
    if (body) {
      body.setEnabled(true)
      if (body.isDynamic()) {
        body.wakeUp()
      }
      this.customSleepTimers.delete(entityId)
      this.syncCachedTransformFromBody(entityId, body, true)
    }
    this.culledForDistance.delete(entityId)
  }

  /**
   * Wake a dynamic body and refresh {@link cachedTransforms} with a full sync so
   * the registry’s transformer pass does not skip the entity on stale `isSleeping`.
   * Used for the play-controlled avatar before `RenderItemRegistry.executeTransformers`.
   */
  wakeDynamicAndRefreshTransformCache(entityId: string): void {
    const body = this.bodyMap.get(entityId)
    if (!body) return
    if (body.isDynamic()) {
      body.wakeUp()
      this.customSleepTimers.delete(entityId)
    }
    if (body.isDynamic() || body.isKinematic()) {
      this.syncCachedTransformFromBody(entityId, body, true)
    }
  }

  /**
   * Copy rigid-body pose/velocities into {@link cachedTransforms}.
   * @param full - if true, always write pose/vel (e.g. after distance-cull re-enable so transformers
   *   do not read stale `isSleeping` from before `setEnabled(false)`). If false, matches post-step
   *   behaviour: skip pose/velocity when sleeping to avoid churn.
   */
  private syncCachedTransformFromBody(
    entityId: string,
    body: RAPIER.RigidBody,
    full: boolean,
  ): void {
    const isDynamic = body.isDynamic()
    const isKin = body.isKinematic()
    if (!isDynamic && !isKin) return

    const sleeping = body.isSleeping()
    const pos = body.translation()
    const rot = body.rotation()
    const lv = body.linvel()
    const av = body.angvel()
    let ct = this.cachedTransforms.get(entityId)
    if (!ct) {
      ct = {
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
        linvel: { x: lv.x, y: lv.y, z: lv.z },
        angvel: { x: av.x, y: av.y, z: av.z },
        isKinematic: isKin,
        isSleeping: sleeping,
      }
      this.cachedTransforms.set(entityId, ct)
      return
    }

    ct.isSleeping = sleeping
    ct.isKinematic = isKin
    if (full || !sleeping) {
      const p = ct.position
      p.x = pos.x
      p.y = pos.y
      p.z = pos.z
      const r = ct.rotation
      r.x = rot.x
      r.y = rot.y
      r.z = rot.z
      r.w = rot.w
      const clv = ct.linvel
      clv.x = lv.x
      clv.y = lv.y
      clv.z = lv.z
      const cav = ct.angvel
      cav.x = av.x
      cav.y = av.y
      cav.z = av.z
    }
  }

  setPosition(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) {
      body.setTranslation({ x, y, z }, true)
    }
  }

  /**
   * Pose for kinematic bodies, to run **before** {@link PhysicsWorld.step}.
   * Uses Rapier’s next-kinematic APIs so interacting dynamic bodies get correct
   * contact friction (see `RigidBody.setNextKinematicTranslation` in Rapier).
   * Do not use {@link setPosition} / {@link setRotation} for the same frame on kinematic movers.
   */
  setNextKinematicPose(entityId: string, x: number, y: number, z: number, rotation: Rotation): void {
    const body = this.bodyMap.get(entityId)
    if (!body || !body.isKinematic()) return
    const quat = eulerToRapierQuaternion(rotation)
    body.setNextKinematicTranslation({ x, y, z })
    body.setNextKinematicRotation(quat)
  }

  setRotation(entityId: string, rotation: [number, number, number]): void {
    const body = this.bodyMap.get(entityId)
    if (body) {
      const quat = eulerToRapierQuaternion(rotation)
      body.setRotation(quat, true)
    }
  }

  /** Set linear velocity of a body (e.g. zero it after a script-driven position change). */
  setLinearVelocity(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) body.setLinvel({ x, y, z }, true)
  }

  /**
   * Writes world-space linear velocity for a dynamic body into `out`.
   * @returns false if the body is missing or not dynamic.
   */
  getLinearVelocityInto(
    entityId: string,
    out: [number, number, number],
  ): boolean {
    const ct = this.cachedTransforms.get(entityId)
    if (ct) {
      out[0] = ct.linvel.x
      out[1] = ct.linvel.y
      out[2] = ct.linvel.z
      return true
    }
    const body = this.bodyMap.get(entityId)
    if (!body || !body.isDynamic()) return false
    const v = body.linvel()
    out[0] = v.x
    out[1] = v.y
    out[2] = v.z
    return true
  }

  /** World-space linear velocity for a dynamic body; null if missing or not dynamic. */
  getLinearVelocity(entityId: string): [number, number, number] | null {
    const ct = this.cachedTransforms.get(entityId)
    if (ct) {
      return [ct.linvel.x, ct.linvel.y, ct.linvel.z]
    }
    const body = this.bodyMap.get(entityId)
    if (!body || !body.isDynamic()) return null
    const v = body.linvel()
    return [v.x, v.y, v.z]
  }

  /** Set angular velocity of a body (e.g. zero it when applying direct rotation from transformer). */
  setAngularVelocity(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) body.setAngvel({ x, y, z }, true)
  }

  setLinearDamping(entityId: string, value: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) body.setLinearDamping(value)
  }

  setAngularDamping(entityId: string, value: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) body.setAngularDamping(value)
  }

  setRestitution(entityId: string, value: number): void {
    const collider = this.colliderMap.get(entityId)
    if (collider) collider.setRestitution(value)
  }

  setFriction(entityId: string, value: number): void {
    const collider = this.colliderMap.get(entityId)
    if (collider) collider.setFriction(value)
  }

  setMass(entityId: string, mass: number, shape?: import('@/types/world').Shape, scale?: [number, number, number]): void {
    const body = this.bodyMap.get(entityId)
    const collider = this.colliderMap.get(entityId)
    if (!body || !collider) return
    if (!body.isDynamic()) return
    const volume = this.computeColliderVolume(shape, scale)
    if (volume > 0) {
      collider.setDensity(mass / volume)
    } else {
      collider.setMass(mass)
    }
  }

  /**
   * Rebuild the collider for an entity with a new shape (e.g. box→sphere or dimension change).
   * The rigid body is kept; only the collider is removed and recreated.
   * Physics properties (restitution, friction, mass) are re-applied from the entity.
   * Active collision events are preserved from the old collider.
   */
  updateShape(entityId: string, entity: Entity, mesh: THREE.Mesh): void {
    const body = this.bodyMap.get(entityId)
    if (!body) return
    const oldCollider = this.colliderMap.get(entityId)
    const hadActiveEvents = oldCollider ? (oldCollider.activeEvents() !== 0) : false
    if (oldCollider) {
      this.colliderHandleToEntityId.delete(oldCollider.handle)
      this.world.removeCollider(oldCollider, true)
      this.colliderMap.delete(entityId)
    }
    const colliderDesc = this.createColliderDesc(entity.shape, entity, mesh)
    if (!colliderDesc) return
    colliderDesc.setRestitution(entity.restitution ?? 0)
    colliderDesc.setFriction(entity.friction ?? 0.5)
    if (hadActiveEvents) {
      colliderDesc.setActiveEvents(
        RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS
      )
    }
    if (body.isDynamic() && entity.mass !== undefined) {
      const volume = this.computeColliderVolume(entity.shape, entity.scale)
      if (volume > 0) {
        colliderDesc.setDensity(entity.mass / volume)
      } else {
        colliderDesc.setMass(entity.mass)
      }
    }
    const newCollider = this.world.createCollider(colliderDesc, body)
    this.colliderMap.set(entityId, newCollider)
    this.colliderHandleToEntityId.set(newCollider.handle, entityId)
  }

  setBodyType(entityId: string, type: 'static' | 'dynamic' | 'kinematic', linearDamping?: number, angularDamping?: number): void {
    const body = this.bodyMap.get(entityId)
    if (!body) return
    let rapierType: RAPIER.RigidBodyType
    switch (type) {
      case 'dynamic':
        rapierType = RAPIER.RigidBodyType.Dynamic
        break
      case 'kinematic':
        rapierType = RAPIER.RigidBodyType.KinematicPositionBased
        break
      case 'static':
      default:
        rapierType = RAPIER.RigidBodyType.Fixed
        break
    }
    body.setBodyType(rapierType, true)
    if (type === 'dynamic') {
      body.setLinearDamping(linearDamping ?? 0.3)
      body.setAngularDamping(angularDamping ?? 0.3)
    } else {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }

  applyImpulse(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body && body.isDynamic()) {
      if (body.isSleeping()) {
        body.wakeUp()
        this.customSleepTimers.delete(entityId)
      }
      body.applyImpulse({ x, y, z }, true)
    }
  }

  applyForce(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body && body.isDynamic()) {
      if (body.isSleeping()) {
        body.wakeUp()
        this.customSleepTimers.delete(entityId)
      }
      body.addForce({ x, y, z }, true)
    }
  }

  /**
   * Apply force from transformer output.
   * Convenience method that accepts Vec3.
   */
  applyForceFromTransformer(entityId: string, force: [number, number, number]): void {
    this.applyForce(entityId, force[0], force[1], force[2])
  }

  /**
   * Apply impulse from transformer output.
   * Convenience method that accepts Vec3.
   */
  applyImpulseFromTransformer(entityId: string, impulse: [number, number, number]): void {
    this.applyImpulse(entityId, impulse[0], impulse[1], impulse[2])
  }

  /**
   * Apply torque (rotational force).
   */
  applyTorque(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body && body.isDynamic()) {
      if (body.isSleeping()) {
        body.wakeUp()
        this.customSleepTimers.delete(entityId)
      }
      body.addTorque({ x, y, z }, true)
    }
  }

  /**
   * Apply torque from transformer output.
   * Convenience method that accepts Vec3.
   */
  applyTorqueFromTransformer(entityId: string, torque: [number, number, number]): void {
    this.applyTorque(entityId, torque[0], torque[1], torque[2])
  }

  /**
   * Cast a ray from `(originX, originY, originZ)` in direction `(dirX, dirY, dirZ)`.
   * Direction is normalized internally; returns no-hit for zero-length direction.
   * Optionally excludes a collider by entity id (e.g. the emitting entity).
   */
  raycast(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDistance = 100,
    excludeEntityId?: string,
  ): RaycastResult {
    const NO_HIT: RaycastResult = { hit: false, distance: 0, entityId: '' }
    const len = Math.hypot(dirX, dirY, dirZ)
    if (len === 0) return NO_HIT

    const nx = dirX / len
    const ny = dirY / len
    const nz = dirZ / len

    const ray = new RAPIER.Ray({ x: originX, y: originY, z: originZ }, { x: nx, y: ny, z: nz })
    const excludeCollider = excludeEntityId ? this.colliderMap.get(excludeEntityId) : undefined
    const hit = this.world.castRay(ray, maxDistance, true, undefined, undefined, excludeCollider)
    if (!hit) return NO_HIT

    const entityId = this.colliderHandleToEntityId.get(hit.collider.handle) ?? ''
    return { hit: true, distance: hit.timeOfImpact, entityId }
  }

  dispose(): void {
    if (this.disposed) {
      console.warn('[PhysicsWorld] Already disposed, skipping')
      return
    }
    
    if (this.stepping) {
      console.warn('[PhysicsWorld] Disposing while step in progress - waiting for step to complete')
      // In a real implementation, you might want to wait for stepping to complete
      // For now, we'll just log and proceed
    }
    
    this.disposed = true
    
    // Clear maps first to prevent further access
    this.bodyMap.clear()
    this.colliderMap.clear()
    this.colliderHandleToEntityId.clear()
    this.lastCollisions = []
    this.cachedTransforms.clear()
    this.contactForceByPair.clear()
    this.customSleepTimers.clear()
    this.culledForDistance.clear()
    
    // Free RAPIER resources
    try {
      if (this.eventQueue) {
        this.eventQueue.free()
        this.eventQueue = null
      }
    } catch (error) {
      console.error('[PhysicsWorld] Error freeing event queue:', error)
    }
    
    try {
      this.world.free()
    } catch (error) {
      console.error('[PhysicsWorld] Error freeing world:', error)
    }
  }
}

let rapierInitialized = false
let rapierInitPromise: Promise<void> | null = null

export async function initRapier(): Promise<void> {
  if (rapierInitialized) return
  if (rapierInitPromise) {
    await rapierInitPromise
    return
  }
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.includes('deprecated parameters for the initialization function')) {
      return
    }
    originalWarn(...args)
  }
  rapierInitPromise = RAPIER.init()
    .then(() => {
      rapierInitialized = true
    })
    .finally(() => {
      console.warn = originalWarn
    })
  await rapierInitPromise
}

export async function createPhysicsWorld(
  world: RennWorld,
  entities: LoadedEntity[]
): Promise<PhysicsWorld> {
  await initRapier()
  await ensureMeshoptSimplifierReady()

  const gravity = world.world.gravity ?? DEFAULT_GRAVITY
  const physicsWorld = new PhysicsWorld(gravity, world.world.sleeping)

  for (const { entity, mesh } of entities) {
    physicsWorld.addEntity(entity, mesh, world.scripts)
  }

  return physicsWorld
}
