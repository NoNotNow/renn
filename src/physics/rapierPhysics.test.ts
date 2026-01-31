import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { PhysicsWorld, initRapier, createPhysicsWorld } from './rapierPhysics'
import type { Entity, RennWorld } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'

// Initialize Rapier before tests
beforeAll(async () => {
  await initRapier()
})

describe('PhysicsWorld', () => {
  it('creates a physics world with default gravity', () => {
    const pw = new PhysicsWorld()
    expect(pw).toBeDefined()
    pw.dispose()
  })

  it('creates a physics world with custom gravity', () => {
    const pw = new PhysicsWorld([0, -20, 0])
    expect(pw).toBeDefined()
    pw.dispose()
  })

  it('can change gravity after creation', () => {
    const pw = new PhysicsWorld()
    expect(() => pw.setGravity([0, -5, 0])).not.toThrow()
    pw.dispose()
  })

  it('adds a static entity', () => {
    const pw = new PhysicsWorld()
    const entity: Entity = {
      id: 'ground',
      bodyType: 'static',
      shape: { type: 'box', width: 10, height: 0.5, depth: 10 },
      position: [0, -0.25, 0],
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.5, 10),
      new THREE.MeshBasicMaterial()
    )
    
    expect(() => pw.addEntity(entity, mesh)).not.toThrow()
    expect(pw.getBody('ground')).toBeDefined()
    pw.dispose()
  })

  it('adds a dynamic entity', () => {
    const pw = new PhysicsWorld()
    const entity: Entity = {
      id: 'ball',
      bodyType: 'dynamic',
      shape: { type: 'sphere', radius: 0.5 },
      position: [0, 5, 0],
      mass: 1,
      restitution: 0.5,
      friction: 0.3,
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshBasicMaterial()
    )
    
    expect(() => pw.addEntity(entity, mesh)).not.toThrow()
    const body = pw.getBody('ball')
    expect(body).toBeDefined()
    expect(body?.isDynamic()).toBe(true)
    pw.dispose()
  })

  it('steps the physics simulation', () => {
    const pw = new PhysicsWorld()
    const entity: Entity = {
      id: 'ball',
      bodyType: 'dynamic',
      shape: { type: 'sphere', radius: 0.5 },
      position: [0, 5, 0],
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshBasicMaterial()
    )
    pw.addEntity(entity, mesh)
    
    const initialY = pw.getBody('ball')?.translation().y
    expect(initialY).toBe(5)
    
    // Step physics multiple times
    for (let i = 0; i < 10; i++) {
      pw.step(1 / 60)
    }
    
    const newY = pw.getBody('ball')?.translation().y
    // Ball should have fallen due to gravity
    expect(newY).toBeLessThan(5)
    pw.dispose()
  })

  it('syncs physics to mesh transforms', () => {
    const pw = new PhysicsWorld()
    const entity: Entity = {
      id: 'ball',
      bodyType: 'dynamic',
      shape: { type: 'sphere', radius: 0.5 },
      position: [0, 5, 0],
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshBasicMaterial()
    )
    mesh.position.set(0, 5, 0)
    pw.addEntity(entity, mesh)
    
    // Step physics
    for (let i = 0; i < 10; i++) {
      pw.step(1 / 60)
    }
    pw.syncToMeshes()
    
    // Mesh position should be updated
    expect(mesh.position.y).toBeLessThan(5)
    pw.dispose()
  })

  it('sets entity position', () => {
    const pw = new PhysicsWorld()
    const entity: Entity = {
      id: 'box',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    pw.addEntity(entity, mesh)
    
    pw.setPosition('box', 5, 10, 15)
    
    const pos = pw.getBody('box')?.translation()
    expect(pos?.x).toBe(5)
    expect(pos?.y).toBe(10)
    expect(pos?.z).toBe(15)
    pw.dispose()
  })

  it('applies impulse to dynamic body', () => {
    const pw = new PhysicsWorld([0, 0, 0]) // No gravity for this test
    const entity: Entity = {
      id: 'ball',
      bodyType: 'dynamic',
      shape: { type: 'sphere', radius: 0.5 },
      position: [0, 0, 0],
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshBasicMaterial()
    )
    pw.addEntity(entity, mesh)
    
    pw.applyImpulse('ball', 10, 0, 0)
    pw.step(1 / 60)
    
    const pos = pw.getBody('ball')?.translation()
    // Ball should have moved in x direction
    expect(pos?.x).toBeGreaterThan(0)
    pw.dispose()
  })

  it('creates colliders for different shapes', () => {
    const pw = new PhysicsWorld()
    
    const shapes: Array<{ entity: Entity; geometry: THREE.BufferGeometry }> = [
      {
        entity: { id: 'box', shape: { type: 'box', width: 2, height: 1, depth: 3 } },
        geometry: new THREE.BoxGeometry(2, 1, 3),
      },
      {
        entity: { id: 'sphere', shape: { type: 'sphere', radius: 1.5 } },
        geometry: new THREE.SphereGeometry(1.5),
      },
      {
        entity: { id: 'cylinder', shape: { type: 'cylinder', radius: 0.5, height: 2 } },
        geometry: new THREE.CylinderGeometry(0.5, 0.5, 2),
      },
      {
        entity: { id: 'capsule', shape: { type: 'capsule', radius: 0.3, height: 1.5 } },
        geometry: new THREE.CapsuleGeometry(0.3, 1.5 - 0.6),
      },
      {
        entity: { id: 'plane', shape: { type: 'plane' } },
        geometry: new THREE.PlaneGeometry(100, 100),
      },
    ]
    
    for (const { entity, geometry } of shapes) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      expect(() => pw.addEntity(entity, mesh)).not.toThrow()
      expect(pw.getBody(entity.id)).toBeDefined()
    }
    
    pw.dispose()
  })
})

describe('createPhysicsWorld', () => {
  it('creates physics world from RennWorld data', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: {
        gravity: [0, -9.81, 0],
      },
      entities: [
        {
          id: 'ground',
          bodyType: 'static',
          shape: { type: 'plane' },
          position: [0, 0, 0],
        },
        {
          id: 'ball',
          bodyType: 'dynamic',
          shape: { type: 'sphere', radius: 0.5 },
          position: [0, 5, 0],
        },
      ],
    }
    
    const entities: LoadedEntity[] = world.entities.map((entity) => ({
      entity,
      mesh: new THREE.Mesh(
        new THREE.SphereGeometry(0.5),
        new THREE.MeshBasicMaterial()
      ),
    }))
    
    const pw = await createPhysicsWorld(world, entities)
    
    expect(pw).toBeDefined()
    expect(pw.getBody('ground')).toBeDefined()
    expect(pw.getBody('ball')).toBeDefined()
    
    pw.dispose()
  })
})
