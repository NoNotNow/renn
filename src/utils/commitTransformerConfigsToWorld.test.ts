import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { commitTransformerConfigsToWorld } from './commitTransformerConfigsToWorld'

function applyStacksToEntities(world: RennWorld, entityIds: string[], configs: TransformerConfig[]): RennWorld {
  let next = world
  for (const id of entityIds) {
    next = commitTransformerConfigsToWorld(next, id, configs)
  }
  return next
}

describe('commitTransformerConfigsToWorld', () => {
  it('matches Builder multi-entity path: defs live in registry, entities hold stable per-entity ids', () => {
    const configs: TransformerConfig[] = [
      { type: 'input', priority: 0, enabled: true, params: {} },
      { type: 'custom', priority: 1, enabled: true, params: {}, code: 'return {};', name: 'C1' },
    ]
    const world: RennWorld = {
      version: '1.0',
      world: { gravity: [0, -9.81, 0] },
      assets: {},
      entities: [
        {
          id: 'e_a',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [0, 0, 0],
          transformers: ['e_a_tf0'],
        },
        {
          id: 'e_b',
          bodyType: 'dynamic',
          shape: { type: 'box', width: 1, height: 1, depth: 1 },
          position: [1, 0, 0],
          transformers: ['e_b_tf0'],
        },
      ],
      transformers: {
        e_a_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
        e_b_tf0: { type: 'input', priority: 0, enabled: true, params: {} },
      },
    }

    const next = applyStacksToEntities(world, ['e_a', 'e_b'], configs)

    expect(next.entities.find((e) => e.id === 'e_a')?.transformers).toEqual(['e_a_tf0', 'e_a_tf1'])
    expect(next.entities.find((e) => e.id === 'e_b')?.transformers).toEqual(['e_b_tf0', 'e_b_tf1'])
    expect(next.transformers?.e_a_tf0).toMatchObject(configs[0])
    expect(next.transformers?.e_a_tf1).toMatchObject({ type: 'custom', name: 'C1' })
    expect(next.transformers?.e_b_tf0).toMatchObject(configs[0])
    expect(next.transformers?.e_b_tf1).toMatchObject({ type: 'custom', name: 'C1' })
  })
})
