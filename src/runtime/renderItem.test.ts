import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { RenderItem } from './renderItem'
import { RenderItemRegistry } from './renderItemRegistry'
import type { Entity } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import { PhysicsWorld, initRapier, createPhysicsWorld } from '@/physics/rapierPhysics'
import type { RennWorld } from '@/types/world'

beforeAll(async () => {
  await initRapier()
})

describe('RenderItem', () => {
  it('returns position from entity when no body', () => {
    const entity: Entity = {
      id: 'static',
      position: [1, 2, 3],
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    mesh.position.set(5, 5, 5)
    const item = new RenderItem(entity, mesh, null)
    expect(item.getPosition()).toEqual([1, 2, 3])
  })

  it('setPosition updates mesh and not entity when no body', () => {
    const entity: Entity = { id: 'static', position: [0, 0, 0] }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    const item = new RenderItem(entity, mesh, null)
    item.setPosition([7, 8, 9])
    expect(mesh.position.x).toBe(7)
    expect(mesh.position.y).toBe(8)
    expect(mesh.position.z).toBe(9)
    expect(entity.position).toEqual([0, 0, 0])
  })

  it('hasPhysicsBody returns false when body is null', () => {
    const entity: Entity = { id: 'x' }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    const item = new RenderItem(entity, mesh, null)
    expect(item.hasPhysicsBody()).toBe(false)
  })
})

describe('RenderItemRegistry', () => {
  it('create builds registry from loaded entities and physics world', () => {
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
    const pw = new PhysicsWorld()
    pw.addEntity(entity, mesh)
    const entities: LoadedEntity[] = [{ entity, mesh }]
    const registry = RenderItemRegistry.create(entities, pw)
    const item = registry.get('ball')
    expect(item).toBeDefined()
    expect(item!.hasPhysicsBody()).toBe(true)
    registry.syncFromPhysics()
    expect(registry.getPosition('ball')).toEqual([0, 5, 0])
    pw.dispose()
  })

  it('create works with null physics world', () => {
    const entity: Entity = { id: 'static', position: [1, 2, 3] }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    const registry = RenderItemRegistry.create([{ entity, mesh }], null)
    expect(registry.getPosition('static')).toEqual([1, 2, 3])
    registry.setPosition('static', [4, 5, 6])
    expect(mesh.position.x).toBe(4)
    expect(mesh.position.y).toBe(5)
    expect(mesh.position.z).toBe(6)
  })

  it('getPositionAsVector3 returns vector or null', () => {
    const entity: Entity = { id: 'e', position: [1, 2, 3] }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    const registry = RenderItemRegistry.create([{ entity, mesh }], null)
    const v = registry.getPositionAsVector3('e')
    expect(v).not.toBeNull()
    expect(v!.x).toBe(1)
    expect(v!.y).toBe(2)
    expect(v!.z).toBe(3)
    expect(registry.getPositionAsVector3('missing')).toBeNull()
  })

  it('syncFromPhysics copies body transform to mesh', async () => {
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      entities: [
        {
          id: 'ball',
          bodyType: 'dynamic',
          shape: { type: 'sphere', radius: 0.5 },
          position: [0, 5, 0],
        },
      ],
    }
    const { loadWorld } = await import('@/loader/loadWorld')
    const { entities } = loadWorld(world)
    const pw = await createPhysicsWorld(world, entities)
    for (let i = 0; i < 20; i++) pw.step(1 / 60)
    const registry = RenderItemRegistry.create(entities, pw)
    registry.syncFromPhysics()
    const mesh = entities[0].mesh
    expect(mesh.position.y).toBeLessThan(5)
    pw.dispose()
  })

  it('getAllPoses returns map of all poses', () => {
    const entity1: Entity = { id: 'e1', position: [1, 2, 3], rotation: [0, 0, 0, 1] }
    const entity2: Entity = { id: 'e2', position: [4, 5, 6], rotation: [0, 1, 0, 0] }
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    const registry = RenderItemRegistry.create(
      [
        { entity: entity1, mesh: mesh1 },
        { entity: entity2, mesh: mesh2 },
      ],
      null
    )
    const poses = registry.getAllPoses()
    expect(poses.size).toBe(2)
    expect(poses.get('e1')).toEqual({ position: [1, 2, 3], rotation: [0, 0, 0, 1] })
    expect(poses.get('e2')).toEqual({ position: [4, 5, 6], rotation: [0, 1, 0, 0] })
  })

  it('clear removes all items', () => {
    const entity: Entity = { id: 'e', position: [0, 0, 0] }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    const registry = RenderItemRegistry.create([{ entity, mesh }], null)
    expect(registry.get('e')).toBeDefined()
    registry.clear()
    expect(registry.get('e')).toBeUndefined()
    expect(registry.getPosition('e')).toBeNull()
  })
})
