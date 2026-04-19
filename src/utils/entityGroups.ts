/**
 * Pure helpers for the explorer group tree (Phase A: organizational only).
 *
 * Invariants:
 * - A member ID may be either an entity ID or a (sub-)group ID.
 * - In Phase A each entity belongs to **at most one** direct group ("single-parent
 *   invariant"). Helpers that move entities into a new group therefore detach them
 *   from their previous direct group first.
 * - Groups must not form cycles (a group cannot transitively contain itself).
 *
 * No React, no DOM, no Three.js — fully unit-testable.
 *
 * See `agent-context/feature-groups.md` for the wider design.
 */
import type { EntityGroup, RennWorld } from '@/types/world'
import { generateId } from './idGenerator'

export type GroupTreeNode =
  | { kind: 'group'; group: EntityGroup; children: GroupTreeNode[] }
  | { kind: 'entity'; entityId: string }

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getGroups(world: Pick<RennWorld, 'groups'>): EntityGroup[] {
  return world.groups ?? []
}

export function findGroupById(world: Pick<RennWorld, 'groups'>, groupId: string): EntityGroup | null {
  return getGroups(world).find((g) => g.id === groupId) ?? null
}

/** Direct parent of `memberId` (entity or group). Returns null if loose / root. */
export function findGroupContaining(
  world: Pick<RennWorld, 'groups'>,
  memberId: string,
): EntityGroup | null {
  for (const g of getGroups(world)) {
    if (g.memberIds.includes(memberId)) return g
  }
  return null
}

function isGroupId(world: Pick<RennWorld, 'groups'>, id: string): boolean {
  return getGroups(world).some((g) => g.id === id)
}

/**
 * Returns the tree of groups + loose entities to render in the explorer.
 * Order: groups first (in declaration order), then loose entities (in declaration order).
 *
 * Defensive: stale member IDs (referencing deleted entities/groups) are silently skipped.
 * Cyclic references are guarded by a per-traversal visited set.
 */
export function getGroupTree(
  world: Pick<RennWorld, 'groups' | 'entities'>,
): GroupTreeNode[] {
  const groups = getGroups(world)
  const entities = world.entities
  const groupById = new Map(groups.map((g) => [g.id, g] as const))
  const entityIds = new Set(entities.map((e) => e.id))

  const memberOfSomeGroup = new Set<string>()
  for (const g of groups) {
    for (const id of g.memberIds) memberOfSomeGroup.add(id)
  }

  function buildGroupNode(group: EntityGroup, visited: Set<string>): GroupTreeNode {
    if (visited.has(group.id)) {
      return { kind: 'group', group, children: [] }
    }
    const next = new Set(visited)
    next.add(group.id)
    const children: GroupTreeNode[] = []
    for (const id of group.memberIds) {
      const sub = groupById.get(id)
      if (sub) {
        children.push(buildGroupNode(sub, next))
        continue
      }
      if (entityIds.has(id)) {
        children.push({ kind: 'entity', entityId: id })
      }
    }
    return { kind: 'group', group, children }
  }

  const rootNodes: GroupTreeNode[] = []
  for (const g of groups) {
    if (memberOfSomeGroup.has(g.id)) continue
    rootNodes.push(buildGroupNode(g, new Set()))
  }
  for (const e of entities) {
    if (memberOfSomeGroup.has(e.id)) continue
    rootNodes.push({ kind: 'entity', entityId: e.id })
  }
  return rootNodes
}

/**
 * Recursively collects all entity IDs reachable from a group (including via sub-groups).
 * Cycle-safe.
 */
export function collectEntityIdsInGroup(
  world: Pick<RennWorld, 'groups'>,
  groupId: string,
): string[] {
  const groups = getGroups(world)
  const groupById = new Map(groups.map((g) => [g.id, g] as const))
  const out: string[] = []
  const visited = new Set<string>()
  function walk(id: string): void {
    if (visited.has(id)) return
    visited.add(id)
    const g = groupById.get(id)
    if (!g) return
    for (const m of g.memberIds) {
      if (groupById.has(m)) walk(m)
      else out.push(m)
    }
  }
  walk(groupId)
  return out
}

/**
 * Replaces any group IDs in `selectedIds` with all reachable entity IDs.
 * Entity IDs pass through unchanged. Order preserved; duplicates removed.
 */
export function expandGroupSelection(
  world: Pick<RennWorld, 'groups' | 'entities'>,
  selectedIds: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of selectedIds) {
    const ids = isGroupId(world, id) ? collectEntityIdsInGroup(world, id) : [id]
    for (const e of ids) {
      if (seen.has(e)) continue
      seen.add(e)
      out.push(e)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Mutation helpers (return a new world; never mutate input)
// ---------------------------------------------------------------------------

function withGroups(
  world: RennWorld,
  groups: EntityGroup[] | undefined,
): RennWorld {
  if (!groups || groups.length === 0) {
    const { groups: _drop, ...rest } = world
    void _drop
    return { ...rest }
  }
  return { ...world, groups }
}

function detachIdsFromAllGroups(
  groups: EntityGroup[],
  ids: ReadonlySet<string>,
): EntityGroup[] {
  return groups.map((g) => {
    const next = g.memberIds.filter((m) => !ids.has(m))
    if (next.length === g.memberIds.length) return g
    return { ...g, memberIds: next }
  })
}

/**
 * Creates a new group containing the given members. Each member is first removed from any
 * other direct group it currently belongs to (single-parent invariant).
 *
 * Returns the new world AND the created group. Returns `null` for the group when no valid
 * members survive filtering (caller should treat as no-op).
 */
export function createGroupFromSelection(
  world: RennWorld,
  selectedIds: readonly string[],
  options: { name?: string; idGenerator?: () => string } = {},
): { world: RennWorld; group: EntityGroup | null } {
  const validIds = uniqueValidMemberIds(world, selectedIds)
  if (validIds.length === 0) return { world, group: null }

  const groups = getGroups(world)
  const idsSet = new Set(validIds)
  const cleaned = detachIdsFromAllGroups(groups, idsSet)
  const newGroup: EntityGroup = {
    id: (options.idGenerator ?? generateId)('group'),
    name: options.name,
    memberIds: validIds,
  }
  return { world: withGroups(world, [...cleaned, newGroup]), group: newGroup }
}

/**
 * Adds members to an existing group (after detaching them from any prior direct group).
 * Members already direct children of the target group are skipped.
 *
 * Refuses to add a group ID that would create a cycle (returns world unchanged for that id).
 */
export function addToGroup(
  world: RennWorld,
  groupId: string,
  ids: readonly string[],
): RennWorld {
  const target = findGroupById(world, groupId)
  if (!target) return world
  const validIds = uniqueValidMemberIds(world, ids).filter((id) => id !== groupId)
  if (validIds.length === 0) return world

  const groups = getGroups(world)
  const groupById = new Map(groups.map((g) => [g.id, g] as const))
  const safeIds = validIds.filter((id) => {
    if (!groupById.has(id)) return true
    return !groupContains(world, id, groupId)
  })
  if (safeIds.length === 0) return world

  const detached = detachIdsFromAllGroups(groups, new Set(safeIds))
  const next = detached.map((g) => {
    if (g.id !== groupId) return g
    const merged = [...g.memberIds]
    for (const id of safeIds) if (!merged.includes(id)) merged.push(id)
    return { ...g, memberIds: merged }
  })
  return withGroups(world, next)
}

export function removeFromGroup(
  world: RennWorld,
  groupId: string,
  ids: readonly string[],
): RennWorld {
  const target = findGroupById(world, groupId)
  if (!target) return world
  const idsSet = new Set(ids)
  const next = getGroups(world).map((g) => {
    if (g.id !== groupId) return g
    const filtered = g.memberIds.filter((m) => !idsSet.has(m))
    if (filtered.length === g.memberIds.length) return g
    return { ...g, memberIds: filtered }
  })
  return withGroups(world, next)
}

/**
 * Removes the group itself; its direct members become loose (or members of nothing).
 * Sub-groups remain in `world.groups` but lose their parent reference (they become roots).
 */
export function dissolveGroup(world: RennWorld, groupId: string): RennWorld {
  const groups = getGroups(world)
  if (!groups.some((g) => g.id === groupId)) return world
  const next = groups
    .filter((g) => g.id !== groupId)
    .map((g) => {
      if (!g.memberIds.includes(groupId)) return g
      return { ...g, memberIds: g.memberIds.filter((m) => m !== groupId) }
    })
  return withGroups(world, next)
}

/**
 * Strips deleted entity IDs from every group's `memberIds`. Empty groups are kept
 * (user may still want to add new members later); callers can dissolve them explicitly.
 */
export function pruneGroupMembers(
  world: RennWorld,
  deletedIds: ReadonlySet<string>,
): RennWorld {
  const groups = getGroups(world)
  if (groups.length === 0 || deletedIds.size === 0) return world
  const next = detachIdsFromAllGroups(groups, deletedIds)
  let changed = false
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] !== next[i]) {
      changed = true
      break
    }
  }
  return changed ? withGroups(world, next) : world
}

/** Toggle (or set) a group's collapsed state in the explorer UI. */
export function setGroupCollapsed(
  world: RennWorld,
  groupId: string,
  collapsed: boolean,
): RennWorld {
  const next = getGroups(world).map((g) => {
    if (g.id !== groupId) return g
    if ((g.collapsed ?? false) === collapsed) return g
    return { ...g, collapsed }
  })
  return withGroups(world, next)
}

/** Renames a group; pass `undefined` to clear the name. */
export function renameGroup(
  world: RennWorld,
  groupId: string,
  name: string | undefined,
): RennWorld {
  const trimmed = name?.trim()
  const next = getGroups(world).map((g) => {
    if (g.id !== groupId) return g
    if ((g.name ?? '') === (trimmed ?? '')) return g
    if (!trimmed) {
      const { name: _drop, ...rest } = g
      void _drop
      return rest
    }
    return { ...g, name: trimmed }
  })
  return withGroups(world, next)
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function uniqueValidMemberIds(
  world: Pick<RennWorld, 'groups' | 'entities'>,
  ids: readonly string[],
): string[] {
  const validEntityIds = new Set(world.entities.map((e) => e.id))
  const validGroupIds = new Set(getGroups(world).map((g) => g.id))
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    if (!validEntityIds.has(id) && !validGroupIds.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Returns true when `ancestorId` transitively contains `descendantId`. */
function groupContains(
  world: Pick<RennWorld, 'groups'>,
  ancestorId: string,
  descendantId: string,
): boolean {
  if (ancestorId === descendantId) return true
  const groups = getGroups(world)
  const groupById = new Map(groups.map((g) => [g.id, g] as const))
  const visited = new Set<string>()
  function walk(id: string): boolean {
    if (id === descendantId) return true
    if (visited.has(id)) return false
    visited.add(id)
    const g = groupById.get(id)
    if (!g) return false
    for (const m of g.memberIds) {
      if (m === descendantId) return true
      if (groupById.has(m) && walk(m)) return true
    }
    return false
  }
  return walk(ancestorId)
}

// ---------------------------------------------------------------------------
// Cross-reference validation (for tests / loader warnings)
// ---------------------------------------------------------------------------

export interface GroupValidationIssue {
  groupId: string
  kind: 'unknown-member' | 'cycle' | 'duplicate-group-id'
  detail: string
}

export function validateGroupReferences(
  world: Pick<RennWorld, 'groups' | 'entities'>,
): GroupValidationIssue[] {
  const issues: GroupValidationIssue[] = []
  const groups = getGroups(world)
  const entityIds = new Set(world.entities.map((e) => e.id))
  const groupById = new Map<string, EntityGroup>()
  for (const g of groups) {
    if (groupById.has(g.id)) {
      issues.push({ groupId: g.id, kind: 'duplicate-group-id', detail: `duplicate group id: ${g.id}` })
    }
    groupById.set(g.id, g)
  }
  for (const g of groups) {
    for (const m of g.memberIds) {
      if (!entityIds.has(m) && !groupById.has(m)) {
        issues.push({ groupId: g.id, kind: 'unknown-member', detail: `unknown member id: ${m}` })
      }
    }
    if (groupContainsItself(groupById, g.id)) {
      issues.push({ groupId: g.id, kind: 'cycle', detail: `cycle detected starting at group: ${g.id}` })
    }
  }
  return issues
}

function groupContainsItself(
  groupById: ReadonlyMap<string, EntityGroup>,
  startId: string,
): boolean {
  const visited = new Set<string>()
  const stack: string[] = [startId]
  let first = true
  while (stack.length > 0) {
    const id = stack.pop()!
    if (!first && id === startId) return true
    first = false
    if (visited.has(id)) continue
    visited.add(id)
    const g = groupById.get(id)
    if (!g) continue
    for (const m of g.memberIds) {
      if (groupById.has(m)) stack.push(m)
    }
  }
  return false
}
