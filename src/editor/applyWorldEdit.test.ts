import { describe, it, expect, vi } from 'vitest'
import { applyWorldEdit, type ApplyWorldEditDeps } from './applyWorldEdit'
import type { RennWorld } from '@/types/world'

function minimalWorld(overrides?: Partial<RennWorld>): RennWorld {
  return {
    version: '1.0',
    world: {
      ambientLight: [0.3, 0.3, 0.35],
      directionalLight: { direction: [1, 2, 1], color: [1, 0.98, 0.9], intensity: 1.2 },
    },
    entities: [
      {
        id: 'e1',
        name: 'Entity 1',
        bodyType: 'static',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        locked: false,
      },
    ],
    ...overrides,
  }
}

type CallName =
  | 'pushBeforeEdit'
  | 'updateWorld'
  | 'captureScenePosesForNextRebuild'
  | 'bumpVersion'
  | 'syncWorldEntities'

function createOrderTrackingDeps(initialWorld: RennWorld): {
  deps: ApplyWorldEditDeps
  calls: CallName[]
  getWorld: () => RennWorld
} {
  let world = initialWorld
  const calls: CallName[] = []

  const deps: ApplyWorldEditDeps = {
    pushBeforeEdit: vi.fn(() => {
      calls.push('pushBeforeEdit')
    }),
    updateWorld: vi.fn((updater) => {
      calls.push('updateWorld')
      world = updater(world)
    }),
    captureScenePosesForNextRebuild: vi.fn(() => {
      calls.push('captureScenePosesForNextRebuild')
    }),
    bumpVersion: vi.fn(() => {
      calls.push('bumpVersion')
    }),
    syncWorldEntities: vi.fn(() => {
      calls.push('syncWorldEntities')
    }),
  }

  return { deps, calls, getWorld: () => world }
}

describe('applyWorldEdit', () => {
  it('runs undo → write → sync when undo is push and scene is sync', () => {
    const prev = minimalWorld()
    const { deps, calls } = createOrderTrackingDeps(prev)

    applyWorldEdit(deps, { undo: 'push', scene: 'sync' }, (world) => ({
      ...world,
      entities: [{ ...world.entities[0], name: 'Renamed' }],
    }))

    expect(calls).toEqual(['pushBeforeEdit', 'updateWorld', 'syncWorldEntities'])
    expect(deps.pushBeforeEdit).toHaveBeenCalledOnce()
    expect(deps.syncWorldEntities).toHaveBeenCalledWith(prev, expect.objectContaining({ entities: [expect.objectContaining({ name: 'Renamed' })] }))
  })

  it('skips undo when undo is skip', () => {
    const { deps, calls } = createOrderTrackingDeps(minimalWorld())

    applyWorldEdit(deps, { undo: 'skip', scene: 'sync' }, (world) => world)

    expect(calls).toEqual(['updateWorld', 'syncWorldEntities'])
    expect(deps.pushBeforeEdit).not.toHaveBeenCalled()
  })

  it('runs undo → write → capture → bump for scene rebuild', () => {
    const { deps, calls } = createOrderTrackingDeps(minimalWorld())

    applyWorldEdit(deps, { undo: 'push', scene: 'rebuild' }, (world) => world)

    expect(calls).toEqual([
      'pushBeforeEdit',
      'updateWorld',
      'captureScenePosesForNextRebuild',
      'bumpVersion',
    ])
    expect(deps.captureScenePosesForNextRebuild).toHaveBeenCalledBefore(deps.bumpVersion as ReturnType<typeof vi.fn>)
  })

  it('runs undo → write only for scene none', () => {
    const { deps, calls } = createOrderTrackingDeps(minimalWorld())

    applyWorldEdit(deps, { undo: 'push', scene: 'none' }, (world) => world)

    expect(calls).toEqual(['pushBeforeEdit', 'updateWorld'])
    expect(deps.captureScenePosesForNextRebuild).not.toHaveBeenCalled()
    expect(deps.bumpVersion).not.toHaveBeenCalled()
    expect(deps.syncWorldEntities).not.toHaveBeenCalled()
  })

  it('feeds the authoritative pre-write world into produceNext', () => {
    const prev = minimalWorld({ version: 'authoritative-prev' })
    const { deps, getWorld } = createOrderTrackingDeps(prev)
    const seen: RennWorld[] = []

    applyWorldEdit(deps, { undo: 'skip', scene: 'none' }, (world) => {
      seen.push(world)
      return { ...world, version: 'next' }
    })

    expect(seen).toEqual([prev])
    expect(getWorld().version).toBe('next')
  })

  it('auto sync branch matches incremental edits (name change only)', () => {
    const prev = minimalWorld()
    const { deps, calls } = createOrderTrackingDeps(prev)

    applyWorldEdit(deps, { undo: 'skip', scene: 'auto' }, (world) => ({
      ...world,
      entities: [{ ...world.entities[0], name: 'Other Name' }],
    }))

    expect(calls).toEqual(['updateWorld', 'syncWorldEntities'])
    expect(deps.captureScenePosesForNextRebuild).not.toHaveBeenCalled()
    expect(deps.bumpVersion).not.toHaveBeenCalled()
    expect(deps.syncWorldEntities).toHaveBeenCalledWith(prev, expect.any(Object))
  })

  it('auto rebuild branch matches structural edits (entity scripts)', () => {
    const prev = minimalWorld()
    const { deps, calls } = createOrderTrackingDeps(prev)

    applyWorldEdit(deps, { undo: 'skip', scene: 'auto' }, (world) => ({
      ...world,
      entities: [{ ...world.entities[0], scripts: ['script-1'] }],
    }))

    expect(calls).toEqual([
      'updateWorld',
      'captureScenePosesForNextRebuild',
      'bumpVersion',
    ])
    expect(deps.syncWorldEntities).not.toHaveBeenCalled()
    expect(deps.captureScenePosesForNextRebuild).toHaveBeenCalledBefore(deps.bumpVersion as ReturnType<typeof vi.fn>)
  })

  it('pushes undo before updateWorld', () => {
    const { deps } = createOrderTrackingDeps(minimalWorld())

    applyWorldEdit(deps, { undo: 'push', scene: 'none' }, (world) => world)

    expect(deps.pushBeforeEdit).toHaveBeenCalledBefore(deps.updateWorld as ReturnType<typeof vi.fn>)
  })
})
