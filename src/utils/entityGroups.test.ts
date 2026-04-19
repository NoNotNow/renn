import { describe, it, expect } from 'vitest'
import type { Entity, RennWorld } from '@/types/world'
import {
  addToGroup,
  collectEntityIdsInGroup,
  createGroupFromSelection,
  dissolveGroup,
  expandGroupSelection,
  findGroupById,
  findGroupContaining,
  getGroupTree,
  pruneGroupMembers,
  removeFromGroup,
  renameGroup,
  setGroupCollapsed,
  validateGroupReferences,
} from './entityGroups'

function entity(id: string): Entity {
  return { id, name: id }
}

function world(entities: Entity[], groups: RennWorld['groups'] = undefined): RennWorld {
  return { version: '1.0', world: {}, entities, ...(groups ? { groups } : {}) }
}

let counter = 0
const seqId = () => `gen_${++counter}`

describe('entityGroups', () => {
  describe('createGroupFromSelection', () => {
    it('creates a group with the given members', () => {
      const w = world([entity('a'), entity('b'), entity('c')])
      const { world: next, group } = createGroupFromSelection(w, ['a', 'b'], { idGenerator: seqId, name: 'Pair' })
      expect(group).not.toBeNull()
      expect(group?.memberIds).toEqual(['a', 'b'])
      expect(group?.name).toBe('Pair')
      expect(next.groups).toHaveLength(1)
      expect(next.groups?.[0]).toEqual(group)
    })

    it('returns a no-op when no valid IDs survive filtering', () => {
      const w = world([entity('a')])
      const { world: next, group } = createGroupFromSelection(w, ['ghost', 'unknown'], { idGenerator: seqId })
      expect(group).toBeNull()
      expect(next).toBe(w)
    })

    it('removes duplicates and unknowns from the input list', () => {
      const w = world([entity('a'), entity('b')])
      const { group } = createGroupFromSelection(w, ['a', 'a', 'b', 'ghost'], { idGenerator: seqId })
      expect(group?.memberIds).toEqual(['a', 'b'])
    })

    it('detaches members from a previous group (single-parent invariant)', () => {
      const initial = world(
        [entity('a'), entity('b'), entity('c')],
        [{ id: 'g1', memberIds: ['a', 'b'] }],
      )
      const { world: next, group } = createGroupFromSelection(initial, ['b', 'c'], { idGenerator: seqId })
      expect(group?.memberIds).toEqual(['b', 'c'])
      expect(findGroupById(next, 'g1')?.memberIds).toEqual(['a'])
    })

    it('does not mutate the input world', () => {
      const initial = world([entity('a'), entity('b')])
      createGroupFromSelection(initial, ['a', 'b'], { idGenerator: seqId })
      expect(initial.groups).toBeUndefined()
    })
  })

  describe('addToGroup', () => {
    it('appends new members without re-adding existing ones', () => {
      const w = world(
        [entity('a'), entity('b'), entity('c')],
        [{ id: 'g1', memberIds: ['a'] }],
      )
      const next = addToGroup(w, 'g1', ['a', 'b', 'c'])
      expect(findGroupById(next, 'g1')?.memberIds).toEqual(['a', 'b', 'c'])
    })

    it('detaches members from another group first', () => {
      const w = world(
        [entity('a'), entity('b')],
        [
          { id: 'g1', memberIds: ['a', 'b'] },
          { id: 'g2', memberIds: [] },
        ],
      )
      const next = addToGroup(w, 'g2', ['b'])
      expect(findGroupById(next, 'g1')?.memberIds).toEqual(['a'])
      expect(findGroupById(next, 'g2')?.memberIds).toEqual(['b'])
    })

    it('returns the world unchanged when the target group does not exist', () => {
      const w = world([entity('a')])
      expect(addToGroup(w, 'ghost', ['a'])).toBe(w)
    })

    it('refuses to add a sub-group that would create a cycle', () => {
      const w = world(
        [entity('a')],
        [
          { id: 'parent', memberIds: ['child', 'a'] },
          { id: 'child', memberIds: [] },
        ],
      )
      const next = addToGroup(w, 'child', ['parent'])
      expect(findGroupById(next, 'child')?.memberIds).toEqual([])
    })

    it('refuses to add a group to itself', () => {
      const w = world([entity('a')], [{ id: 'g1', memberIds: ['a'] }])
      const next = addToGroup(w, 'g1', ['g1'])
      expect(findGroupById(next, 'g1')?.memberIds).toEqual(['a'])
    })
  })

  describe('removeFromGroup', () => {
    it('removes only the listed IDs', () => {
      const w = world(
        [entity('a'), entity('b'), entity('c')],
        [{ id: 'g1', memberIds: ['a', 'b', 'c'] }],
      )
      const next = removeFromGroup(w, 'g1', ['b'])
      expect(findGroupById(next, 'g1')?.memberIds).toEqual(['a', 'c'])
    })

    it('is a no-op when the group does not exist', () => {
      const w = world([entity('a')])
      expect(removeFromGroup(w, 'ghost', ['a'])).toBe(w)
    })
  })

  describe('dissolveGroup', () => {
    it('removes the group; members become loose', () => {
      const w = world(
        [entity('a'), entity('b')],
        [{ id: 'g1', memberIds: ['a', 'b'] }],
      )
      const next = dissolveGroup(w, 'g1')
      expect(next.groups).toBeUndefined()
      expect(findGroupContaining(next, 'a')).toBeNull()
    })

    it('detaches the dissolved group from any parent group', () => {
      const w = world(
        [entity('a')],
        [
          { id: 'parent', memberIds: ['child'] },
          { id: 'child', memberIds: ['a'] },
        ],
      )
      const next = dissolveGroup(w, 'child')
      expect(findGroupById(next, 'parent')?.memberIds).toEqual([])
      expect(findGroupById(next, 'child')).toBeNull()
    })
  })

  describe('getGroupTree', () => {
    it('lists groups before loose entities', () => {
      const w = world(
        [entity('a'), entity('b'), entity('c')],
        [{ id: 'g1', memberIds: ['b'] }],
      )
      const tree = getGroupTree(w)
      expect(tree).toHaveLength(3)
      expect(tree[0]).toMatchObject({ kind: 'group' })
      expect(tree[1]).toEqual({ kind: 'entity', entityId: 'a' })
      expect(tree[2]).toEqual({ kind: 'entity', entityId: 'c' })
    })

    it('renders nested sub-groups in place', () => {
      const w = world(
        [entity('a'), entity('b')],
        [
          { id: 'parent', memberIds: ['child', 'a'] },
          { id: 'child', memberIds: ['b'] },
        ],
      )
      const tree = getGroupTree(w)
      expect(tree).toHaveLength(1)
      const root = tree[0]
      expect(root.kind).toBe('group')
      if (root.kind !== 'group') return
      expect(root.children).toHaveLength(2)
      expect(root.children[0].kind).toBe('group')
      expect(root.children[1]).toEqual({ kind: 'entity', entityId: 'a' })
    })

    it('skips stale member references defensively', () => {
      const w = world([entity('a')], [{ id: 'g1', memberIds: ['ghost', 'a'] }])
      const tree = getGroupTree(w)
      const root = tree[0]
      expect(root.kind).toBe('group')
      if (root.kind !== 'group') return
      expect(root.children).toEqual([{ kind: 'entity', entityId: 'a' }])
    })

    it('does not loop on cyclic group references', () => {
      const w = world(
        [entity('a')],
        [
          { id: 'g1', memberIds: ['g2', 'a'] },
          { id: 'g2', memberIds: ['g1'] },
        ],
      )
      // Both groups reference each other → both end up "non-root" by the membership scan;
      // tree should still be finite.
      const tree = getGroupTree(w)
      expect(Array.isArray(tree)).toBe(true)
    })
  })

  describe('expandGroupSelection', () => {
    it('expands a group selection to its entity IDs', () => {
      const w = world(
        [entity('a'), entity('b'), entity('c')],
        [{ id: 'g1', memberIds: ['a', 'b'] }],
      )
      expect(expandGroupSelection(w, ['g1'])).toEqual(['a', 'b'])
    })

    it('preserves entity IDs and dedupes across mixed selection', () => {
      const w = world(
        [entity('a'), entity('b'), entity('c')],
        [{ id: 'g1', memberIds: ['a', 'b'] }],
      )
      expect(expandGroupSelection(w, ['c', 'g1', 'a'])).toEqual(['c', 'a', 'b'])
    })

    it('expands recursively through sub-groups', () => {
      const w = world(
        [entity('a'), entity('b'), entity('c')],
        [
          { id: 'parent', memberIds: ['child', 'a'] },
          { id: 'child', memberIds: ['b', 'c'] },
        ],
      )
      expect(expandGroupSelection(w, ['parent'])).toEqual(['b', 'c', 'a'])
    })
  })

  describe('collectEntityIdsInGroup', () => {
    it('returns nested entity IDs and ignores cycles', () => {
      const w = world(
        [entity('a')],
        [
          { id: 'g1', memberIds: ['g2', 'a'] },
          { id: 'g2', memberIds: ['g1'] },
        ],
      )
      expect(collectEntityIdsInGroup(w, 'g1')).toEqual(['a'])
    })
  })

  describe('pruneGroupMembers', () => {
    it('strips deleted IDs from every group', () => {
      const w = world(
        [entity('a')],
        [{ id: 'g1', memberIds: ['a', 'b'] }],
      )
      const next = pruneGroupMembers(w, new Set(['b']))
      expect(findGroupById(next, 'g1')?.memberIds).toEqual(['a'])
    })

    it('returns the same world reference when nothing changes', () => {
      const w = world([entity('a')], [{ id: 'g1', memberIds: ['a'] }])
      expect(pruneGroupMembers(w, new Set(['unknown']))).toBe(w)
    })
  })

  describe('setGroupCollapsed / renameGroup', () => {
    it('toggles collapsed state', () => {
      const w = world([entity('a')], [{ id: 'g1', memberIds: ['a'] }])
      const next = setGroupCollapsed(w, 'g1', true)
      expect(findGroupById(next, 'g1')?.collapsed).toBe(true)
    })

    it('clears the name when given undefined', () => {
      const w = world([entity('a')], [{ id: 'g1', name: 'Old', memberIds: ['a'] }])
      const next = renameGroup(w, 'g1', undefined)
      expect(findGroupById(next, 'g1')?.name).toBeUndefined()
    })

    it('trims whitespace and treats empty as clear', () => {
      const w = world([entity('a')], [{ id: 'g1', name: 'Old', memberIds: ['a'] }])
      const next = renameGroup(w, 'g1', '  ')
      expect(findGroupById(next, 'g1')?.name).toBeUndefined()
    })
  })

  describe('validateGroupReferences', () => {
    it('reports unknown member IDs', () => {
      const w = world([entity('a')], [{ id: 'g1', memberIds: ['a', 'ghost'] }])
      const issues = validateGroupReferences(w)
      expect(issues.find((i) => i.kind === 'unknown-member')?.detail).toContain('ghost')
    })

    it('reports cycles', () => {
      const w = world(
        [],
        [
          { id: 'g1', memberIds: ['g2'] },
          { id: 'g2', memberIds: ['g1'] },
        ],
      )
      const issues = validateGroupReferences(w)
      expect(issues.some((i) => i.kind === 'cycle')).toBe(true)
    })

    it('reports duplicate group IDs', () => {
      const w = world(
        [entity('a')],
        [
          { id: 'g1', memberIds: ['a'] },
          { id: 'g1', memberIds: [] },
        ],
      )
      const issues = validateGroupReferences(w)
      expect(issues.some((i) => i.kind === 'duplicate-group-id')).toBe(true)
    })

    it('returns empty for a healthy world', () => {
      const w = world([entity('a'), entity('b')], [{ id: 'g1', memberIds: ['a', 'b'] }])
      expect(validateGroupReferences(w)).toEqual([])
    })
  })
})
