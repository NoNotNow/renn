/**
 * Script context types and pre-allocation factories.
 * Ctx objects are built once at ScriptRunner construction; only dt/other are mutated at runtime.
 * Entity-scoped methods are driven by ENTITY_VIEW_METHODS (single source of truth).
 */
import type { Entity } from '@/types/world'
import type { GameAPI } from './gameApi'

/** Descriptor for one entity-scoped method. Drives runtime view, baseCtx delegation, and scriptCtxDecl. */
export interface EntityViewMethodDescriptor {
  name: keyof GameAPI
  /** Number of arguments after id (0 or 3 for x,y,z). */
  argsAfterId: 0 | 3
  /** Signature on Entity (no id param). */
  entityDecl: string
  /** Signature on ScriptCtxBase (id optional). */
  ctxDecl: string
}

/** Single source of truth for entity/other methods. Add new methods here only. */
export const ENTITY_VIEW_METHODS: EntityViewMethodDescriptor[] = [
  { name: 'getPosition', argsAfterId: 0, entityDecl: 'getPosition(): [number, number, number] | null', ctxDecl: 'getPosition(id?: string): [number, number, number] | null' },
  { name: 'getRotation', argsAfterId: 0, entityDecl: 'getRotation(): [number, number, number] | null', ctxDecl: 'getRotation(id?: string): [number, number, number] | null' },
  { name: 'getUpVector', argsAfterId: 0, entityDecl: 'getUpVector(): [number, number, number] | null', ctxDecl: 'getUpVector(id?: string): [number, number, number] | null' },
  { name: 'getForwardVector', argsAfterId: 0, entityDecl: 'getForwardVector(): [number, number, number] | null', ctxDecl: 'getForwardVector(id?: string): [number, number, number] | null' },
  { name: 'setPosition', argsAfterId: 3, entityDecl: 'setPosition(x: number, y: number, z: number): void', ctxDecl: 'setPosition(id: string | undefined, x: number, y: number, z: number): void' },
  { name: 'setRotation', argsAfterId: 3, entityDecl: 'setRotation(x: number, y: number, z: number): void', ctxDecl: 'setRotation(id: string | undefined, x: number, y: number, z: number): void' },
  { name: 'resetRotation', argsAfterId: 0, entityDecl: 'resetRotation(): void', ctxDecl: 'resetRotation(id?: string): void' },
  { name: 'addVectorToPosition', argsAfterId: 3, entityDecl: 'addVectorToPosition(x: number, y: number, z: number, resetVelocity?: boolean): void', ctxDecl: 'addVectorToPosition(id: string | undefined, x: number, y: number, z: number, resetVelocity?: boolean): void' },
  { name: 'setColor', argsAfterId: 3, entityDecl: 'setColor(r: number, g: number, b: number): void', ctxDecl: 'setColor(id: string | undefined, r: number, g: number, b: number): void' },
  { name: 'getColor', argsAfterId: 0, entityDecl: 'getColor(): [number, number, number] | null', ctxDecl: 'getColor(id?: string): [number, number, number] | null' },
  { name: 'applyForce', argsAfterId: 3, entityDecl: 'applyForce(x: number, y: number, z: number): void', ctxDecl: 'applyForce(id: string, x: number, y: number, z: number): void' },
  { name: 'applyImpulse', argsAfterId: 3, entityDecl: 'applyImpulse(x: number, y: number, z: number): void', ctxDecl: 'applyImpulse(id: string, x: number, y: number, z: number): void' },
]

/** Narrow-phase contact neighbors for the bound entity (script-facing). */
export interface ScriptEntityTouching {
  /** World entities currently touching this one (distinct others). */
  get list(): Entity[]
  /** True when not touching any other entity. */
  get empty(): boolean
}

/** Bound detect helpers (no id param; id comes from getId()). */
export interface BoundDetectHelpers {
  isUpsideDown(): boolean
  isUpright(): boolean
  isLyingOnSide(): boolean
  isLyingOnBack(): boolean
  isLyingOnFront(): boolean
  isTilted(): boolean
}

/** Script-facing entity: Entity data plus runtime pose/detect methods (current entity only). */
export interface ScriptEntity extends Entity {
  getPosition(): [number, number, number] | null
  getRotation(): [number, number, number] | null
  getUpVector(): [number, number, number] | null
  getForwardVector(): [number, number, number] | null
  setPosition(x: number, y: number, z: number): void
  setRotation(x: number, y: number, z: number): void
  resetRotation(): void
  addVectorToPosition(x: number, y: number, z: number, resetVelocity?: boolean): void
  setColor(r: number, g: number, b: number): void
  getColor(): [number, number, number] | null
  applyForce(x: number, y: number, z: number): void
  applyImpulse(x: number, y: number, z: number): void
  readonly detect: BoundDetectHelpers
  readonly touching: ScriptEntityTouching
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
  getUpVector(id?: string): [number, number, number] | null
  getForwardVector(id?: string): [number, number, number] | null
  resetRotation(id?: string): void
  addVectorToPosition(id: string | undefined, x: number, y: number, z: number, resetVelocity?: boolean): void
  setColor(id?: string, r: number, g: number, b: number): void
  getColor(id?: string): [number, number, number] | null
  applyForce(id: string, x: number, y: number, z: number): void
  applyImpulse(id: string, x: number, y: number, z: number): void
  setTransformerEnabled(entityId: string, transformerType: string, enabled: boolean): void
  setTransformerParam(entityId: string, transformerType: string, paramName: string, value: unknown): void
  log(...args: unknown[]): void
  snackbar(message: string, durationSeconds?: number): void
  setScore(value: number): void
  setDamage(value: number): void
}

export interface OnSpawnCtx extends ScriptCtxBase {
  readonly event: 'onSpawn'
}

export interface OnUpdateCtx extends ScriptCtxBase {
  readonly event: 'onUpdate'
  dt: number
}

/** Impact data for onCollision: forces from Rapier contact force events. */
export interface CollisionImpact {
  /** Sum of all contact forces between the two colliders [x, y, z]. */
  totalForce: [number, number, number]
  /** Sum of magnitudes of each force (not magnitude of totalForce). */
  totalForceMagnitude: number
  /** Magnitude of the largest force at any contact point. */
  maxForceMagnitude: number
  /** World-space unit direction of the strongest force [x, y, z]. */
  maxForceDirection: [number, number, number]
}

/** Symbol used by ScriptRunner to set ctx.other's entity ref (no allocation on hot path). */
export const OTHER_REF_SYMBOL = Symbol('scriptCtxOtherRef')

export interface OnCollisionCtx extends ScriptCtxBase {
  readonly event: 'onCollision'
  other: ScriptEntity
  /** Impact forces for this collision; zeroed when no contact force event. */
  impact: CollisionImpact
}

export interface OnTimerCtx extends ScriptCtxBase {
  readonly event: 'onTimer'
  readonly interval: number
}

export type ScriptCtx = OnSpawnCtx | OnUpdateCtx | OnCollisionCtx | OnTimerCtx

/** Default impact when no contact force event; avoids scripts seeing undefined. */
export const ZERO_IMPACT: CollisionImpact = {
  totalForce: [0, 0, 0],
  totalForceMagnitude: 0,
  maxForceMagnitude: 0,
  maxForceDirection: [0, 0, 0],
}

const DETECT_THRESHOLD = 0.5
const DETECT_TILTED_THRESHOLD = 0.9

/** Single implementation for detect helpers; getId() supplies entity id. */
function createDetectForId(game: GameAPI, getId: () => string): DetectHelpers & BoundDetectHelpers {
  return {
    isUpsideDown(id?: string) {
      const up = game.getUpVector(id ?? getId())
      return up !== null && up[1] < -DETECT_THRESHOLD
    },
    isUpright(id?: string) {
      const up = game.getUpVector(id ?? getId())
      return up !== null && up[1] > DETECT_THRESHOLD
    },
    isLyingOnSide(id?: string) {
      const up = game.getUpVector(id ?? getId())
      return up !== null && Math.abs(up[1]) < DETECT_THRESHOLD
    },
    isLyingOnBack(id?: string) {
      const fwd = game.getForwardVector(id ?? getId())
      if (fwd === null) return false
      const backY = -fwd[1]
      return backY < -DETECT_THRESHOLD
    },
    isLyingOnFront(id?: string) {
      const fwd = game.getForwardVector(id ?? getId())
      return fwd !== null && fwd[1] < -DETECT_THRESHOLD
    },
    isTilted(id?: string) {
      const up = game.getUpVector(id ?? getId())
      return up !== null && up[1] < DETECT_TILTED_THRESHOLD
    },
  }
}

/** Build entity view from method list; getEntityRef() supplies current entity (no allocation). */
function buildEntityView(game: GameAPI, getEntityRef: () => Entity | null): ScriptEntity {
  const detect = createDetectForId(game, () => getEntityRef()?.id ?? '') as BoundDetectHelpers
  const view = {
    get id() {
      return getEntityRef()?.id ?? ''
    },
    get name() {
      return getEntityRef()?.name
    },
    get position() {
      return getEntityRef()?.position
    },
    get rotation() {
      return getEntityRef()?.rotation
    },
    get scale() {
      return getEntityRef()?.scale
    },
    get bodyType() {
      return getEntityRef()?.bodyType
    },
    detect,
    touching: {
      get list(): Entity[] {
        const e = getEntityRef()
        if (!e) return []
        return game
          .getTouchingEntityIds(e.id)
          .map((id) => game.getEntity(id))
          .filter((x): x is Entity => x !== undefined)
      },
      get empty(): boolean {
        const e = getEntityRef()
        if (!e) return true
        return game.getTouchingEntityIds(e.id).length === 0
      },
    },
  } as ScriptEntity
  for (const desc of ENTITY_VIEW_METHODS) {
    const key = desc.name
    if (desc.argsAfterId === 0) {
      (view as Record<string, unknown>)[key] = function () {
        const e = getEntityRef()
        if (!e) return null
        return (game[key] as (id: string) => unknown)(e.id)
      }
    } else if (key === 'addVectorToPosition') {
      (view as Record<string, unknown>)[key] = function (x: number, y: number, z: number, resetVelocity?: boolean) {
        const e = getEntityRef()
        if (e) (game.addVectorToPosition)(e.id, x, y, z, resetVelocity)
      }
    } else {
      (view as Record<string, unknown>)[key] = function (x: number, y: number, z: number) {
        const e = getEntityRef()
        if (e) (game[key] as (id: string, x: number, y: number, z: number) => void)(e.id, x, y, z)
      }
    }
  }
  return view
}

/** Build ctx delegations from method list (id ?? entity.id). */
function buildBaseCtxDelegations(game: GameAPI, entity: Entity): Record<string, unknown> {
  const delegations: Record<string, unknown> = {}
  for (const desc of ENTITY_VIEW_METHODS) {
    const key = desc.name
    if (desc.argsAfterId === 0) {
      delegations[key] = (id?: string) => (game[key] as (id: string) => unknown)(id ?? entity.id)
    } else if (key === 'addVectorToPosition') {
      delegations[key] = (id?: string, x?: number, y?: number, z?: number, resetVelocity?: boolean) =>
        game.addVectorToPosition(id ?? entity.id, x ?? 0, y ?? 0, z ?? 0, resetVelocity)
    } else {
      delegations[key] = (id?: string, x?: number, y?: number, z?: number) =>
        (game[key] as (id: string, x: number, y: number, z: number) => void)(id ?? entity.id, x ?? 0, y ?? 0, z ?? 0)
    }
  }
  return delegations
}

function baseCtx(game: GameAPI, entity: Entity): ScriptCtxBase {
  const scriptEntity = buildEntityView(game, () => entity)
  const detect = createDetectForId(game, () => entity.id)
  const delegations = buildBaseCtxDelegations(game, entity)
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
    ...delegations,
    setTransformerEnabled: (a, b, c) => game.setTransformerEnabled(a, b, c),
    setTransformerParam: (a, b, c, d) => game.setTransformerParam(a, b, c, d),
    log: (...args) => game.log(...args),
    snackbar: (message, durationSeconds) => game.snackbar(message, durationSeconds),
    setScore: (value) => game.setScore(value),
    setDamage: (value) => game.setDamage(value),
  } as ScriptCtxBase
}

export function allocOnSpawnCtx(game: GameAPI, entity: Entity): OnSpawnCtx {
  return { ...baseCtx(game, entity), event: 'onSpawn' }
}

export function allocOnUpdateCtx(game: GameAPI, entity: Entity): OnUpdateCtx {
  return { ...baseCtx(game, entity), event: 'onUpdate', dt: 0 }
}

export function allocOnCollisionCtx(game: GameAPI, entity: Entity): OnCollisionCtx & { [OTHER_REF_SYMBOL]: { current: Entity } } {
  const otherRef = { current: entity }
  const otherView = buildEntityView(game, () => otherRef.current)
  return {
    ...baseCtx(game, entity),
    event: 'onCollision',
    other: otherView,
    impact: { ...ZERO_IMPACT },
    [OTHER_REF_SYMBOL]: otherRef,
  } as OnCollisionCtx & { [OTHER_REF_SYMBOL]: { current: Entity } }
}

export function allocOnTimerCtx(game: GameAPI, entity: Entity, interval: number): OnTimerCtx {
  return { ...baseCtx(game, entity), event: 'onTimer', interval }
}
