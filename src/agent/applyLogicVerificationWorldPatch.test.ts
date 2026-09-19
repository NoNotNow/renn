import { describe, it, expect } from 'vitest'
import { createTestEntity } from '@/test/helpers/entity'
import { createWorldWithEntities } from '@/test/helpers/world'
import { applyLogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'

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
})
