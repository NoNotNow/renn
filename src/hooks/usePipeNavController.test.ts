import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Entity, RennWorld } from '@/types/world'
import { usePipeNavController } from './usePipeNavController'
import { resolvePipeNavEdit } from '@/editor/pipeNavEdit'

vi.mock('@/editor/pipeNavEdit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/editor/pipeNavEdit')>()
  return {
    ...actual,
    resolvePipeNavEdit: vi.fn(actual.resolvePipeNavEdit),
  }
})

const resolvePipeNavEditMock = vi.mocked(resolvePipeNavEdit)

function entityWithPipeStack(id = 'e1'): Entity {
  return {
    id,
    transformerPipeStack: [{ pipeId: 'p1' }],
  }
}

function worldFor(entity: Entity): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [entity],
    transformerPipes: {
      p1: { id: 'p1', name: 'Pipe', members: [], stageIds: [], stages: [] },
    },
    transformers: {},
  }
}

function countEnsurePipeStackCalls() {
  return resolvePipeNavEditMock.mock.calls.filter(
    ([intent]) => intent.kind === 'ensurePipeStack',
  ).length
}

describe('usePipeNavController ensurePipeStack bootstrap', () => {
  beforeEach(() => {
    resolvePipeNavEditMock.mockClear()
  })

  it('commits ensurePipeStack once on mount and not again when world reference changes', () => {
    const entity = entityWithPipeStack()
    const onWorldChange = vi.fn()

    const { rerender } = renderHook(
      ({ world, ent }) =>
        usePipeNavController(world, ent, undefined, onWorldChange),
      {
        initialProps: { world: worldFor(entity), ent: entity },
      },
    )

    expect(countEnsurePipeStackCalls()).toBe(1)

    const world2: RennWorld = {
      ...worldFor(entity),
      world: { gravity: [0, -10, 0] },
    }
    rerender({ world: world2, ent: entity })

    expect(countEnsurePipeStackCalls()).toBe(1)
  })

  it('commits ensurePipeStack again when entity.id changes', () => {
    const onWorldChange = vi.fn()
    const e1 = entityWithPipeStack('e1')
    const e2 = entityWithPipeStack('e2')

    const { rerender } = renderHook(
      ({ world, ent }) =>
        usePipeNavController(world, ent, undefined, onWorldChange),
      {
        initialProps: { world: worldFor(e1), ent: e1 },
      },
    )

    expect(countEnsurePipeStackCalls()).toBe(1)

    rerender({ world: worldFor(e2), ent: e2 })

    expect(countEnsurePipeStackCalls()).toBe(2)
  })
})
