/**
 * Script context types and pre-allocation factories.
 * Ctx objects are built once at ScriptRunner construction; only dt/other are mutated at runtime.
 */
import type { Entity } from '@/types/world'
import type { GameAPI } from './gameApi'

/** Script-facing entity: serialized Entity plus runtime pose getters (current entity only). */
export interface ScriptEntity extends Entity {
  getPosition(): [number, number, number] | null
  getRotation(): [number, number, number] | null
}

/** Orientation detection helpers. All use threshold 0.5 (and 0.9 for isTilted). Optional id defaults to current entity. */
export interface DetectHelpers {
  isUpsideDown(id?: string): boolean
  isUpright(id?: string): boolean
  isLyingOnSide(id?: string): boolean
  isLyingOnBack(id?: string): boolean
  isLyingOnFront(id?: string): boolean
  isTilted(id?: string): boolean
}

/** Base context: game capabilities + current entity. time is a getter. */
export interface ScriptCtxBase {
  readonly time: number
  readonly entity: ScriptEntity
  readonly entities: Entity[]
  readonly detect: DetectHelpers
  getEntity(id: string): Entity | undefined
  getPosition(id?: string): [number, number, number] | null
  setPosition(id: string | undefined, x: number, y: number, z: number): void
  getRotation(id?: string): [number, number, number] | null
  setRotation(id: string | undefined, x: number, y: number, z: number): void
  /** World-space up direction [x,y,z] (Y-up). Upside down when .y < -0.5. */
  getUpVector(id?: string): [number, number, number] | null
  applyForce(id: string, x: number, y: number, z: number): void
  applyImpulse(id: string, x: number, y: number, z: number): void
  setTransformerEnabled(entityId: string, transformerType: string, enabled: boolean): void
  setTransformerParam(entityId: string, transformerType: string, paramName: string, value: unknown): void
  log(...args: unknown[]): void
}

export interface OnSpawnCtx extends ScriptCtxBase {
  readonly event: 'onSpawn'
}

export interface OnUpdateCtx extends ScriptCtxBase {
  readonly event: 'onUpdate'
  dt: number
}

export interface OnCollisionCtx extends ScriptCtxBase {
  readonly event: 'onCollision'
  other: Entity
}

export interface OnTimerCtx extends ScriptCtxBase {
  readonly event: 'onTimer'
  readonly interval: number
}

export type ScriptCtx = OnSpawnCtx | OnUpdateCtx | OnCollisionCtx | OnTimerCtx

const DETECT_THRESHOLD = 0.5
const DETECT_TILTED_THRESHOLD = 0.9

function createDetect(game: GameAPI, entity: Entity): DetectHelpers {
  return {
    isUpsideDown(id?: string) {
      const up = game.getUpVector(id ?? entity.id)
      return up !== null && up[1] < -DETECT_THRESHOLD
    },
    isUpright(id?: string) {
      const up = game.getUpVector(id ?? entity.id)
      return up !== null && up[1] > DETECT_THRESHOLD
    },
    isLyingOnSide(id?: string) {
      const up = game.getUpVector(id ?? entity.id)
      return up !== null && Math.abs(up[1]) < DETECT_THRESHOLD
    },
    isLyingOnBack(id?: string) {
      const fwd = game.getForwardVector(id ?? entity.id)
      if (fwd === null) return false
      const backY = -fwd[1]
      return backY < -DETECT_THRESHOLD
    },
    isLyingOnFront(id?: string) {
      const fwd = game.getForwardVector(id ?? entity.id)
      return fwd !== null && fwd[1] < -DETECT_THRESHOLD
    },
    isTilted(id?: string) {
      const up = game.getUpVector(id ?? entity.id)
      return up !== null && up[1] < DETECT_TILTED_THRESHOLD
    },
  }
}

function baseCtx(game: GameAPI, entity: Entity): ScriptCtxBase {
  const scriptEntity: ScriptEntity = {
    ...entity,
    getPosition() {
      return game.getPosition(entity.id)
    },
    getRotation() {
      return game.getRotation(entity.id)
    },
  }
  const detect = createDetect(game, entity)
  return {
    get time() {
      return game.time
    },
    get entity() {
      return scriptEntity
    },
    get entities() {
      return game.entities
    },
    get detect() {
      return detect
    },
    getEntity: (id) => game.getEntity(id),
    getPosition: (id) => game.getPosition(id ?? entity.id),
    setPosition: (id, x, y, z) => game.setPosition(id ?? entity.id, x, y, z),
    getRotation: (id) => game.getRotation(id ?? entity.id),
    setRotation: (id, x, y, z) => game.setRotation(id ?? entity.id, x, y, z),
    getUpVector: (id) => game.getUpVector(id ?? entity.id),
    applyForce: (id, x, y, z) => game.applyForce(id, x, y, z),
    applyImpulse: (id, x, y, z) => game.applyImpulse(id, x, y, z),
    setTransformerEnabled: (a, b, c) => game.setTransformerEnabled(a, b, c),
    setTransformerParam: (a, b, c, d) => game.setTransformerParam(a, b, c, d),
    log: (...args) => game.log(...args),
  }
}

export function allocOnSpawnCtx(game: GameAPI, entity: Entity): OnSpawnCtx {
  return { ...baseCtx(game, entity), event: 'onSpawn' }
}

export function allocOnUpdateCtx(game: GameAPI, entity: Entity): OnUpdateCtx {
  return { ...baseCtx(game, entity), event: 'onUpdate', dt: 0 }
}

export function allocOnCollisionCtx(game: GameAPI, entity: Entity): OnCollisionCtx {
  return { ...baseCtx(game, entity), event: 'onCollision', other: entity }
}

export function allocOnTimerCtx(game: GameAPI, entity: Entity, interval: number): OnTimerCtx {
  return { ...baseCtx(game, entity), event: 'onTimer', interval }
}
