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

describe('usePipeNavController does not force a pipe around an entity\'s stages', () => {
  beforeEach(() => {
    resolvePipeNavEditMock.mockClear()
  })

  it('never commits ensurePipeStack on mount or when the entity changes', () => {
    const onWorldChange = vi.fn()
    const e1 = entityWithPipeStack('e1')
    const e2 = entityWithPipeStack('e2')
    const { rerender } = renderHook(({ world, ent }) => usePipeNavController(world, ent, undefined, onWorldChange), {
      initialProps: { world: worldFor(e1), ent: e1 },
    })
    rerender({ world: worldFor(e2), ent: e2 })
    expect(countEnsurePipeStackCalls()).toBe(0)
  })
})
