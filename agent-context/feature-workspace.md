# Feature: Workspace — Unified Behavior Authoring

Replaces the scattered `CodingTabPanel`, `TransformerEditor`, `CustomTransformerCodeTab`,
`EntityScriptEditor`, `ScriptPanel`, `ScriptPanelMultiSelect`, `ScriptDialog`, and the
in-panel `TransformerTemplateDialog` with a single **Workspace** surface. The inspector /
sidebar shows names only; clicking opens the Workspace for editing, assignment, and
management.

**Status:** Phase 1 complete; Phase 2 (Workspace shell) complete; Phase 3–5 complete; Phase 6 (Global IndexedDB library) complete; Phase 7 (thin inspector) complete; Phase 8 (cleanup) complete except E2E smoke test.

---

## Context — current state

| Concern | Current location |
|---|---|
| Transformer stack edit | `CodingTabPanel` → `TransformerEditor` |
| Custom transformer code | Workspace (popout Monaco) |
| Script code edit | `Workspace.tsx` → `WorkspaceScriptsTab.tsx` (Monaco) |
| Script attach/detach/rename | `WorkspaceOrganizeTab.tsx` (Organize > Entity scope) |
| Transformer templates | Workspace Transformers tab (gear drawer + Load template button) |
| Inspector entry point | Right sidebar **`CodingTabPanel`**: transformers + scripts **name lists** (click opens **Workspace**) |

Scripts use `world.scripts: Record<string, ScriptDef>` with `entity.scripts: string[]`. Transformers use **`world.transformers: Record<string, TransformerDef>`** with **`entity.transformers: string[]`** (IDs into the project registry).

---

## Requirements

### R1 — Workspace surface
- Single full-screen (popout) panel replacing the legacy `CustomTransformerCodeTab` popout.
- Three top-level tabs: **Transformers**, **Scripts**, **Organize**.
- **Shell header** (one row): tab buttons; **anchor meta** text (`Entity … · item`, `Global library …`, or prompt to select an entity); then opacity + close.
- One Monaco instance shared between Transformers and Scripts tabs — switching tabs only
  changes the top strip, not the editor.
- On each open, the shared Monaco remounts automatically **100 ms** after it first becomes
  visible (Transformers or Scripts tab), matching the manual **Refresh editor** layout escape hatch.
  This runs **once per page load** only (not again when closing and reopening Workspace).
- **Shift+Escape** opens the Workspace. **Escape** (without Shift) closes it.

### R2 — Transformers tab
- Retains authoring via the horizontal pipeline (**reorder**, **enable**, **drag**, **Configure** drawer JSON incl. **`name` / priority / `params`** for custom stages), live trace on pipeline cards,
  preset **Load template** + **Field reference** where applicable (`ValidatedJsonTextarea`),
  Monaco when a **custom** stage is selected. **Removed:** redundant second toolbar row under the chain (Custom picker, Name, enable pill, Priority) — those fields live on the card / in **Configure**.
- Visual pipeline strip (ordered, since execution order matters).
- **Add** **+** button on the pipeline opens a resizable dialog with **Preset** and **Existing** tabs; existing list stacks one row per organize title (like Organize); **Add** / **Link** / **Copy** as before.
- Clicking a custom stage’s **code** control or selecting the stage selects it for Monaco editing.
- Custom transformer **compile** and **runtime** errors render as floating overlays (`TransformerCodeErrorOverlay`) over the code column so Monaco height stays fixed. Compile errors are debounced (500 ms) while typing and flush on editor blur; pipeline cards still show error borders immediately.

### R3 — Scripts tab
- Same Monaco editor as Transformers tab.
- Top strip shows **assigned scripts** as a visual list/chip row (not pipeline — no order
  arrows).
- Strip controls: select active script, event type selector, `onTimer` interval, Apply,
  Manage (opens Organize > Entity scope pre-filtered to Scripts).
- Shared-script banner when selected script is used by >1 entity.
- No pipeline ordering implied.

### R4 — Organize tab
Three scope subtabs: **Global**, **Project**, **Entity**.

Each scope has **Transformers** and **Scripts** sub-tabs. Items appear as **cards**:
- Cards of the same type (e.g. same event for scripts, or same name/type for transformers) are **stacked** by default to save space.
- Clicking a stack expands it to show all individual cards side-by-side.
- Card content: title (ID/name), type / event, usage count (how many entities reference it).
- Card actions: **Edit** (opens Transformers or Scripts tab with item selected), **Delete**,
  **Copy**, **Move** (scope reassignment — see R5), **Assign** (to entities, where applicable).
- Assignments visible on each card (list of referencing entity names).

**Global scope**
- Persistent storage outside any one project (IndexedDB global store).
- Read/copy to project. Items cannot be directly assigned to entities — assigning copies
  them into the project registry first.
- Entities can **promote** project items here (copy up).

**Project scope**
- `world.transformers` and `world.scripts` for the current world.
- Items can be assigned to entities directly.
- Assignment edits are live (reflected immediately in Entity scope view and in-scene).

**Entity scope**
- Filtered view of project-scope cards showing only items assigned to the selected entity/ies.
- Same cards, same actions — edits here are the same operation as in Project scope
  (no separate data layer).
- When multiple entities are selected, shows the **intersection** of assigned items
  (matching current multi-select script behaviour).

### R5 — Move semantics in Organize
"Move" means **scope/assignment reassignment**, not pipeline reorder:
- Card in Project → assign to entity: adds reference to `entity.transformers` /
  `entity.scripts`.
- Card in Project → promote to Global: copies definition to global store (project item
  stays; entity references unchanged).
- Card in Global → copy to Project: clones definition into `world.transformers` /
  `world.scripts` with a new or confirmed ID.
- Card in Entity → detach: removes reference from entity (definition stays in project).

### R6 — Conflict resolution dialog
When copying/promoting between scopes and the target ID already exists, show a small modal:
- **Overwrite** — replace target definition.
- **Rename** — user edits the suggested ID before confirming.

### R7 — Transformer registry (data model change)
New field: `world.transformers: Record<string, TransformerDef>`.
- `TransformerDef` mirrors `TransformerConfig` plus an optional `name` label.
- `entity.transformers` changes from `TransformerConfig[]` to `string[]` (IDs), mirroring
  `entity.scripts`.
- Migration required: `migrateEntityTransformersToRegistry(worldData)` — extract embedded
  configs into `world.transformers`, replace arrays with ID arrays, generate IDs.
- `world-schema.json` updated for both `world.transformers` and the new `entity.transformers`
  shape.

### R8 — Inspector / sidebar (thin)
- Sidebar code section shows **names only** (transformer slot labels, script IDs).
- Clicking any name opens the Workspace anchored to that item + current entity.
- No editing, dropdowns, or Monaco in the sidebar.

### R9 — No functionality regression
All operations available today must remain reachable in the Workspace:
create, rename, delete, attach, detach, reorder (pipeline), copy, template load, event
change, interval change, params edit, enable toggle, live trace, shared-script warning,
multi-entity edit.

---

## Data model changes

```
// New — world-level transformer registry (mirrors world.scripts)
world.transformers: Record<string, TransformerDef>

interface TransformerDef extends TransformerConfig {
  // inherits: type, name?, priority?, enabled?, inputMapping?, params?, code?
}

// Changed — entity now references by ID (was TransformerConfig[])
entity.transformers: string[]   // transformer IDs into world.transformers

// New — global cross-project store (IndexedDB, separate from world JSON)
globalStore.transformers: Record<string, TransformerDef>
globalStore.scripts: Record<string, ScriptDef>
```

`world.scripts` and `entity.scripts` are **unchanged**.

---

## Migration path

`migrateEntityTransformersToRegistry(worldData: unknown): void`
- For each entity with `transformers: TransformerConfig[]`, generate IDs, write into
  `world.transformers`, replace array with ID array.
- Called in `loadWorld`, `loadWorldFromStatic`, IndexedDB load, and `Play.tsx` (same
  pattern as existing migrations).
- JSON schema updated so validation passes the new shape.

---

## Key files affected

| File | Change |
|---|---|
| `src/types/transformer.ts` | Add `TransformerDef`; update entity `transformers` type |
| `src/types/world.ts` | `Entity.transformers: string[]`; `RennWorld.transformers` |
| `world-schema.json` | New `$defs/TransformerDef`, update `Entity.transformers`, add `world.transformers` |
| `src/scripts/migrateWorld.ts` | Add `migrateEntityTransformersToRegistry` |
| `src/persistence/indexedDb.ts` | Migrations on load; **`globalBehaviorLibrary` store** (v7 added, **v8** bump if missing on existing DBs) + `loadGlobalBehaviorLibrary` / `saveGlobalBehaviorLibrary` |
| `src/types/globalBehaviorLibrary.ts` | **New** — `GlobalBehaviorLibrary` shape (IndexedDB, cross-project) |
| `src/types/workspace.ts` | `WorkspaceTarget`, `WorkspaceShellTabId`, optional `itemSource: 'global'` for IndexedDB items |
| `src/components/Workspace.tsx` | **New** — top-level Workspace panel (tabs + Monaco host); loads/saves global library when open |
| `src/components/workspace/WorkspaceTransformersTab.tsx` | **New** — pipeline strip + editor; **global** branch → `WorkspaceGlobalTransformerPanel` |
| `src/components/workspace/WorkspaceScriptsTab.tsx` | **New** — script chips + event controls + shared Monaco; **global** branch → `WorkspaceGlobalScriptPanel` |
| `src/components/workspace/WorkspaceGlobalTransformerPanel.tsx` | **New** — edit global transformer defs (Monaco, custom params JSON, templates; no preset full-def JSON duplicate) |
| `src/components/workspace/WorkspaceGlobalScriptPanel.tsx` | **New** — edit global scripts (Monaco + events) |
| `src/components/workspace/WorkspaceOrganizeTab.tsx` | **New** — Organize scopes + registry cards (Project / Entity / **Global** + promote / copy / assign) |
| `src/components/workspace/WorkspaceOrganizeCard.tsx` | **New** — card with actions |
| `src/components/workspace/WorkspaceConflictDialog.tsx` | **New** — overwrite / rename modal |
| `src/components/CodingTabPanel.tsx` | Phase 2: **Open Workspace** trigger + routing; Phase 7: thin name-list |
| `src/components/TransformerEditor.tsx` | Reused inside `WorkspaceTransformersTab` |
| `src/components/EntityScriptEditor.tsx` | Absorbed into Workspace; **remove** |
| `src/components/ScriptPanel.tsx` | Replaced by thin inspector list; **remove** |
| `src/components/ScriptPanelMultiSelect.tsx` | Logic moves to Workspace multi-select; **remove** |
| `src/components/ScriptDialog.tsx` | Replaced by Organize tab; **remove** |
| `src/runtime/renderItemRegistry.ts` | Update transformer chain build to resolve IDs from registry |
| `src/scripts/scriptRunner.ts` | No change (already uses `world.scripts` registry) |

---

## Todo / migration plan

### Phase 1 — Data model & migration ✅ COMPLETE
- [x] Add `TransformerDef` type and update `Entity.transformers: string[]` in `types/transformer.ts` and `types/world.ts`
- [x] Add `world.transformers: Record<string, TransformerDef>` to `RennWorld`
- [x] Update `world-schema.json` (`$defs/TransformerDef`, updated entity shape, world-level field)
- [x] Write `migrateEntityTransformersToRegistry` in `migrateWorld.ts` with tests
- [x] Wire migration into all load paths (`loadWorld`, `loadWorldFromStatic`, IndexedDB, `Play.tsx`)
- [x] Update `renderItemRegistry` / `TransformerChain` builder to resolve configs from `world.transformers` by ID
- [x] Run existing tests; fix regressions before proceeding

### Phase 2 — Workspace shell ✅ COMPLETE
- [x] Create `Workspace.tsx` (popout panel, tab strip: Transformers / Scripts / Organize, shared Monaco instance)
- [x] Wire open/close trigger from `CodingTabPanel` (**Open Workspace**; full thin inspector lands Phase 7)
- [x] Implement entry-point routing: `WorkspaceTarget` `{ entityId, tab: 'transformers' \| 'scripts', itemId? }` + anchored strip copy

### Phase 3 — Transformers tab ✅ COMPLETE
- [x] `WorkspaceTransformersTab` + extracted `TransformerPipelineHorizontal` pipeline strip wired into `Workspace.tsx` shared Monaco
- [x] Retain: **custom** Monaco editor only; **`name`/priority/enabled`/which custom** editable via pipeline (**no** redundant toolbar row below the chain above Monaco); reorder, enable toggle, **`params`** for custom stages only via pipeline **gear** JSON drawer (duplicate **Params (JSON)** under Monaco removed); preset tooling uses `ValidatedJsonTextarea` / field reference as before; live trace strip; transformer template dialog; docs split + reset pose toolbar; removed redundant preset full-config JSON column (single-column layout + Monaco placeholder); **preset** transformer **Load template** + **Field reference** sit in the pipeline header’s reserved left gutter (glass chips beside the scrolling strip instead of above the Monaco column); redundant **preset panel** duplicate of IN/OUT (below Monaco) removed — summaries stay on pipeline cards + expandable drawers there
- [x] Removed `CustomTransformerCodeTab` (legacy pop-out deleted; Workspace is the sole editor)

### Phase 4 — Scripts tab ✅ COMPLETE
- [x] Create `WorkspaceScriptsTab` using shared Monaco from Workspace (`TransformerCustomCodeEditor` script `ctx` IntelliSense via `codeIntelliSense` / `scriptCtxEvent`)
- [x] Port top-strip from `EntityScriptEditor` / `ScriptPanelMultiSelect`: assigned chips, Active select, event, interval, Apply, Manage (opens **Organize** > Entity scope, scripts)
- [x] Shared-script banner
- [x] Multi-select intersection logic (from `ScriptPanelMultiSelect`)
- [x] Removed `EntityScriptEditor.tsx`, `ScriptPanel.tsx`, `ScriptPanelMultiSelect.tsx`; `AvatarDialog` migrated to thin list + Workspace overlay

### Phase 5 — Organize tab (Project + Entity scopes) ✅ COMPLETE
- [x] Create `WorkspaceOrganizeTab` with Global / Project / Entity scope subtabs and Transformers / Scripts sub-tabs
- [x] `WorkspaceOrganizeCard` component: title, meta, usage count, assignment list, actions
- [x] Project scope: list `world.transformers` + `world.scripts`; assign/detach to entities; delete; rename (with rename-propagation to all entity arrays)
- [x] Entity scope: filtered view (intersection for multi-select); same cards
- [x] Copy/move between Project ↔ Entity (assign/detach)
- [x] `WorkspaceConflictDialog` (overwrite / rename)
- [x] Removed `ScriptDialog.tsx` (all callers deleted)

### Phase 6 — Global scope (IndexedDB global store) ✅ COMPLETE
- [x] Design global store schema in `indexedDb.ts` (separate object store, keyed outside world)
- [x] Global scope cards in Organize: list, copy to project (with conflict dialog), promote from project
- [x] Assign from Global auto-copies to project registry first

### Phase 7 — Thin inspector ✅ COMPLETE
- [x] Rework `CodingTabPanel` to names-only list (transformer IDs + script IDs / labels)
- [x] Click handler opens Workspace anchored to item (`onTransformerCodePopoutOpen` on row open)

### Phase 8 — Cleanup & polish ✅ COMPLETE
- [x] Delete all removed components (`CustomTransformerCodeTab`, `EntityScriptEditor`, `ScriptPanel`, `ScriptPanelMultiSelect`, `ScriptDialog`, `ScriptPanel.test`)
- [x] Migrate `AvatarDialog` transformer + scripts sections to thin lists + embedded `Workspace` overlay (removed broken `TransformerConfig[]` usage; `entity.transformers` is now `string[]`)
- [x] Update `start-here.md` task → file map
- [x] Update `architecture.md` persistence section (global behavior library) + file map (Workspace + workspace/ directory)
- [x] UI tests (Vitest RTL): Workspace shell close/Escape + Transformers horizontal pipeline; Scripts **Manage** → Organize (**Entity**, scripts); shared-script banner; promote transformer → Global; duplicate promote opens **WorkspaceConflictDialog**; `CodingTabPanel` Scripts subgroup → Open Workspace → Manage (`Workspace.test.tsx`, `CodingTabPanel.test.tsx`; global library load/save spied/mocked where needed).
- [x] **Shift+Escape** shortcut to open Workspace; removed stale `onTransformerCodePopoutOpen` props and comments.
- [ ] E2E smoke test: open Workspace, edit script, apply, verify in Play (and broader integration: Organize assign/detach flows).
