import { describe, it, expect, vi } from 'vitest'
import type { Entity } from '@/types/world'
import type { GameAPI } from './gameApi'
import {
  ENTITY_VIEW_METHODS,
  ZERO_IMPACT,
  OTHER_REF_SYMBOL,
  allocOnSpawnCtx,
  allocOnUpdateCtx,
  allocOnTimerCtx,
  allocOnCollisionCtx,
} from './scriptCtx'

function makeEntity(id = 'e1', name = 'Test'): Entity {
  return {
    id,
    name,
    bodyType: 'dynamic',
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [1, 2, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }
}

function makeGameAPI(overrides: Partial<GameAPI> = {}): GameAPI {
  return {
    get time() {
      return 0
    },
    entities: [],
    getEntity: vi.fn().mockReturnValue(undefined),
    getPosition: vi.fn().mockReturnValue(null),
    setPosition: vi.fn(),
    getRotation: vi.fn().mockReturnValue(null),
    setRotation: vi.fn(),
    getUpVector: vi.fn().mockReturnValue(null),
    getForwardVector: vi.fn().mockReturnValue(null),
    resetRotation: vi.fn(),
    addVectorToPosition: vi.fn(),
    setColor: vi.fn(),
    getColor: vi.fn().mockReturnValue(null),
    applyForce: vi.fn(),
    applyImpulse: vi.fn(),
    getTouchingEntityIds: vi.fn().mockReturnValue([]),
    setTransformerEnabled: vi.fn(),
    setTransformerParam: vi.fn(),
    log: vi.fn(),
    snackbar: vi.fn(),
    setScore: vi.fn(),
    getScore: vi.fn().mockReturnValue(0),
    setDamage: vi.fn(),
    getDamage: vi.fn().mockReturnValue(0),
    getCurrentAvatar: vi.fn().mockReturnValue(null),
    setCurrentAvatar: vi.fn().mockReturnValue(false),
    cycleAvatar: vi.fn(),
    ...overrides,
  }
}

describe('ENTITY_VIEW_METHODS', () => {
  it('declares only argsAfterId of 0 or 3', () => {
    for (const m of ENTITY_VIEW_METHODS) {
      expect([0, 3]).toContain(m.argsAfterId)
    }
  })

  it('contains expected core methods', () => {
    const names = ENTITY_VIEW_METHODS.map((m) => m.name)
    for (const expected of [
      'getPosition',
      'getRotation',
      'getUpVector',
      'getForwardVector',
      'setPosition',
      'setRotation',
      'resetRotation',
      'addVectorToPosition',
      'setColor',
      'getColor',
      'applyForce',
      'applyImpulse',
    ] as const) {
      expect(names).toContain(expected)
    }
  })

  it('has unique entries', () => {
    const names = ENTITY_VIEW_METHODS.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('ZERO_IMPACT', () => {
  it('has zeroed force fields', () => {
    expect(ZERO_IMPACT.totalForce).toEqual([0, 0, 0])
    expect(ZERO_IMPACT.totalForceMagnitude).toBe(0)
    expect(ZERO_IMPACT.maxForceMagnitude).toBe(0)
    expect(ZERO_IMPACT.maxForceDirection).toEqual([0, 0, 0])
  })
})

describe('OTHER_REF_SYMBOL', () => {
  it('is a Symbol', () => {
    expect(typeof OTHER_REF_SYMBOL).toBe('symbol')
  })
})

describe('allocOnSpawnCtx', () => {
  it('builds onSpawn ctx with event tag and entity view bound to id', () => {
    const game = makeGameAPI()
    const entity = makeEntity('player')
    const ctx = allocOnSpawnCtx(game, entity)

    expect(ctx.event).toBe('onSpawn')
    expect(ctx.entity.id).toBe('player')
    expect(ctx.entities).toBe(game.entities)
  })

  it('entity.getPosition delegates to game.getPosition with entity id', () => {
    const game = makeGameAPI({
      getPosition: vi.fn().mockReturnValue([1, 2, 3]),
    })
    const ctx = allocOnSpawnCtx(game, makeEntity('foo'))
    const result = ctx.entity.getPosition()
    expect(game.getPosition).toHaveBeenCalledWith('foo')
    expect(result).toEqual([1, 2, 3])
  })

  it('entity.setPosition forwards x/y/z and id', () => {
    const game = makeGameAPI()
    const ctx = allocOnSpawnCtx(game, makeEntity('foo'))
    ctx.entity.setPosition(5, 6, 7)
    expect(game.setPosition).toHaveBeenCalledWith('foo', 5, 6, 7)
  })

  it('entity.addVectorToPosition forwards resetVelocity flag', () => {
    const game = makeGameAPI()
    const ctx = allocOnSpawnCtx(game, makeEntity('foo'))
    ctx.entity.addVectorToPosition(1, 0, 0, true)
    expect(game.addVectorToPosition).toHaveBeenCalledWith('foo', 1, 0, 0, true)
  })

  it('captures game.time at allocation (spread snapshots the getter)', () => {
    let now = 5
    const game: GameAPI = {
      ...makeGameAPI(),
      get time() {
        return now
      },
    }
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.time).toBe(5)
    now = 99
    expect(ctx.time).toBe(5)
  })
})

describe('allocOnUpdateCtx', () => {
  it('builds onUpdate ctx with dt initialised to 0', () => {
    const ctx = allocOnUpdateCtx(makeGameAPI(), makeEntity())
    expect(ctx.event).toBe('onUpdate')
    expect(ctx.dt).toBe(0)
  })

  it('dt is mutable on the hot path', () => {
    const ctx = allocOnUpdateCtx(makeGameAPI(), makeEntity())
    ctx.dt = 0.016
    expect(ctx.dt).toBeCloseTo(0.016)
  })
})

describe('allocOnTimerCtx', () => {
  it('exposes the configured interval', () => {
    const ctx = allocOnTimerCtx(makeGameAPI(), makeEntity(), 0.5)
    expect(ctx.event).toBe('onTimer')
    expect(ctx.interval).toBe(0.5)
  })
})

describe('allocOnCollisionCtx', () => {
  it('builds onCollision ctx with other view, zeroed impact, and OTHER_REF_SYMBOL', () => {
    const ctx = allocOnCollisionCtx(makeGameAPI(), makeEntity('self'))
    expect(ctx.event).toBe('onCollision')
    expect(ctx.impact).toEqual(ZERO_IMPACT)
    expect(ctx.impact).not.toBe(ZERO_IMPACT)
    expect(ctx[OTHER_REF_SYMBOL]).toBeDefined()
    expect(ctx[OTHER_REF_SYMBOL].current.id).toBe('self')
  })

  it('other view follows OTHER_REF_SYMBOL.current updates without re-allocation', () => {
    const game = makeGameAPI({
      getPosition: vi.fn((id: string) => (id === 'a' ? [1, 1, 1] : [9, 9, 9])),
    })
    const ctx = allocOnCollisionCtx(game, makeEntity('self'))
    const a = makeEntity('a')
    const b = makeEntity('b')

    ctx[OTHER_REF_SYMBOL].current = a
    expect(ctx.other.id).toBe('a')
    expect(ctx.other.getPosition()).toEqual([1, 1, 1])

    ctx[OTHER_REF_SYMBOL].current = b
    expect(ctx.other.id).toBe('b')
    expect(ctx.other.getPosition()).toEqual([9, 9, 9])
  })
})

describe('detect helpers (threshold semantics)', () => {
  it('isUpsideDown true when up.y < -0.5', () => {
    const game = makeGameAPI({ getUpVector: vi.fn().mockReturnValue([0, -0.6, 0]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isUpsideDown()).toBe(true)
  })

  it('isUpsideDown false at exactly -0.5 (strict <)', () => {
    const game = makeGameAPI({ getUpVector: vi.fn().mockReturnValue([0, -0.5, 0]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isUpsideDown()).toBe(false)
  })

  it('isUpright true when up.y > 0.5', () => {
    const game = makeGameAPI({ getUpVector: vi.fn().mockReturnValue([0, 1, 0]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isUpright()).toBe(true)
  })

  it('isLyingOnSide true when |up.y| < 0.5', () => {
    const game = makeGameAPI({ getUpVector: vi.fn().mockReturnValue([0.7, 0.3, 0.6]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isLyingOnSide()).toBe(true)
  })

  it('isLyingOnFront true when forward.y < -0.5', () => {
    const game = makeGameAPI({ getForwardVector: vi.fn().mockReturnValue([0, -0.8, 0]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isLyingOnFront()).toBe(true)
  })

  it('isLyingOnBack true when -forward.y < -0.5 (forward.y > 0.5)', () => {
    const game = makeGameAPI({ getForwardVector: vi.fn().mockReturnValue([0, 0.8, 0]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isLyingOnBack()).toBe(true)
  })

  it('isTilted true when up.y < 0.9', () => {
    const game = makeGameAPI({ getUpVector: vi.fn().mockReturnValue([0, 0.8, 0.6]) })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isTilted()).toBe(true)
  })

  it('detect returns false when game returns null vectors', () => {
    const game = makeGameAPI()
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.detect.isUpsideDown()).toBe(false)
    expect(ctx.detect.isUpright()).toBe(false)
    expect(ctx.detect.isLyingOnSide()).toBe(false)
    expect(ctx.detect.isLyingOnFront()).toBe(false)
    expect(ctx.detect.isLyingOnBack()).toBe(false)
  })

  it('passes through explicit id (does not fall back to entity.id)', () => {
    const upMock = vi.fn().mockReturnValue([0, 1, 0])
    const game = makeGameAPI({ getUpVector: upMock })
    const ctx = allocOnSpawnCtx(game, makeEntity('self'))
    ctx.detect.isUpright('other')
    expect(upMock).toHaveBeenCalledWith('other')
  })
})

describe('touching view', () => {
  it('list maps ids to entities and filters undefined', () => {
    const a = makeEntity('a')
    const b = makeEntity('b')
    const game = makeGameAPI({
      getTouchingEntityIds: vi.fn().mockReturnValue(['a', 'b', 'missing']),
      getEntity: vi.fn((id: string) => (id === 'a' ? a : id === 'b' ? b : undefined)),
    })
    const ctx = allocOnSpawnCtx(game, makeEntity('self'))
    expect(ctx.entity.touching.list).toEqual([a, b])
  })

  it('empty true when no contacts, false when any', () => {
    const game = makeGameAPI({
      getTouchingEntityIds: vi.fn().mockReturnValue([]),
    })
    const ctx = allocOnSpawnCtx(game, makeEntity())
    expect(ctx.entity.touching.empty).toBe(true)

    const game2 = makeGameAPI({
      getTouchingEntityIds: vi.fn().mockReturnValue(['x']),
    })
    const ctx2 = allocOnSpawnCtx(game2, makeEntity())
    expect(ctx2.entity.touching.empty).toBe(false)
  })
})

describe('ctx pass-through delegations', () => {
  it('forwards id ?? entity.id for getPosition', () => {
    const game = makeGameAPI({ getPosition: vi.fn().mockReturnValue([0, 0, 0]) })
    const ctx = allocOnSpawnCtx(game, makeEntity('self'))
    ctx.getPosition()
    expect(game.getPosition).toHaveBeenLastCalledWith('self')
    ctx.getPosition('other')
    expect(game.getPosition).toHaveBeenLastCalledWith('other')
  })

  it('forwards setPosition with explicit and implicit id', () => {
    const game = makeGameAPI()
    const ctx = allocOnSpawnCtx(game, makeEntity('self'))
    ctx.setPosition(undefined, 1, 2, 3)
    expect(game.setPosition).toHaveBeenLastCalledWith('self', 1, 2, 3)
    ctx.setPosition('other', 4, 5, 6)
    expect(game.setPosition).toHaveBeenLastCalledWith('other', 4, 5, 6)
  })

  it('forwards addVectorToPosition resetVelocity flag', () => {
    const game = makeGameAPI()
    const ctx = allocOnSpawnCtx(game, makeEntity('self'))
    ctx.addVectorToPosition(undefined, 1, 0, 0, true)
    expect(game.addVectorToPosition).toHaveBeenCalledWith('self', 1, 0, 0, true)
  })

  it('forwards transformer + HUD + avatar helpers', () => {
    const game = makeGameAPI()
    const ctx = allocOnSpawnCtx(game, makeEntity('self'))
    ctx.setTransformerEnabled('e', 'car2', false)
    expect(game.setTransformerEnabled).toHaveBeenCalledWith('e', 'car2', false)
    ctx.setTransformerParam('e', 'car2', 'power', 100)
    expect(game.setTransformerParam).toHaveBeenCalledWith('e', 'car2', 'power', 100)
    ctx.snackbar('hi', 2)
    expect(game.snackbar).toHaveBeenCalledWith('hi', 2)
    ctx.setScore(5)
    expect(game.setScore).toHaveBeenCalledWith(5)
    ctx.setDamage(7)
    expect(game.setDamage).toHaveBeenCalledWith(7)
    ctx.cycleAvatar(1)
    expect(game.cycleAvatar).toHaveBeenCalledWith(1)
  })
})
