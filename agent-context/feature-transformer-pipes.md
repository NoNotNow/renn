# Transformer Pipes

### Context
Add **Transformer Pipes** — named, reusable, ordered sequences of transformer stages that can be shared across entities or used as independent copies. This enables users to define a behavior pipeline once (e.g. a \"car controller\" or \"platformer movement\" pipe) and apply it to many entities, with the option to live-link (shared edits propagate) or copy (independent clone).

---

### Requirements

#### FR1 — Automatic pipe wrap on entity select
- When an entity is opened in the Workspace Transformers tab and has **no pipe stack yet**, it is automatically wrapped in a new pipe named **Pipe1**, **Pipe2**, … (next free number in `world.transformerPipes`).
- **Fresh entity** (no transformers): an empty `Pipe1` is created on `entity.transformerPipeStack` under the hood.
- **Entity with flat stages** (legacy `entity.transformers` only): existing stage ids move into the new pipe's `members`; the stack binding is linked.
- No manual **Save as Pipe** step — wrapping happens on selection via `ensureEntityPipeStack` in `src/utils/pipeNavMutations.ts`.

#### FR2 — Add Pipe (from Transformers tab)
- A **\"+ Add Pipe\"** dropdown/button in the pipeline header lists all pipes in `world.transformerPipes`.
- Selecting a pipe shows a mode selector: **Link** or **Copy**.
- **Link**: appends a stack binding to the shared `pipeId`; flattened `entity.transformers` uses the pipe's shared registry stage ids. Member add/remove on the pipe definition propagates to every linked entity.
- **Copy**: deep-clones the pipe manifold (new pipe id + `"(copy)"` name) and clones all stage configs into `world.transformers` for this entity. Binding uses `mode: 'copy'`; structure edits affect only the clone.
- The existing pipeline is replaced (with an undo-able history push).

#### FR3 — Shared Pipe Banner
- When `entity.transformerPipe` is set, a banner appears above the pipeline strip:
  > **Shared pipe: [pipe name]** — editing stages here affects all linked entities. [Decouple]
- **Decouple**: calls `cloneEntityTransformersIntoWorld` to create independent registry entries for this entity, then clears `entity.transformerPipe`.
- If the pipe no longer exists in `world.transformerPipes` (deleted), the banner shows a warning: \"Linked pipe not found — [Decouple]\" and decouple auto-clears the stale reference.

#### FR4 — Organize > Transformer Pipes sub-tab
- The Organize tab gains a third sub-tab: **Transformer Pipes** (alongside Transformers and Scripts), present in all three scope views (Global, Project, Entity).
- **Project scope**: lists all `world.transformerPipes` as cards.
- **Entity scope**: shows only pipes linked to the selected entity (i.e. where `entity.transformerPipe` matches).
- **Global scope**: lists pipes in the global IndexedDB store.
- **Pipe card** shows: pipe name, stage count, usage count (number of entities with `entity.transformerPipe === pipeId`), list of linked entity names.
- **Card actions**: Edit (opens Transformers tab with a linked entity selected), Rename, Delete (with warning if entities are linked), Assign (opens mode dialog → Link or Copy), Promote to Global, Copy from Global to Project.

#### FR5 — Pipe Editing (live propagation)
- When an entity is linked to a pipe and the user edits a stage in the Transformers tab, the change is written to `world.transformers` as normal (same registry IDs). Since all linked entities share those IDs, the change propagates automatically.
- The banner reminds the user that changes affect all linked entities.

#### FR6 — Delete Pipe
- Deleting a pipe from Organize shows a confirmation if any entities are linked.
- On confirm: `entity.transformerPipe` is cleared for all linked entities (their `entity.transformers` arrays remain intact — they keep their stages, just lose the link).

#### FR7 — Global Scope
- Pipes can be promoted from Project to Global (copied to IndexedDB `globalBehaviorLibrary.transformerPipes`).
- Pipes can be copied from Global to Project (with conflict dialog if name/ID already exists).
- Assigning a global pipe to an entity auto-copies it to the project registry first.

---

### Vocabulary

Canonical terms: [nomenclature.md](./nomenclature.md) (pipe, manifold, stack, binding, param scopes, stage runtime, strip scope).

### Data Models

```ts
type TransformerPipeMember =
  | { kind: 'stage'; stageId: string }
  | { kind: 'pipe'; pipeId: string }

interface TransformerPipeBinding {
  pipeId: string
  params?: Record<string, unknown>
  scopeParams?: Record<string, Record<string, unknown>>
  mode?: 'linked' | 'copy'
  enabled?: boolean
}

export interface TransformerPipe {
  id: string
  name: string
  stageIds: string[]          // legacy flat leaf list
  stages: TransformerConfig[] // copy template snapshots
  members?: TransformerPipeMember[] // manifold source of truth when set
  paramDefs?: PipeParamDef[]  // `default` seeds binding.params on assign only
  createdAt?: number
}

// Entity — pipe stack + flattened runtime cache
interface Entity {
  transformerPipeStack?: TransformerPipeBinding[]
  transformers?: string[]  // flattened stage ids; NOT traversed per frame
}

// RennWorld
interface RennWorld {
  transformerPipes?: Record<string, TransformerPipe>
}
```

**Performance:** manifold/stack resolution runs only on assign, save, or decouple (`flattenPipeStageIds` in `src/utils/transformerPipeResolve.ts`). The runtime chain reads `entity.transformers` directly — zero per-frame tree walks.

Legacy `entity.transformerPipe` migrates to a single-entry stack on load (`migrateTransformerPipeToStack`).

---

### Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Pipe storage | `world.transformerPipes: Record<string, TransformerPipe>` | Mirrors `world.transformers` pattern; stays in world JSON |
| Entity link | `entity.transformerPipeStack: TransformerPipeBinding[]` | Multiple pipes per entity; params per binding |
| Nested pipes | **Manifold** via `members` | n-level grouping without duplicating stage lists |
| Runtime cache | `entity.transformers` flattened once | Hot path stays O(stages), not O(pipes × depth) |
| Pipe definition | `members` (manifold) or `stageIds` (legacy flat) | Backward compatible; `stageIds` normalized at read |
| Assign modes | Linked vs Copy per binding | User-chosen at assign time |
| Add pipe | **Append** to stack by default | Several pipes on one entity without replacing |
| Editing propagation | Linked stages update shared registry IDs | Same mechanism as shared scripts |

---

### UI Flows

#### Auto-wrap on select
1. User selects an entity in the Transformers tab (or opens a fresh entity there).
2. If `getEntityPipeStack(entity)` is empty, `ensureEntityPipeStack` creates **PipeN** and appends it to the stack.
3. Flat stages become members of that pipe; empty entities get an empty pipe ready for stages.
4. Focus auto-drills into the new pipe so the stage strip (or empty + menu) is immediately editable.

#### Add Pipe
1. User selects pipe from \"+ Add Pipe\" dropdown.
2. Dialog asks for Mode (Link/Copy).
3. Appends a binding to `entity.transformerPipeStack` and concatenates flattened stage ids onto `entity.transformers`.
4. Manifold pipes flatten recursively (child pipes first in `members` order).

#### Organize Tab
- Third sub-tab \"Transformer Pipes\".
- Cards with usage counts and quick actions.

---

### Key Files Affected

| File | Change |
|---|---|
| `src/types/transformer.ts` | Add `TransformerPipe` interface |
| `src/types/world.ts` | Add `transformerPipes` to `RennWorld`, `transformerPipe` to `Entity` |
| `src/types/globalBehaviorLibrary.ts` | Add `transformerPipes` to `GlobalBehaviorLibrary` |
| `world-schema.json` | Update JSON schema with new fields |
| `src/utils/commitTransformerConfigsToWorld.ts` | Assign, save, decouple, delete |
| `src/utils/transformerPipeResolve.ts` | Manifold flatten, stack helpers |
| `src/utils/paramScopes.ts` | Three-scope merge rule + local/merged projections (single owner) |
| `src/utils/pipeStageResolve.ts` | Chain-build walk behind `resolveEntityStageRuntime` → `EntityStageRuntime`; consumes `paramScopes` for runtime merged params |
| `src/hooks/usePipeNavigator.ts` | Focus path state (`goUp`/`goLeft`/`goRight`, `drillInto`, `setPath`) |
| `src/editor/pipeNavEdit.ts` | Pipe-nav edit seam: `PipeNavEditIntent` → `{ world, nav, syncEntityIds }`; owns mutation choice + nav-path reconciliation |
| `src/hooks/usePipeNavController.ts` | React wiring only (13-key return): focus/dialog state, applies `resolvePipeNavEdit` results; navigation stays in tab via `usePipeNavigator` |
| `src/components/workspace/pipeNav/` | Sidebar, tree, `PipeCard`, focused strip, `PipeAddDialog`, `pipeStageCallbacks.ts` |
| `src/components/workspace/WorkspaceTransformersTab.tsx` | Auto-wrap on select, Add Pipe UI, Link banner |
| `src/components/workspace/WorkspaceOrganizeTab.tsx` | Organize Pipes sub-tab |
| `src/persistence/indexedDb.ts` | Global library persistence |

#### Tree navigation (Transformers tab sidebar)

- **Sidebar:** [`TransformerPipeNavSidebar.tsx`](../src/components/workspace/pipeNav/TransformerPipeNavSidebar.tsx) — collapsed by default, resizable, Up/Left/Right, title edit, tree = stack + nested `members`.
- **Edits:** structural/tree → [`pipeNavEdit.ts`](../src/editor/pipeNavEdit.ts) via [`usePipeNavController.ts`](../src/hooks/usePipeNavController.ts); low-level mutations in [`pipeNavMutations.ts`](../src/utils/pipeNavMutations.ts).
- **Params UI:** [`PipeConfigDrawer`](../src/components/workspace/pipeNav/PipeConfigDrawer.tsx) + strip or JSON editor; both use `resolveLocalScopeParams` (see [nomenclature.md § Param scope merge rules](./nomenclature.md#param-scope-merge-rules)).
- **Controller surface (13 keys):** nav + `stageScope` + `writeFocusedStages` + spread bundles `pipeControls`, `addPipe`, `treeActions`, `nameDialogProps`. Stage flush/undo/sync → [`commitStageEdit`](../src/editor/commitStageEdit.ts); `writeFocusedStages` is a bare writer only.
- **D&D:** stack/member reorder, stage moves between pipes, nest/promote/re-parent (cycle guard: [`wouldNestCreateCycle`](../src/utils/pipeNavResolve.ts)).
- **Strip / scope:** one level per view; stage strip host modes → [nomenclature.md § Stage strip scope](./nomenclature.md#stage-strip-scope). Add flows: [`PipeAddDialog.tsx`](../src/components/workspace/pipeNav/PipeAddDialog.tsx) (leaf vs pipe-level `+` semantics unchanged).
- **Auto-wrap:** `ensureEntityPipeStack` on select; legacy flat stages → optional wrap banner.
- **Runtime params & enable cascade:** [`resolveEntityStageRuntime`](../src/utils/pipeStageResolve.ts) + [`paramScopes.ts`](../src/utils/paramScopes.ts) — merge rules, editing vs merged, disable cascade, strip grey-out → [nomenclature.md](./nomenclature.md) (Entity stage runtime + Param scope merge rules).

#### Tree ↔ strip sync and stage settings

- **Stages are addressed by id in the strip.** `StripItem.index` is the position among *all* members (stages and nested
  pipes mixed); `stageIds` / `stageConfigs` list only the stages. `PipeFocusedStrip` therefore looks a stage card up by
  `stageId` (registry entry + `stageIds.indexOf`), never by member index — index math used to drop every stage that
  follows a nested pipe (`[stage, pipe, stage]` showed the tree row but no card). Regression:
  [`PipeFocusedStrip.mixedMembers.test.tsx`](../src/components/workspace/pipeNav/PipeFocusedStrip.mixedMembers.test.tsx).
- **Stage rows in the tree have a settings bar** (on hover / when selected): a power dot (enable / disable, same switch as the
  card) and a gear. The gear selects the stage (focus + strip) and sets `stageConfigRequest { stageId, token }` in
  `WorkspaceTransformersTab`; the matching card opens its config drawer (token is only honoured for ~2 s so a re-mounted card
  does not pop the drawer open later). Row menu "Edit params" does the same. Test:
  [`PipeNavTree.stageSettings.test.tsx`](../src/components/workspace/pipeNav/PipeNavTree.stageSettings.test.tsx).

#### Stage commits → world (`commitStageEdit`)

Whole-stack and patch stage edits from the Transformers tab route through [`commitStageEdit`](../src/editor/commitStageEdit.ts). Flush / undo policy by `StageEditIntent['kind']` — see [feature-world-update-reload.md § Stage edits in WorkspaceTransformersTab](./feature-world-update-reload.md#stage-edits-in-workspacetransformerstab).

**Scope split:**

- **`stageScope`** (`'flat' | 'pipe'`) — on `usePipeNavController`: `'flat'` when the entity has no pipe stack and the strip shows bare `entity.transformers`; `'pipe'` otherwise.
- **`writeFocusedStages`** — `StageStackWriter` for the focused pipe's stage list. Calls `commitFocusedStageConfigs`, then `onWorldChange`; returns the next world so `commitStageEdit` can run merged pipe-param sync. Does **not** push undo or flush code itself.
- **`WorkspaceTransformersTab`** picks the writer: flat pipeline handlers use `writeFlatStack`; strip handlers use `writeStripStack` (`writeFocusedStages` when `stageScope === 'pipe'`, else `writeFlatStack`).

#### Pipe-nav edits → world (`pipeNavEdit`)

Everything that is *not* a stage-strip commit — create/add/rename pipe, enable toggle, pipe params, decouple, tree delete/insert/drop, and the first-pipe bootstrap — routes through [`resolvePipeNavEdit`](../src/editor/pipeNavEdit.ts). It is the sibling seam to `commitStageEdit`, and the two do not overlap.

```ts
resolvePipeNavEdit(intent, { world, entityId, focus, prompts }): { world, nav?, syncEntityIds? } | null
```

- **Pure.** No writes, no undo push, no React state. The controller applies the result in a fixed order: world write (via `applyPipeNavWorldWrite` when Builder injects `applyWorldWrite`, else undo checkpoint + `onWorldChange`) → `setPath` → merged-param sync.
- **`null` means no-op**, and is what stops a spurious undo entry: entity gone, confirmation declined, illegal drop, or the mutation left the world untouched with the focus unmoved.
- **`nav` is the reconciled focus.** Structural edits clamp the path against the **post-edit** entity via `reconcilePipeNavPath`, so a delete can never leave the focus on a dangling stack index. This is the logic that justifies the module.
- **`prompts`** (`confirm` / `warn`) is injected — `windowPipeNavPrompts` in the app, a recording stub in tests. No `window.confirm` reaches the resolver.
- **`PIPE_NAV_EDIT_POLICY`** is the only place pipe-nav undo policy is decided. `ensurePipeStack` is the sole `pushUndo: false` row (an automatic migration, not a user action).

Add an intent rather than branching at a call site. Tests live at the interface in [`pipeNavEdit.test.ts`](../src/editor/pipeNavEdit.test.ts) (policy-table coverage, no-op table, reconciliation, purity).

> **Bootstrap effect gotcha:** the `ensurePipeStack` effect in `usePipeNavController` deliberately does **not** depend on `commit` (and so not on `focus`). That intent moves the focus, so a host that does not feed the new world back would re-trigger the effect forever.

#### Config patch vs pipe reorder

| User action | Commit path | Touches |
|---|---|---|
| Gear JSON apply, enable toggle, custom rename | `commitStageEdit({ kind: 'patch', ... })` → `patchStageConfigInWorld` | `world.transformers[id]` only |
| Drag-reorder, add/remove stage (pipe scope) | `commitStageEdit({ kind: 'commitStages' \| 'reorder', ... })` → `writeFocusedStages` → `commitFocusedStageConfigs` | pipe `members` + entity flatten via `updateFocusedStageOrder` |
| Drag-reorder, add/remove stage (flat / no pipe stack) | `commitStageEdit` → `writeFlatStack` → `applyStageWorldWrite` when Builder injects `applyWorldWrite`, else `commitStacksRaw` | `entity.transformers` + registry |

Config patches must **not** call `syncPriorities`, `updateFocusedStageOrder`, or `syncAllEntitiesUsingPipes`.

---

### Implementation Plan

- [x] Phase 1: Types & Schema
- [x] Phase 2: Utilities (Core logic + Unit tests)
- [x] Phase 3: Transformers Tab (pipe nav sidebar, focused strip, + menu)
- [ ] Phase 4: Organize Tab (Management + Global Scope)
- [x] Phase 5: Verification & Polish (pipe nav tree + strip tests)

## Assigning pipes from the Transformers tree, library dialog, tree toolbar

- **Tree toolbar** (`PipeNavTree`): `+ Pipe` (opens `PipeLibraryDialog`), `Expand all` (entity + every nested pipe reachable from the stack, via `collectNestedPipeIds`), `Collapse all` (keeps the entity row open).
- **`PipeLibraryDialog`**: project pipes + global-library pipes, search, structure preview (`PipeStructurePreview` over `summarizePipe` in `src/utils/pipeSummary.ts`), `Link (shared)` / `Copy (own)`. Double-click links.
- **Intent `assignLibraryPipe`** (`pipeNavEdit.ts`, undo-pushing) → `assignLibraryPipeToEntity` (`src/utils/assignLibraryPipe.ts`): a global pipe is first copied into the project (recursive `copyGlobalPipeIntoWorld`; an existing project pipe with the same id is reused), then appended to the entity's pipe stack at root level.
- **Organize → Pipes cards** show the pipe name (id in the subtitle), "N stages · M nested pipes", a collapsible Structure outline, and labeled actions (`Edit`, `Add to project`, `Assign`, …).

## Deleting a pipe deletes its contents

`deletePipeFromWorld` removes the pipe, its stages (registry + every entity's `transformers`) and nested pipes that nothing else references; stages/pipes still referenced by a surviving pipe or entity stack are kept. Tree delete (stack pipe / nested pipe) unlinks first and applies the same cascade only when the pipe is no longer referenced anywhere (`dropIfOrphaned` in `pipeNavEdit.ts`); a pipe shared with another entity or pipe only loses this reference.

## Editing stages inside composite pipes (guards)

- Entities run stages **sorted by `priority` across the whole composite stack**. The strip hands over re-indexed priorities (0..n); `preserveCompositePriorities`
  (in `commitFocusedStageConfigs`) maps that back so other pipes' stages keep their values and a new stage lands between its neighbours.
  Library stages added through the add dialog's **Global library** tab keep their own priority (`insertGlobalTransformerStage`).
- `updateFocusedStageOrder` merges the new stage order into the members without moving nested pipes (`mergeStageOrderIntoMembers`).
- `RenderItemRegistry.syncEntityTransformers` used to write live configs into the document's registry under `${entityId}_tf${i}`, overwriting real stages
  with that name (e.g. a new stage got the car actuator's config). It now uses `${id}__live${i}` in a copy of the registry.
- At the **pipe-siblings level** (strip shows pipes) the `+` dialog has no Transformer tab: stages live inside a pipe, open one first (the dialog says so).

## Top-level stages (no pipe required) and "Wrap all"

Stages may sit **directly on an entity**, with or without a pipe stack — the old "every stage must live in a pipe" rule (auto-wrapping a fresh entity into `Pipe1`,
the "ungrouped stages" banner) is gone.

- Model: `entity.transformers` = the stack's stages (enabled flatten) followed by the entity's top-level stages. A top-level stage is "on the entity but in no pipe"
  (`topLevelStageIds`, `src/utils/pipeStageResolve.ts`); the runtime walk gives it its own params/enable flag after the stack's stages (disabled ones stay in the list).
- Because top-level is inferred, edits that take a stage out of a pipe go through `dropStagesLeftBehind(prev, next)` so it does not resurface as top-level
  (`deletePipeMember`, `moveMemberStage`, `deleteStackBinding`, `commitFocusedStageConfigs`, `deletePipeFromWorld`).
- UI: the `+` dialog offers **Transformer** at every level (at the entity level it adds a top-level stage, at a pipe level a member); the entity-level strip shows pipes
  and top-level stages together; the tree lists top-level stages under the entity (delete, settings, drag into a pipe; dragging a pipe stage onto the entity row
  makes it top-level).
- **Wrap all** (tree toolbar, intent `wrapAllInPipe`, `wrapEverythingIntoPipe`): wraps the entity's pipes (as nested members, binding params moved to the matching nested scope)
  and its top-level stages in one new pipe; what runs stays the same.

## Library fixes reach every consumer (`origin`)

Stages and pipes copied from the global library carry `origin: { globalId, hash }` (`src/globalPipeline/globalOrigin.ts`; set by `copyGlobalPipeIntoWorld`, the add dialog's Global tab).
`updateWorldFromGlobalLibrary(world, library)` compares each copy with the current library:

- unchanged copy + library moved on → the copy is updated (stage code/name; pipe member tree, `paramDefs`; missing stages/child pipes are copied; entities re-sync and drop stages the pipe lost). **Params, enabled flags, priorities stay local.**
- copy edited locally + library moved on → untouched, reported as `diverged`.
- copies made before origins existed (same id and identical content as a library entry) are *adopted*, so later fixes reach them too.

When it runs: automatically when a project is opened / its registry changes (`useGlobalLibraryUpgrade` in `Builder`, silent, no undo entry, scene rebuild only if code/structure changed), and on demand via Organize → Project → **⟳ Sync with library**.
The library itself is refreshed from `public/global/` by checksum (`mergeShippedGlobalBehaviorLibrary`), so fixing e.g. the AV stack in the repo and deploying updates consumers on their next open.
Fingerprint: custom stages = type + code; pipes = member tree + paramDefs.

## One add dialog, drag = run order

- **One dialog everywhere**: the strip's `+` and the tree's `+ Add` open the same `PipeAddDialog` (state lifted into `WorkspaceTransformersTab`). Tabs: **Transformer** (preset / existing / global library),
  **New pipe**, **Existing pipe** (`PipeLibraryPanel`: project + global-library pipes, search, structure preview, Link / Copy), **Child pipe** (inside a pipe). Every level offers all of them;
  a library pipe lands at the focused level (`assignLibraryPipe` is focus-aware like `addExistingPipe`).
- **Drag to reorder** (stage cards drag by their card, pipe cards by their header row; `StripSlot` in `PipeFocusedStrip` listens for the bubbling dragstart): entities run stages sorted by `priority`, so strip order = run order.
  Entity level shows pipes (by their first stage) and top-level stages in that order; dragging uses `moveEntityLevelItem` (stack order for pipes, a fitting priority for stages);
  inside a pipe with mixed members `moveMemberItem` reorders the member and fits priorities (`src/utils/stripOrder.ts`, intents `reorderEntityLevel` / `reorderMembers`).
  Pipes never get their priorities rewritten; dropping on an item takes its slot. A new top-level stage joins the end of the run order.

- **Tree and strip are one view**: the tree lists entity children with the same `entityLevelItems` order the strip uses (run order, not "pipes first"), and tree drags use before / after / into
  zones (top / bottom edge = insert before / after; middle of a pipe row = drop into it; stage rows split in halves). Same-level before/after goes through the same `moveEntityLevelItem` / `moveMemberItem`
  as the strip, so both always agree. Pipe cards have a × (delete through the tree-delete edit, with its confirmation).

**Schema gotcha**: `world-schema.json` is hand-maintained and strict (`additionalProperties: false`): a new field on `TransformerConfig` / `TransformerPipe` (like `origin`) must be added there too, otherwise project load strips it with an "Unknown or deprecated fields" warning. `validate.origin.test.ts` guards `origin`.
