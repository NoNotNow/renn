# Feature: Explorer Groups (Phase A)

Phase A introduces a Blender-style folder hierarchy in the entity explorer. Groups are
**purely organizational** in the Builder — they have no runtime effect, no transform
inheritance, and no Play-mode behavior. Phase B (rigging via Rapier joints) reserves
the optional `rig` field on each group for joint configuration; see
[`feature-rigging-roadmap.md`](feature-rigging-roadmap.md).

## Data model

`RennWorld.groups?: EntityGroup[]` — see [`src/types/world.ts`](../src/types/world.ts).

```ts
interface EntityGroup {
  id: string                 // unique within world
  name?: string              // optional display name (falls back to id)
  memberIds: string[]        // entity IDs and/or sub-group IDs (ordered)
  rig?: RigConfig            // Phase B placeholder, opaque round-trip in Phase A
  collapsed?: boolean        // explorer UI fold state
}
```

Schema: see `EntityGroup` in [`world-schema.json`](../world-schema.json). The
`groups` field is optional; legacy worlds load unchanged.

### Invariants (Phase A)

- A member ID is either an entity ID or a (sub-)group ID.
- An entity belongs to **at most one direct group** ("single-parent invariant").
  Helpers (`createGroupFromSelection`, `addToGroup`) detach members from any prior direct
  group automatically.
- Groups must not form cycles (`addToGroup` refuses cycle-creating moves).
- Sub-groups are allowed via `memberIds`. Cycles are guarded by visited-set traversal.

## Helper API (`src/utils/entityGroups.ts`)

All helpers are pure (no React/DOM/Three) and return new world objects.

| Helper | Purpose |
|--------|---------|
| `getGroups(world)` | Always-defined `EntityGroup[]` (returns `[]` when undefined) |
| `findGroupById(world, id)` | Lookup by ID |
| `findGroupContaining(world, memberId)` | Direct parent (or `null`) |
| `getGroupTree(world)` | Renderable tree: groups (in declaration order) + loose entities |
| `collectEntityIdsInGroup(world, groupId)` | Recursive entity IDs (cycle-safe) |
| `expandGroupSelection(world, ids)` | Replace group IDs with their entity IDs (de-dup) |
| `createGroupFromSelection(world, ids, opts)` | Create a new group; returns `{ world, group }` |
| `addToGroup(world, groupId, ids)` | Add members; refuses cycles; detaches from prior group |
| `removeFromGroup(world, groupId, ids)` | Remove specific members |
| `dissolveGroup(world, groupId)` | Drop the group itself; members become loose |
| `pruneGroupMembers(world, deletedIds)` | Strip deleted IDs from all groups |
| `setGroupCollapsed(world, groupId, c)` | Persist UI fold state |
| `renameGroup(world, groupId, name?)` | Rename or clear name |
| `validateGroupReferences(world)` | Returns issues (cycles, unknown members, dup IDs) |

Tests: [`src/utils/entityGroups.test.ts`](../src/utils/entityGroups.test.ts).

## Explorer UI

- [`src/components/EntityExplorerTree.tsx`](../src/components/EntityExplorerTree.tsx) renders
  the tree + group action toolbar. It is consumed by `EntitySidebar`.
- [`src/components/EntitySidebar.tsx`](../src/components/EntitySidebar.tsx) forwards the
  group props from `Builder.tsx` and applies the search/filter to `visibleEntities`.

### Toolbar (above the tree)

| Button | Enabled when | Calls |
|--------|--------------|-------|
| **Group** | ≥ 2 entities/groups selected | `createGroupFromSelection` |
| **Ungroup** | exactly 1 group selected, no entities | `dissolveGroup` |
| **Add to group** | 1 group + ≥ 1 entity selected, entity not yet a member | `addToGroup` |
| **Remove from group** | ≥ 1 selected entity has a parent group | `removeFromGroup` |

The same enable-rules are unit-tested via `computeGroupActionState`.

### Selection model

`Builder` keeps two selection arrays in `useState`:

- `selectedEntityIds: string[]` — what the gizmo/property panel acts on
- `selectedGroupIds: string[]` — what the group toolbar acts on

Clicking a group expands its entities into `selectedEntityIds` so the existing
gizmo/property panel keeps working unchanged.

### Keyboard shortcuts

Wired in [`src/hooks/useBuilderKeyboardShortcuts.ts`](../src/hooks/useBuilderKeyboardShortcuts.ts):

- `Cmd/Ctrl + G` — group current selection
- `Cmd/Ctrl + Shift + G` — ungroup the selected group

Both are no-ops while focus is on an editable element.

## Persistence

`groups` flows through `updateWorld()` automatically and therefore through:

- IndexedDB save/load (`src/persistence/indexedDb.ts` stores the `world` object verbatim)
- Editor undo/redo (snapshots the whole world via `useEditorHistory`)
- Export/import ZIP

When entities are deleted via `Builder.handleDeleteEntities`, `pruneGroupMembers` runs
inside the same `updateWorld` call so group memberships stay consistent.

## Tests

- Unit: [`src/utils/entityGroups.test.ts`](../src/utils/entityGroups.test.ts)
- Schema: [`src/types/world.groups.test.ts`](../src/types/world.groups.test.ts)
- Component: [`src/components/EntityExplorerTree.test.tsx`](../src/components/EntityExplorerTree.test.tsx)
- Integration: [`src/test/scenarios/groups-create-and-load.integration.test.ts`](../src/test/scenarios/groups-create-and-load.integration.test.ts)
- Keyboard: existing [`src/hooks/useBuilderKeyboardShortcuts.test.ts`](../src/hooks/useBuilderKeyboardShortcuts.test.ts) extended with the new `Cmd+G`/`Cmd+Shift+G` cases.

## Out of Phase A

- Drag-and-drop reordering inside the explorer (buttons only for now).
- Multi-parent membership (an entity in two groups simultaneously). The `memberIds` array
  could technically allow this, but `createGroupFromSelection`/`addToGroup` enforce
  single-parent today.
- Anything that affects runtime behavior — see Phase B (rigging) for joints.
