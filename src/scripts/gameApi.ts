/**
 * Minimal game API exposed to user scripts (main-thread, trusted).
 * Scripts receive this as global `game`.
 * Pose read/write goes through the runtime registry (getPosition/setPosition).
 */
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
  getPosition: (id: string) => [number, number, number] | null
  setPosition: (id: string, x: number, y: number, z: number) => void
  getPhysicsWorld: () => PhysicsWorld | null
  entities: Entity[]
  timeRef: { current: number }
}

export function createGameAPI(
  getPosition: (id: string) => [number, number, number] | null,
  setPosition: (id: string, x: number, y: number, z: number) => void,
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
      return getPosition(id)
    },
    setPosition(id: string, x: number, y: number, z: number) {
      setPosition(id, x, y, z)
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
