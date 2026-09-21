import { describe, it, expect } from 'vitest'
import { createTestEntity } from '@/test/helpers/entity'
import { createWorldWithEntities } from '@/test/helpers/world'
import { applyLogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'

describe('applyLogicVerificationWorldPatch', () => {
  it('rejects entity add without allowSceneRebuild', () => {
    const prev = createWorldWithEntities([createTestEntity({ id: 'a' })])
    const result = applyLogicVerificationWorldPatch(prev, {
      entities: {
        add: [createTestEntity({ id: 'b', position: [1, 0, 0] })],
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.requiresSceneRebuild).toBe(true)
    }
  })

  it('adds entity when allowSceneRebuild is set', () => {
    const prev = createWorldWithEntities([createTestEntity({ id: 'a' })])
    const result = applyLogicVerificationWorldPatch(prev, {
      allowSceneRebuild: true,
      entities: {
        add: [createTestEntity({ id: 'b', position: [1, 0, 0] })],
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.nextWorld.entities.map((e) => e.id).sort()).toEqual(['a', 'b'])
      expect(result.mode).toBe('entity-scene')
    }
  })

  it('updates entity metadata without scene rebuild', () => {
    const prev = createWorldWithEntities([createTestEntity({ id: 'a', name: 'Before' })])
    const result = applyLogicVerificationWorldPatch(prev, {
      entities: { update: { a: { name: 'After' } } },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mode).toBe('entity-metadata')
      expect(result.nextWorld.entities[0]?.name).toBe('After')
    }
  })

  it('patches entity pipe stack binding params', () => {
    const pipe: TransformerPipe = {
      id: 'pipe_a',
      name: 'Test pipe',
      stageIds: ['tf1'],
      stages: [{ type: 'custom', priority: 0, enabled: true, params: {}, name: 'S' }],
    }
    const prev = createWorldWithEntities([
      createTestEntity({
        id: 'car',
        transformerPipeStack: [{ pipeId: 'pipe_a', params: {} }],
        transformers: ['tf1'],
      }),
    ])
    prev.transformerPipes = { pipe_a: pipe }
    prev.transformers = {
      tf1: { type: 'custom', priority: 0, enabled: true, params: {}, name: 'S' } as TransformerConfig,
    }

    const result = applyLogicVerificationWorldPatch(prev, {
      entityPipeStack: [{ entityId: 'car', mergeBindingParams: { id: 'target_1' } }],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.nextWorld.entities[0]?.transformerPipeStack?.[0]?.params?.id).toBe('target_1')
      expect(result.affectedEntityIds).toContain('car')
    }
  })

  it('patches inline pipe stage by name', () => {
    const prev = createWorldWithEntities([createTestEntity({ id: 'car' })])
    prev.transformerPipes = {
      pipe_a: {
        id: 'pipe_a',
        name: 'P',
        stageIds: ['tf1'],
        stages: [
          {
            type: 'custom',
            priority: 0,
            enabled: true,
            params: { id: 'old' },
            name: 'Target',
          },
        ],
      },
    }
    const result = applyLogicVerificationWorldPatch(prev, {
      transformerPipes: {
        pipe_a: {
          stagePatches: [{ match: { name: 'Target' }, patch: { params: { id: 'new' } } }],
        },
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(prev.transformerPipes!.pipe_a!.stages[0]!.params?.id).toBe('old')
      expect(result.nextWorld.transformerPipes!.pipe_a!.stages[0]!.params?.id).toBe('new')
    }
  })
})
