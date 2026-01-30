import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { RennWorld, Shape, Entity } from '@/types/world'
import { DEFAULT_GRAVITY } from '@/types/world'

export type CollisionPair = { entityIdA: string; entityIdB: string }

export class PhysicsWorld {
  private world: RAPIER.World
  private eventQueue: RAPIER.EventQueue
  private bodyMap: Map<string, RAPIER.RigidBody> = new Map()
  private colliderMap: Map<string, RAPIER.Collider> = new Map()
  private colliderHandleToEntityId: Map<number, string> = new Map()
  private entityToMesh: Map<string, THREE.Mesh> = new Map()

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

    // Set position and rotation
    rigidBodyDesc.setTranslation(position[0], position[1], position[2])
    rigidBodyDesc.setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] })

    // Create the rigid body
    const rigidBody = this.world.createRigidBody(rigidBodyDesc)
    this.bodyMap.set(entity.id, rigidBody)
    this.entityToMesh.set(entity.id, mesh)

    // Create collider for the shape
    const colliderDesc = this.createColliderDesc(entity.shape, entity)
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

  private createColliderDesc(shape: Shape | undefined, entity: Entity): RAPIER.ColliderDesc | null {
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

      case 'trimesh':
        // For trimesh, we'd need the actual mesh vertices
        // For now, fall back to a box
        console.warn('[PhysicsWorld] Trimesh colliders not yet implemented, using box fallback')
        return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)

      default:
        return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    }
  }

  step(_dt: number): void {
    this.world.step(this.eventQueue)
  }

  syncToMeshes(): void {
    for (const [entityId, body] of this.bodyMap) {
      if (!body.isDynamic() && !body.isKinematic()) continue

      const mesh = this.entityToMesh.get(entityId)
      if (!mesh) continue

      const pos = body.translation()
      const rot = body.rotation()

      mesh.position.set(pos.x, pos.y, pos.z)
      mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
    }
  }

  getCollisions(): CollisionPair[] {
    const pairs: CollisionPair[] = []

    this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
      if (!started) return // Only report collision start events

      const entityIdA = this.colliderHandleToEntityId.get(handle1)
      const entityIdB = this.colliderHandleToEntityId.get(handle2)

      if (entityIdA && entityIdB) {
        pairs.push({ entityIdA, entityIdB })
      }
    })

    return pairs
  }

  getBody(entityId: string): RAPIER.RigidBody | undefined {
    return this.bodyMap.get(entityId)
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
    this.bodyMap.clear()
    this.colliderMap.clear()
    this.colliderHandleToEntityId.clear()
    this.entityToMesh.clear()
    this.eventQueue.free()
    this.world.free()
  }
}

let rapierInitialized = false

export async function initRapier(): Promise<void> {
  if (rapierInitialized) return
  await RAPIER.init()
  rapierInitialized = true
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
