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
  getRotation(id: string): [number, number, number] | null
  setRotation(id: string, x: number, y: number, z: number): void
  /** World-space up direction [x,y,z] (Y-up). Upside down when .y < -0.5. */
  getUpVector(id: string): [number, number, number] | null
  /** World-space forward direction [x,y,z] (Three.js -Z). */
  getForwardVector(id: string): [number, number, number] | null
  /** Set entity rotation to identity [0, 0, 0]. */
  resetRotation(id: string): void
  /** Add [x, y, z] to entity position. When resetVelocity is true, zeroes linear velocity so the move persists (e.g. under gravity). */
  addVectorToPosition(id: string, x: number, y: number, z: number, resetVelocity?: boolean): void
  /** Set entity mesh color (RGB 0–1). */
  setColor(id: string, r: number, g: number, b: number): void
  /** Get entity mesh color (RGB 0–1). Returns null if no material color. */
  getColor(id: string): [number, number, number] | null
  applyForce(id: string, x: number, y: number, z: number): void
  applyImpulse(id: string, x: number, y: number, z: number): void
  /** Entity ids in narrow-phase contact with this entity (last physics step); empty if no collider or world. */
  getTouchingEntityIds(id: string): string[]
  // Transformer control
  setTransformerEnabled(entityId: string, transformerType: string, enabled: boolean): void
  setTransformerParam(entityId: string, transformerType: string, paramName: string, value: unknown): void
  log(...args: unknown[]): void
  /** Show a transient UI message in play; default duration 10s. */
  snackbar(message: string, durationSeconds?: number): void
  /** Play HUD: set score (green). Non-finite or negative values are ignored. Display uses non-negative integers. */
  setScore(value: number): void
  /** Play HUD: set damage (red). Non-finite or negative values are ignored. Display uses non-negative integers. */
  setDamage(value: number): void
}

/** Partial update for the play-mode HUD overlay. */
export type HudPatch = { score?: number; damage?: number }

function normalizeHudDisplay(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

const DEFAULT_SNACKBAR_SECONDS = 10

function normalizeSnackbarSeconds(durationSeconds?: number): number {
  if (durationSeconds === undefined) return DEFAULT_SNACKBAR_SECONDS
  const n = Number(durationSeconds)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SNACKBAR_SECONDS
  return n
}

export interface GameAPIOptions {
  getPosition: (id: string) => [number, number, number] | null
  setPosition: (id: string, x: number, y: number, z: number) => void
  getRotation: (id: string) => [number, number, number] | null
  setRotation: (id: string, x: number, y: number, z: number) => void
  getUpVector: (id: string) => [number, number, number] | null
  getForwardVector: (id: string) => [number, number, number] | null
  getPhysicsWorld: () => PhysicsWorld | null
  getRenderItemRegistry: () => import('@/runtime/renderItemRegistry').RenderItemRegistry | null
  entities: Entity[]
  timeRef: { current: number }
}

export function createGameAPI(
  getPosition: (id: string) => [number, number, number] | null,
  setPosition: (id: string, x: number, y: number, z: number) => void,
  getRotation: (id: string) => [number, number, number] | null = () => null,
  setRotation: (id: string, x: number, y: number, z: number) => void = () => {},
  getUpVector: (id: string) => [number, number, number] | null = () => null,
  getForwardVector: (id: string) => [number, number, number] | null = () => null,
  getPhysicsWorld: () => PhysicsWorld | null = () => null,
  getRenderItemRegistry: () => import('@/runtime/renderItemRegistry').RenderItemRegistry | null = () => null,
  entities: Entity[] = [],
  timeRef: { current: number } = { current: 0 },
  onSnackbar?: (message: string, durationSeconds: number) => void,
  onHudPatch?: (patch: HudPatch) => void
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
    getRotation(id: string): [number, number, number] | null {
      return getRotation(id)
    },
    setRotation(id: string, x: number, y: number, z: number) {
      setRotation(id, x, y, z)
    },
    getUpVector(id: string): [number, number, number] | null {
      return getUpVector(id)
    },
    getForwardVector(id: string): [number, number, number] | null {
      return getForwardVector(id)
    },
    resetRotation(id: string) {
      const registry = getRenderItemRegistry()
      if (registry) registry.resetRotation(id)
    },
    addVectorToPosition(id: string, x: number, y: number, z: number, resetVelocity?: boolean) {
      const registry = getRenderItemRegistry()
      if (registry) registry.addVectorToPosition(id, x, y, z, resetVelocity)
    },
    setColor(id: string, r: number, g: number, b: number) {
      const registry = getRenderItemRegistry()
      if (registry) registry.setColor(id, r, g, b)
    },
    getColor(id: string): [number, number, number] | null {
      const registry = getRenderItemRegistry()
      return registry ? registry.getColor(id) : null
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
    getTouchingEntityIds(id: string): string[] {
      const physics = getPhysicsWorld()
      return physics ? physics.getTouchingEntityIds(id) : []
    },
    setTransformerEnabled(entityId: string, transformerType: string, enabled: boolean) {
      const registry = getRenderItemRegistry()
      if (!registry) return
      const item = registry.get(entityId)
      if (!item || !item.transformerChain) return
      const transformers = item.transformerChain.getAll()
      for (const transformer of transformers) {
        if (transformer.type === transformerType) {
          transformer.enabled = enabled
        }
      }
    },
    setTransformerParam(entityId: string, transformerType: string, paramName: string, value: unknown) {
      const registry = getRenderItemRegistry()
      if (!registry) return
      const item = registry.get(entityId)
      if (!item || !item.transformerChain) return
      const transformers = item.transformerChain.getAll()
      for (const transformer of transformers) {
        if (transformer.type === transformerType && typeof transformer.setParams === 'function') {
          transformer.setParams({ [paramName]: value })
        }
      }
    },
    log(...args: unknown[]) {
      console.log('[game]', ...args)
    },
    snackbar(message: string, durationSeconds?: number) {
      const sec = normalizeSnackbarSeconds(durationSeconds)
      onSnackbar?.(String(message), sec)
    },
    setScore(value: number) {
      const v = normalizeHudDisplay(value)
      if (v === null) return
      onHudPatch?.({ score: v })
    },
    setDamage(value: number) {
      const v = normalizeHudDisplay(value)
      if (v === null) return
      onHudPatch?.({ damage: v })
    },
  }
}
