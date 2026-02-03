import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RennWorld, Shape, Entity } from '@/types/world'
import { DEFAULT_GRAVITY } from '@/types/world'
import { extractMeshGeometry, getGeometryInfo } from '@/utils/geometryExtractor'

export type CollisionPair = { entityIdA: string; entityIdB: string }

export type CachedTransform = {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
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
  private eventQueue: RAPIER.EventQueue | null = null

  constructor(gravity: [number, number, number] = DEFAULT_GRAVITY) {
    this.world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] })
    this.eventQueue = new RAPIER.EventQueue(true)
  }

  setGravity(gravity: [number, number, number]): void {
    this.world.gravity = { x: gravity[0], y: gravity[1], z: gravity[2] }
  }

  addEntity(entity: Entity, mesh: THREE.Mesh): void {
    const bodyType = entity.bodyType ?? 'static'
    const position = entity.position ?? [0, 0, 0]
    const rotation = entity.rotation ?? [0, 0, 0, 1]

    // Create rigid body description
    let rigidBodyDesc: RAPIER.RigidBodyDesc
    switch (bodyType) {
      case 'dynamic':
        rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
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
    
    // Validate and normalize quaternion to prevent WASM errors
    const quat = { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] }
    const length = Math.sqrt(quat.x ** 2 + quat.y ** 2 + quat.z ** 2 + quat.w ** 2)
    if (length < 0.0001 || !isFinite(length)) {
      console.warn(`[PhysicsWorld] Invalid quaternion for entity ${entity.id}, using identity`)
      rigidBodyDesc.setRotation({ x: 0, y: 0, z: 0, w: 1 })
    } else {
      // Normalize quaternion
      rigidBodyDesc.setRotation({
        x: quat.x / length,
        y: quat.y / length,
        z: quat.z / length,
        w: quat.w / length
      })
    }

    // Create the rigid body
    const rigidBody = this.world.createRigidBody(rigidBodyDesc)
    this.bodyMap.set(entity.id, rigidBody)

    // Create collider for the shape (pass mesh for trimesh extraction)
    const colliderDesc = this.createColliderDesc(entity.shape, entity, mesh)
    if (colliderDesc) {
      // Set physics properties
      colliderDesc.setRestitution(entity.restitution ?? 0)
      colliderDesc.setFriction(entity.friction ?? 0.5)

      // Enable collision events for entities with onCollision scripts
      if (entity.scripts?.onCollision) {
        colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      }

      if (bodyType === 'dynamic' && entity.mass !== undefined) {
        colliderDesc.setDensity(entity.mass)
      }

      const collider = this.world.createCollider(colliderDesc, rigidBody)
      this.colliderMap.set(entity.id, collider)
      this.colliderHandleToEntityId.set(collider.handle, entity.id)
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

      case 'plane': {
        // Create a large thin box for ground plane
        // Position it so the top surface is at y=0
        const halfExtents = { x: 100, y: 0.1, z: 100 }
        const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        // Shift the collider down so top surface aligns with y=0
        colliderDesc.setTranslation(0, -halfExtents.y, 0)
        return colliderDesc
      }

      case 'trimesh': {
        // Check if we have a mesh with trimesh metadata
        if (mesh && mesh.userData.isTrimeshSource) {
          try {
            // Extract geometry from the trimesh scene (stored in userData)
            const sourceScene = mesh.userData.trimeshScene || mesh
            const extractedGeometry = extractMeshGeometry(sourceScene, false)
            
            if (extractedGeometry && extractedGeometry.vertices.length > 0 && extractedGeometry.indices.length > 0) {
              // Apply entity scale to vertices
              const scaledVertices = new Float32Array(extractedGeometry.vertices.length)
              for (let i = 0; i < extractedGeometry.vertices.length; i += 3) {
                scaledVertices[i] = extractedGeometry.vertices[i] * scale[0]
                scaledVertices[i + 1] = extractedGeometry.vertices[i + 1] * scale[1]
                scaledVertices[i + 2] = extractedGeometry.vertices[i + 2] * scale[2]
              }
              
              const info = getGeometryInfo({ vertices: scaledVertices, indices: extractedGeometry.indices })
              console.log(`[PhysicsWorld] Creating trimesh collider: ${info.vertexCount} vertices, ${info.triangleCount} triangles`)
              
              // Warn about large meshes
              if (info.triangleCount > 10000) {
                console.warn(`[PhysicsWorld] Large trimesh (${info.triangleCount} triangles) may impact performance`)
              }
              
              return RAPIER.ColliderDesc.trimesh(scaledVertices, extractedGeometry.indices)
            } else {
              console.warn('[PhysicsWorld] Failed to extract geometry from trimesh, using box fallback')
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

  step(_dt: number): void {
    if (this.disposed || this.stepping) {
      return
    }
    if (!this.eventQueue) {
      return
    }
    
    this.stepping = true
    try {
      this.world.step(this.eventQueue)
      
      // Cache transforms AFTER step to avoid WASM aliasing errors
      for (const [entityId, body] of this.bodyMap) {
        if (body.isDynamic() || body.isKinematic()) {
          const pos = body.translation()
          const rot = body.rotation()
          const storedPos = { x: pos.x, y: pos.y, z: pos.z }
          const storedRot = { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
          this.cachedTransforms.set(entityId, {
            position: storedPos,
            rotation: storedRot
          })
        }
      }
      
      this.lastCollisions = []
      this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
        if (!started) return
        const entityIdA = this.colliderHandleToEntityId.get(handle1)
        const entityIdB = this.colliderHandleToEntityId.get(handle2)
        if (entityIdA && entityIdB) {
          this.lastCollisions.push({ entityIdA, entityIdB })
        }
      })
    } finally {
      this.stepping = false
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

  setPosition(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) {
      body.setTranslation({ x, y, z }, true)
    }
  }

  setRotation(entityId: string, x: number, y: number, z: number, w: number): void {
    const body = this.bodyMap.get(entityId)
    if (body) {
      body.setRotation({ x, y, z, w }, true)
    }
  }

  applyImpulse(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body && body.isDynamic()) {
      body.applyImpulse({ x, y, z }, true)
    }
  }

  applyForce(entityId: string, x: number, y: number, z: number): void {
    const body = this.bodyMap.get(entityId)
    if (body && body.isDynamic()) {
      body.addForce({ x, y, z }, true)
    }
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
  rapierInitPromise = RAPIER.init({})
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

  const gravity = world.world.gravity ?? DEFAULT_GRAVITY
  const physicsWorld = new PhysicsWorld(gravity)

  for (const { entity, mesh } of entities) {
    physicsWorld.addEntity(entity, mesh)
  }

  return physicsWorld
}
