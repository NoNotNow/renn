import { describe, expect, it } from 'vitest'
import { buildPipeAuthoringSummary } from '@/agent/agentPipeAuthoringSummary'
import type { RennWorld } from '@/types/world'

describe('buildPipeAuthoringSummary', () => {
  it('lists linked entities and stage usage counts', () => {
    const world: RennWorld = {
      version: '1.0',
      world: {},
      entities: [
        {
          id: 'copy',
          name: 'Copy',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['shared_tf', 'local_tf'],
          transformerPipeStack: [{ pipeId: 'p1', enabled: true, params: { id: 'x' } }],
        },
        {
          id: 'other',
          name: 'Other',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [1, 0, 0],
          transformers: ['shared_tf'],
        },
      ],
      transformers: {
        shared_tf: { type: 'input', priority: 0, enabled: true, params: {} },
        local_tf: { type: 'wanderer', priority: 1, enabled: true, params: {} },
      },
      transformerPipes: {
        p1: {
          id: 'p1',
          name: 'Pipe1',
          stageIds: ['shared_tf', 'local_tf'],
          stages: [],
          members: [
            { kind: 'stage', stageId: 'shared_tf' },
            { kind: 'stage', stageId: 'local_tf' },
          ],
        },
      },
    }

    const summary = buildPipeAuthoringSummary(world, 'p1')
    expect(summary.linkedEntities).toHaveLength(1)
    expect(summary.linkedEntities[0]?.entityId).toBe('copy')
    expect(summary.stages[0]?.entitiesUsingStageCount).toBe(2)
    expect(summary.stages[1]?.entitiesUsingStageCount).toBe(1)
  })
})
