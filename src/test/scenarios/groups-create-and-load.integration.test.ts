/**
 * Integration: Phase A explorer groups round-trip through schema validation and IndexedDB persistence.
 *
 * Covers:
 * - Building a world with groups using the pure helpers
 * - Schema validation accepts the resulting document
 * - Save → load via IndexedDB preserves group structure (incl. nested sub-groups, collapsed state, opaque rig field)
 * - Deleting an entity prunes its membership in any group
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import { validateWorldDocument } from '@/schema/validate'
import {
  addToGroup,
  createGroupFromSelection,
  findGroupById,
  pruneGroupMembers,
  setGroupCollapsed,
} from '@/utils/entityGroups'
import type { Entity, RennWorld } from '@/types/world'

function entity(id: string, name?: string): Entity {
  return { id, name: name ?? id }
}

function emptyWorld(entities: Entity[] = []): RennWorld {
  return { version: '1.0', world: {}, entities }
}

let counter = 0
const seqId = () => `gen_${++counter}`

describe('groups: create + persist + load + delete (integration)', () => {
  let persistence: ReturnType<typeof createIndexedDbPersistence>
  beforeEach(() => {
    counter = 0
    persistence = createIndexedDbPersistence()
  })

  it('round-trips a world with a flat group through IndexedDB', async () => {
    const initial = emptyWorld([entity('a'), entity('b'), entity('c')])
    const { world: built, group } = createGroupFromSelection(initial, ['a', 'b'], {
      idGenerator: seqId,
      name: 'Pair',
    })
    expect(group).not.toBeNull()
    expect(() => validateWorldDocument(built)).not.toThrow()

    await persistence.saveProject('p1', 'Test', { world: built, assets: new Map() })
    const { world: loaded } = await persistence.loadProject('p1')
    expect(loaded.groups).toEqual(built.groups)
    expect(findGroupById(loaded, group!.id)?.memberIds).toEqual(['a', 'b'])
  })

  it('round-trips nested sub-groups, collapsed state, and an opaque rig payload', async () => {
    const w0 = emptyWorld([entity('a'), entity('b'), entity('c')])
    const { world: w1, group: child } = createGroupFromSelection(w0, ['b', 'c'], {
      idGenerator: seqId,
      name: 'Child',
    })
    const { world: w2, group: parent } = createGroupFromSelection(w1, [child!.id, 'a'], {
      idGenerator: seqId,
      name: 'Parent',
    })
    const w3 = setGroupCollapsed(w2, child!.id, true)
    // Phase B placeholder – schema must accept opaque rig content
    const w4: RennWorld = {
      ...w3,
      groups: w3.groups!.map((g) =>
        g.id === parent!.id ? { ...g, rig: { joints: [{ type: 'fixed', from: 'a', to: 'b' }] } } : g,
      ),
    }
    expect(() => validateWorldDocument(w4)).not.toThrow()

    await persistence.saveProject('p2', 'Test2', { world: w4, assets: new Map() })
    const { world: loaded } = await persistence.loadProject('p2')

    expect(findGroupById(loaded, child!.id)?.collapsed).toBe(true)
    expect(findGroupById(loaded, parent!.id)?.memberIds).toEqual([child!.id, 'a'])
    expect(findGroupById(loaded, parent!.id)?.rig).toEqual({
      joints: [{ type: 'fixed', from: 'a', to: 'b' }],
    })
  })

  it('addToGroup is idempotent and survives round-trip', async () => {
    const w0 = emptyWorld([entity('a'), entity('b')])
    const { world: w1, group } = createGroupFromSelection(w0, ['a'], { idGenerator: seqId })
    const w2 = addToGroup(w1, group!.id, ['b', 'b'])
    expect(findGroupById(w2, group!.id)?.memberIds).toEqual(['a', 'b'])

    await persistence.saveProject('p3', 'Add', { world: w2, assets: new Map() })
    const { world: loaded } = await persistence.loadProject('p3')
    expect(findGroupById(loaded, group!.id)?.memberIds).toEqual(['a', 'b'])
  })

  it('deleting an entity (simulated builder flow) prunes its membership from every group', async () => {
    const w0 = emptyWorld([entity('a'), entity('b'), entity('c')])
    const { world: w1, group: g1 } = createGroupFromSelection(w0, ['a', 'b'], { idGenerator: seqId })
    const { world: w2, group: g2 } = createGroupFromSelection(w1, ['c'], { idGenerator: seqId })

    // Simulate Builder.handleDeleteEntities: drop entity then prune groups
    const deleted = new Set(['b'])
    const remainingEntities = w2.entities.filter((e) => !deleted.has(e.id))
    const w3 = pruneGroupMembers({ ...w2, entities: remainingEntities }, deleted)

    expect(() => validateWorldDocument(w3)).not.toThrow()
    expect(findGroupById(w3, g1!.id)?.memberIds).toEqual(['a'])
    expect(findGroupById(w3, g2!.id)?.memberIds).toEqual(['c'])

    await persistence.saveProject('p4', 'Del', { world: w3, assets: new Map() })
    const { world: loaded } = await persistence.loadProject('p4')
    expect(findGroupById(loaded, g1!.id)?.memberIds).toEqual(['a'])
    expect(loaded.entities.map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('legacy worlds without `groups` load and validate untouched', async () => {
    const legacy: RennWorld = emptyWorld([entity('a')])
    expect('groups' in legacy).toBe(false)
    expect(() => validateWorldDocument(legacy)).not.toThrow()

    await persistence.saveProject('p5', 'Legacy', { world: legacy, assets: new Map() })
    const { world: loaded } = await persistence.loadProject('p5')
    expect(loaded.groups).toBeUndefined()
    expect(loaded.entities.map((e) => e.id)).toEqual(['a'])
  })
})
