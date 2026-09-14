import { describe, it, expect } from 'vitest'
import type { Entity, RennWorld } from '@/types/world'
import { createTestEntity } from '@/test/helpers/entity'
import { createTestWorld, createWorldWithEntities } from '@/test/helpers/world'
import {
  canApplyWorldSnapshotIncrementally,
  diffEntityWorld,
  worldPipeRegistryChanged,
} from './incrementalSceneSync'

function entityWorld(entity: Entity): RennWorld {
  return createWorldWithEntities([entity])
}

function pipeRegistryWorld(overrides?: Partial<RennWorld>): RennWorld {
  return createTestWorld({
    transformers: { s1: { type: 'input' } },
    transformerPipes: {
      root: {
        id: 'root',
        name: 'Root',
        stageIds: ['s1'],
        stages: [],
        members: [{ kind: 'stage', stageId: 's1' }],
      },
    },
    ...overrides,
  })
}

describe('diffEntityWorld', () => {
  const e1 = createTestEntity({ id: 'e1' })
  const e2 = createTestEntity({ id: 'e2', name: 'Entity 2' })

  it('reports no entity diff when worlds share the same entity references', () => {
    const prev = createWorldWithEntities([e1])
    const next = createWorldWithEntities([e1])
    expect(diffEntityWorld(prev, next)).toEqual({
      removedIds: [],
      added: [],
      updated: [],
    })
  })

  it('reports added entity when snapshot gains an entity', () => {
    const prev = createWorldWithEntities([e1])
    const next = createWorldWithEntities([e1, e2])
    const diff = diffEntityWorld(prev, next)
    expect(diff.removedIds).toEqual([])
    expect(diff.added).toEqual([e2])
    expect(diff.updated).toEqual([])
  })

  it('reports removed entity id when snapshot loses an entity', () => {
    const prev = createWorldWithEntities([e1, e2])
    const next = createWorldWithEntities([e1])
    const diff = diffEntityWorld(prev, next)
    expect(diff.removedIds).toEqual(['e2'])
    expect(diff.added).toEqual([])
    expect(diff.updated).toEqual([])
  })

  it('reports updated pair when an existing entity reference changes', () => {
    const e1Renamed = { ...e1, name: 'Renamed' }
    const prev = createWorldWithEntities([e1])
    const next = createWorldWithEntities([e1Renamed])
    const diff = diffEntityWorld(prev, next)
    expect(diff.removedIds).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.updated).toEqual([{ prev: e1, next: e1Renamed }])
  })

  it('reports updated pair when entity is cloned with identical fields', () => {
    const prev = createWorldWithEntities([e1])
    const cloned = { ...e1 }
    const next = createWorldWithEntities([cloned])
    const diff = diffEntityWorld(prev, next)
    expect(diff.removedIds).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.updated).toEqual([{ prev: e1, next: cloned }])
  })

  it('reports no diff when entity order changes but references are unchanged', () => {
    const prev = createWorldWithEntities([e1, e2])
    const next = createWorldWithEntities([e2, e1])
    expect(diffEntityWorld(prev, next)).toEqual({
      removedIds: [],
      added: [],
      updated: [],
    })
  })

  it('reports multiple updates, additions, and removals in one diff', () => {
    const e1Moved = { ...e1, position: [1, 0, 0] as [number, number, number] }
    const e3 = createTestEntity({ id: 'e3' })
    const prev = createWorldWithEntities([e1, e2])
    const next = createWorldWithEntities([e1Moved, e3])
    const diff = diffEntityWorld(prev, next)
    expect(diff.removedIds).toEqual(['e2'])
    expect(diff.added).toEqual([e3])
    expect(diff.updated).toEqual([{ prev: e1, next: e1Moved }])
  })
})

describe('worldPipeRegistryChanged', () => {
  it('returns false when transformer and pipe registries are unchanged', () => {
    const prev = pipeRegistryWorld()
    const next = pipeRegistryWorld()
    expect(worldPipeRegistryChanged(prev, next)).toBe(false)
  })

  it('returns true when a pipe is added to the registry', () => {
    const prev = pipeRegistryWorld()
    const next = pipeRegistryWorld({
      transformerPipes: {
        ...prev.transformerPipes,
        extra: {
          id: 'extra',
          name: 'Extra',
          stageIds: [],
          stages: [],
          members: [],
        },
      },
    })
    expect(worldPipeRegistryChanged(prev, next)).toBe(true)
  })

  it('returns true when a pipe definition is edited', () => {
    const prev = pipeRegistryWorld()
    const root = prev.transformerPipes!.root
    const next = pipeRegistryWorld({
      transformerPipes: {
        root: { ...root, name: 'Renamed Root' },
      },
    })
    expect(worldPipeRegistryChanged(prev, next)).toBe(true)
  })

  it('returns true when a pipe is removed from the registry', () => {
    const prev = pipeRegistryWorld()
    const next = pipeRegistryWorld({ transformerPipes: {} })
    expect(worldPipeRegistryChanged(prev, next)).toBe(true)
  })

  it('returns true when a transformer definition is edited', () => {
    const prev = pipeRegistryWorld()
    const next = pipeRegistryWorld({
      transformers: { s1: { type: 'car2', params: { power: 50 } } },
    })
    expect(worldPipeRegistryChanged(prev, next)).toBe(true)
  })

  it('returns false when a non-registry edit preserves both registry references', () => {
    const prev = pipeRegistryWorld()
    const next: RennWorld = {
      ...prev,
      entities: [createTestEntity({ id: 'added' })],
    }
    expect(next.transformers).toBe(prev.transformers)
    expect(worldPipeRegistryChanged(prev, next)).toBe(false)
  })

  it('still detects a registry edit when the other registry reference is shared', () => {
    const prev = pipeRegistryWorld()
    const next: RennWorld = {
      ...prev,
      transformers: { ...prev.transformers, s1: { type: 'car2' } },
    }
    expect(next.transformerPipes).toBe(prev.transformerPipes)
    expect(worldPipeRegistryChanged(prev, next)).toBe(true)
  })
})

describe('canApplyWorldSnapshotIncrementally', () => {
  const baseEntity = createTestEntity({ id: 'e1', locked: false })

  it('allows incremental apply for pose-only entity change', () => {
    const prev = entityWorld(baseEntity)
    const next = entityWorld({
      ...baseEntity,
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
    })
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(true)
  })

  it('allows incremental apply for material-only entity change', () => {
    const prev = entityWorld(baseEntity)
    const next = entityWorld({ ...baseEntity, material: { color: [1, 0, 0] } })
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(true)
  })

  it('requires full scene rebuild when shape becomes trimesh', () => {
    const prev = entityWorld(baseEntity)
    const next = entityWorld({ ...baseEntity, shape: { type: 'trimesh', model: 'my-model' } })
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(false)
  })

  it('requires full scene rebuild when entity model changes', () => {
    const prev = entityWorld(baseEntity)
    const next = entityWorld({ ...baseEntity, model: 'car' })
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(false)
  })

  it('requires full scene rebuild when entity scripts change', () => {
    const prev = entityWorld(baseEntity)
    const next = entityWorld({ ...baseEntity, scripts: ['script-1'] })
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(false)
  })

  it('requires full scene rebuild when modelSimplification changes', () => {
    const entityWithModel = { ...baseEntity, model: 'car' }
    const prev = entityWorld(entityWithModel)
    const next = entityWorld({
      ...entityWithModel,
      modelSimplification: {
        enabled: true,
        maxTriangles: 3000,
        algorithm: 'meshoptimizer',
      },
    })
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(false)
  })

  it('allows incremental apply when an entity is added', () => {
    const prev = entityWorld(baseEntity)
    const e2 = createTestEntity({ id: 'e2' })
    const next = createWorldWithEntities([baseEntity, e2])
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(true)
  })

  it('allows incremental apply when an entity is removed', () => {
    const e2 = createTestEntity({ id: 'e2' })
    const prev = createWorldWithEntities([baseEntity, e2])
    const next = entityWorld(baseEntity)
    expect(canApplyWorldSnapshotIncrementally(prev, next)).toBe(true)
  })
})
