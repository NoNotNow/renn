/**
 * Minimal game API exposed to user scripts (main-thread, trusted).
 * Scripts receive this as global `game`.
 */
import * as THREE from 'three'
import type { Entity } from '@/types/world'
import type { PhysicsWorld } from '@/physics/rapierPhysics'

export interface GameAPI {
  time: number
  entities: Entity[]
  getEntity(id: string): Entity | undefined
  getPosition(id: string): [number, number, number] | null
  setPosition(id: string, x: number, y: number, z: number): void
  applyForce(id: string, x: number, y: number, z: number): void
  applyImpulse(id: string, x: number, y: number, z: number): void
  log(...args: unknown[]): void
}

export interface GameAPIOptions {
  getMeshById: (id: string) => THREE.Mesh | null
  getPhysicsWorld: () => PhysicsWorld | null
  entities: Entity[]
  timeRef: { current: number }
}

export function createGameAPI(
  getMeshById: (id: string) => THREE.Mesh | null,
  getPhysicsWorld: () => PhysicsWorld | null = () => null,
  entities: Entity[] = [],
  timeRef: { current: number } = { current: 0 }
): GameAPI {
  return {
    get time() {
      return timeRef.current
    },
    get entities() {
      return entities
    },
    getEntity(id: string) {
      return entities.find((e) => e.id === id)
    },
    getPosition(id: string): [number, number, number] | null {
      const mesh = getMeshById(id)
      if (!mesh) return null
      return [mesh.position.x, mesh.position.y, mesh.position.z]
    },
    setPosition(id: string, x: number, y: number, z: number) {
      const mesh = getMeshById(id)
      if (mesh) {
        mesh.position.set(x, y, z)
      }
      const physics = getPhysicsWorld()
      if (physics) {
        physics.setPosition(id, x, y, z)
      }
    },
    applyForce(id: string, x: number, y: number, z: number) {
      const physics = getPhysicsWorld()
      if (physics) {
        physics.applyForce(id, x, y, z)
      }
    },
    applyImpulse(id: string, x: number, y: number, z: number) {
      const physics = getPhysicsWorld()
      if (physics) {
        physics.applyImpulse(id, x, y, z)
      }
    },
    log(...args: unknown[]) {
      console.log('[game]', ...args)
    },
  }
}
