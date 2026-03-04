/**
 * Script context types and pre-allocation factories.
 * Ctx objects are built once at ScriptRunner construction; only dt/other are mutated at runtime.
 */
import type { Entity } from '@/types/world'
import type { GameAPI } from './gameApi'

/** Base context: game capabilities + current entity. time is a getter. */
export interface ScriptCtxBase {
  readonly time: number
  readonly entity: Entity
  readonly entities: Entity[]
  getEntity(id: string): Entity | undefined
  getPosition(id: string): [number, number, number] | null
  setPosition(id: string, x: number, y: number, z: number): void
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

function baseCtx(game: GameAPI, entity: Entity): ScriptCtxBase {
  return {
    get time() {
      return game.time
    },
    get entity() {
      return entity
    },
    get entities() {
      return game.entities
    },
    getEntity: (id) => game.getEntity(id),
    getPosition: (id) => game.getPosition(id),
    setPosition: (id, x, y, z) => game.setPosition(id, x, y, z),
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
