# Feature: EntitySearchPicker

Shared entity search + filter UI used in the Workspace shell, Transformers/Scripts tabs (when no entity is selected), and the left sidebar entity list.

## Component

- [`EntitySearchPicker.tsx`](../src/components/entitySearch/EntitySearchPicker.tsx) — search input, filter button (right inside field), results dropdown, recent section.
- [`EntitySearchFilterPopover.tsx`](../src/components/entitySearch/EntitySearchFilterPopover.tsx) — sidebar-equivalent filters + **Sort by history** + **Playable avatar**.
- [`useEntitySearchPicker.ts`](../src/components/entitySearch/useEntitySearchPicker.ts) — wraps [`useEntityListFilters`](../src/components/entitySidebar/useEntityListFilters.ts) for shared state (sidebar passes `pickerState` into the picker).

## Filters (parity with left sidebar)

| Control | Maps to |
|---|---|
| 3D model | `filterHasModel` tri-state |
| Shape | `filterShape` |
| Transformers | `filterHasTransformers` tri-state |
| Size min/max | `filterSizeMin` / `filterSizeMax` |
| Playable avatar | `filterPlayableAvatar` (uses `entityIsPlayableAvatar`) |
| Sort by history | `sortByHistory` — orders results by project MRU list |

## Work history

- Stored per project on the IndexedDB project row as `entityWorkHistory: string[]` (not in world JSON).
- Updated via `recordEntityWorkHistory` in `ProjectContext` when the user selects an entity in the builder.
- Capped at 20 ids ([`entityWorkHistory.ts`](../src/utils/entityWorkHistory.ts)); pruned when entities are deleted.
- **Recent** section in the picker shows history entries that still exist when the search box is empty.

## Variants

| Variant | Usage |
|---|---|
| `compact` | Workspace shell header — ~10em wide; shows selected entity/item label by default; magnifying glass on hover; search activates on click; filter sits outside the field |
| `panel` | Transformers/Scripts empty state, sidebar entity list |

## Integration points

- [`Workspace.tsx`](../src/components/Workspace.tsx) — shell header (replaces click-to-open dropdown).
- [`WorkspaceTransformersTab.tsx`](../src/components/workspace/WorkspaceTransformersTab.tsx) — top strip when no entity selected.
- [`WorkspaceScriptsTab.tsx`](../src/components/workspace/WorkspaceScriptsTab.tsx) — replaces “Select an entity…” message.
- [`EntityListPanel.tsx`](../src/components/entitySidebar/EntityListPanel.tsx) — replaces separate search + collapsible filters; Add + search stay fixed; only the tree list scrolls.
- [`EntityExplorerTree.tsx`](../src/components/EntityExplorerTree.tsx) — group-action toolbar fixed above a scrollable tree; selected row scrolls into view inside that region.
