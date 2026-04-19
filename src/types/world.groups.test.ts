import { describe, it, expect } from 'vitest'
import { validateWorldDocument, getValidationErrors } from '@/schema/validate'
import type { RennWorld } from './world'

describe('RennWorld groups schema', () => {
  it('accepts a world without `groups`', () => {
    const w: RennWorld = { version: '1.0', world: {}, entities: [] }
    expect(() => validateWorldDocument(w)).not.toThrow()
  })

  it('accepts a world with empty groups array', () => {
    const w: RennWorld = { version: '1.0', world: {}, entities: [], groups: [] }
    expect(() => validateWorldDocument(w)).not.toThrow()
  })

  it('accepts a group with members and optional fields', () => {
    const w: RennWorld = {
      version: '1.0',
      world: {},
      entities: [{ id: 'a' }, { id: 'b' }],
      groups: [{ id: 'g1', name: 'Pair', memberIds: ['a', 'b'], collapsed: false }],
    }
    expect(() => validateWorldDocument(w)).not.toThrow()
  })

  it('accepts an opaque rig field for forward compatibility (Phase B)', () => {
    const w = {
      version: '1.0',
      world: {},
      entities: [{ id: 'a' }],
      groups: [
        {
          id: 'g1',
          memberIds: ['a'],
          rig: { joints: [{ type: 'fixed', bodyA: 'a', bodyB: 'b' }] },
        },
      ],
    } satisfies RennWorld
    expect(() => validateWorldDocument(w)).not.toThrow()
  })

  it('rejects a group missing required `id` or `memberIds`', () => {
    const errors = getValidationErrors({
      version: '1.0',
      world: {},
      entities: [],
      groups: [{ memberIds: [] }],
    })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects unknown top-level fields on a group', () => {
    const errors = getValidationErrors({
      version: '1.0',
      world: {},
      entities: [],
      groups: [{ id: 'g1', memberIds: [], whatever: 1 }],
    })
    expect(errors.some((e) => /additional/i.test(e))).toBe(true)
  })
})
