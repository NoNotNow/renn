import { describe, it, expect } from 'vitest'
import type { Entity } from '@/types/world'
import type { RennWorld } from '@/types/world'
import { behaviorRegistryBindings } from './behaviorRegistryBindings'
import { entityWithLegacyTransformerPipe } from './transformerPipeResolve'

function worldWithEntities(entities: Entity[]): RennWorld {
  return {
    version: '1',
    world: {},
    entities,
  }
}

describe('behaviorRegistryBindings', () => {
  describe('entitiesUsing', () => {
    it('scripts: returns matching entities in world order with id and name, skips absent scripts', () => {
      const world = worldWithEntities([
        { id: 'e1', name: 'Alpha', scripts: ['s-a', 's-b'] },
        { id: 'e2' },
        { id: 'e3', name: 'Gamma', scripts: ['s-b'] },
        { id: 'e4', scripts: ['s-c'] },
      ])
      expect(behaviorRegistryBindings('scripts').entitiesUsing(world, 's-b')).toEqual([
        { id: 'e1', name: 'Alpha' },
        { id: 'e3', name: 'Gamma' },
      ])
    })

    it('transformers: returns matching entities in world order with id and name, skips absent transformers', () => {
      const world = worldWithEntities([
        { id: 'e1', name: 'T1', transformers: ['t-x'] },
        { id: 'e2', transformers: ['t-y', 't-x'] },
        { id: 'e3' },
      ])
      expect(behaviorRegistryBindings('transformers').entitiesUsing(world, 't-x')).toEqual([
        { id: 'e1', name: 'T1' },
        { id: 'e2' },
      ])
    })

    it('pipes: legacy transformerPipe, stack bindings, and dedupes duplicate stack entries', () => {
      const world = worldWithEntities([
        entityWithLegacyTransformerPipe({ id: 'e-legacy', name: 'Legacy' }, 'p-a'),
        {
          id: 'e-stack',
          name: 'Stack',
          transformerPipeStack: [{ pipeId: 'p-b' }, { pipeId: 'p-a' }, { pipeId: 'p-a' }],
        },
        { id: 'e-other', transformerPipeStack: [{ pipeId: 'p-c' }] },
      ])
      const usersA = behaviorRegistryBindings('pipes').entitiesUsing(world, 'p-a')
      expect(usersA).toEqual([
        { id: 'e-legacy', name: 'Legacy' },
        { id: 'e-stack', name: 'Stack' },
      ])
      expect(usersA).toHaveLength(2)
    })
  })

  describe('idsSharedBy', () => {
    it('returns empty for empty selection for each kind', () => {
      expect(behaviorRegistryBindings('scripts').idsSharedBy([])).toEqual([])
      expect(behaviorRegistryBindings('transformers').idsSharedBy([])).toEqual([])
      expect(behaviorRegistryBindings('pipes').idsSharedBy([])).toEqual([])
    })

    it('scripts: single entity returns all script ids; several return intersection', () => {
      const bindings = behaviorRegistryBindings('scripts')
      expect(bindings.idsSharedBy([{ scripts: ['a', 'b', 'c'] }])).toEqual(['a', 'b', 'c'])
      expect(
        bindings.idsSharedBy([
          { scripts: ['a', 'b', 'c'] },
          { scripts: ['b', 'c', 'd'] },
          { scripts: ['b', 'e'] },
        ]),
      ).toEqual(['b'])
      expect(bindings.idsSharedBy([{ scripts: ['x'] }, {}])).toEqual([])
    })

    it('transformers: single entity returns all transformer ids; several return intersection', () => {
      const bindings = behaviorRegistryBindings('transformers')
      expect(bindings.idsSharedBy([{ transformers: ['t1', 't2'] }])).toEqual(['t1', 't2'])
      expect(
        bindings.idsSharedBy([
          { transformers: ['t1', 't2'] },
          { transformers: ['t2', 't3'] },
        ]),
      ).toEqual(['t2'])
    })

    it('pipes: intersects stack pipe ids and dedupes repeated pipe ids per entity', () => {
      const bindings = behaviorRegistryBindings('pipes')
      expect(
        bindings.idsSharedBy([
          { transformerPipeStack: [{ pipeId: 'p1' }, { pipeId: 'p2' }, { pipeId: 'p1' }] },
        ]),
      ).toEqual(['p1', 'p2'])
      expect(
        bindings.idsSharedBy([
          { transformerPipeStack: [{ pipeId: 'p1' }, { pipeId: 'p2' }] },
          { transformerPipeStack: [{ pipeId: 'p2' }, { pipeId: 'p3' }] },
          entityWithLegacyTransformerPipe({ id: 'e-legacy-p2' }, 'p2'),
        ]),
      ).toEqual(['p2'])
    })
  })

  it('returns stable binding instances per kind', () => {
    expect(behaviorRegistryBindings('scripts')).toBe(behaviorRegistryBindings('scripts'))
    expect(behaviorRegistryBindings('transformers')).toBe(behaviorRegistryBindings('transformers'))
    expect(behaviorRegistryBindings('pipes')).toBe(behaviorRegistryBindings('pipes'))
    expect(behaviorRegistryBindings('scripts')).not.toBe(behaviorRegistryBindings('pipes'))
  })
})
