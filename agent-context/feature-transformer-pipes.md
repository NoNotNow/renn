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

| Term | Meaning |
|---|---|
| **Pipe** | Reusable behavior recipe: ordered stages + optional tunable params |
| **Manifold** | A pipe whose members include other pipes (nested, n-level). `TransformerPipe.members` mixes `{ kind: 'stage' }` and `{ kind: 'pipe' }` |
| **Pipe stack** | Ordered pipe instances on one entity: `entity.transformerPipeStack` |
| **Binding** | One stack entry (`pipeId`, per-entity `params`, optional `mode: 'linked' \| 'copy'`) |

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
transformerPipeStack?: TransformerPipeBinding[]
transformers?: string[]  // flattened stage ids; NOT traversed per frame

// RennWorld
transformerPipes?: Record<string, TransformerPipe>
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
| `src/utils/transformerPipeResolve.ts` | Manifold flatten, stack helpers, param merge |
| `src/hooks/usePipeNavigator.ts` | Focus path state (up/left/right, drill-in) |
| `src/hooks/usePipeNavController.ts` | World mutations + dialogs wiring |
| `src/components/workspace/pipeNav/` | Sidebar, tree, `PipeCard` (share / enable / config chrome), focused strip, `PipeAddDialog` |
| `src/components/workspace/WorkspaceTransformersTab.tsx` | Auto-wrap on select, Add Pipe UI, Link banner |
| `src/components/workspace/WorkspaceOrganizeTab.tsx` | Organize Pipes sub-tab |
| `src/persistence/indexedDb.ts` | Global library persistence |

#### Tree navigation (Transformers tab sidebar)

- **Docked sidebar** [`TransformerPipeNavSidebar.tsx`](../src/components/workspace/pipeNav/TransformerPipeNavSidebar.tsx): resizable, **collapsed by default** (slim `»` toggle); Up / Left / Right; editable pipe title; tree mirrors stack → nested `members`.
- **Tree actions**: hover delete (×), context menu (add before / after / child, **Edit params**, delete). Mutations in [`pipeNavMutations.ts`](../src/utils/pipeNavMutations.ts); wired via [`usePipeNavController.ts`](../src/hooks/usePipeNavController.ts).
- **Pipe params**: each stack binding stores instance values in `TransformerPipeBinding.params` (per entity only — never shared). On assign, `paramDefs[].default` is copied into `binding.params` once. **Pipe cards** and **tree row controls** expose a settings button; pipe rows also offer **Edit params** in the context menu. Both open [`PipeConfigDrawer`](../src/components/workspace/pipeNav/PipeConfigDrawer.tsx) with [`PipeParamsStrip`](../src/components/workspace/pipeNav/PipeParamsStrip.tsx) when `paramDefs` are defined, or [`PipeParamsJsonEditor`](../src/components/workspace/pipeNav/PipeParamsJsonEditor.tsx) for raw JSON otherwise.
- **Tree drag-and-drop**: reorder stack / members; **move transformer stages between pipes** (drop on another stage, stack pipe row, or nested pipe row); nest stack pipe into nested pipe; promote nested pipe to entity stack; re-parent nested pipes (cycle guard via [`wouldNestCreateCycle`](../src/utils/pipeNavResolve.ts)). Stages dropped on the entity root are rejected.
- **Strip**: one level at a time — pipe cards at entity root; stages + nested pipe cards inside a manifold (mixed order preserved when pipes and stages interleave).
- **Add flows**: strip `+` menu ([`PipeAddDialog.tsx`](../src/components/workspace/pipeNav/PipeAddDialog.tsx)); header **+ Add Pipe** removed (duplicate). **Leaf level** (gray `+`): `entity_stages`, or `pipe_members` with no nested pipe cards in the focused view — opens **Add to pipeline** (transformer preset/existing + optional pipe sections). **New pipe** / **Existing pipe** at leaf level append a **stack sibling** (after the current stack pipe), not a nested member; use the **Child pipe** tab to nest. **Pipe level** (yellow `+`): entity root with multiple stack pipes, or a manifold showing nested pipe cards — pipe-centric add sections.
- **Auto-wrap**: fresh entity → `Pipe1` via `ensureEntityPipeStack`; legacy ungrouped stages → non-blocking **Wrap into pipe** banner.
- **Runtime params**: ephemeral projection via [`pipeStageResolve.ts`](../src/utils/pipeStageResolve.ts). **Pipe instance isolation** — each stack binding owns its runtime params; stages under that binding receive **only** that binding’s effective pipe params (`binding.params` at stack root, plus `scopeParams` for nested scopes within the same binding). **No merge** of stage registry `params`, and **no cross-binding merge** between stack siblings (duplicate linked pipes, linked + copy, etc.). Projection is keyed by **flat index** in `entity.transformers`. Entities **without** a pipe stack still use stage registry `params` directly. Never written back to world JSON. **Watch / runtime errors**: `resolveSelectedFlatStackIndex` in [`pipeNavResolve.ts`](../src/utils/pipeNavResolve.ts) maps pipe-nav focus (stack path + stage) → `configStackIndex`; registry `stageId` alone is ambiguous when the same pipe is linked twice. **Monaco / code editor**: uses `selectedEditorIndex` (index within the focused pipe’s stage list); do not use the flat stack index to index `editorStageConfigs`. **Live sync**: pipe param or stage param edits call `resolveMergedTransformerConfigsForEntitySync` → `SceneView.syncEntityTransformers` for the edited entity only.

#### Pipe params + enable cascade

1. **Pipe-instance projection** — for entities with a pipe stack, each stage’s runtime `params` come **only** from the **stack binding** that owns that stage (and nested `scopeParams` within that binding). Example: two `Pipe1` instances on one entity with `{ test1: '' }` and `{ test2: '' }` → all stages under the first binding get `{ test1: '' }`, all stages under the second get `{ test2: '' }` only. Stage registry `params` are **not** merged into piped runtime projection.
2. **Flat (no pipe stack)** — `entity.transformers` stages use registry `params` as today.
3. **Disable cascade** — when a pipe scope is disabled, all nested pipes and stages under it are effectively disabled (omitted from flatten, greyed in UI, skipped at runtime).
4. **Scope storage** — stack root uses `binding.params`; nested scopes use `binding.scopeParams[scopeKey]` keyed by pipe-nav path.
5. **Legacy migration** — `migrateTransformerPipeDefaultParams` moves old `pipe.defaultParams` into bindings on load, then strips the field.

---

### Implementation Plan

- [x] Phase 1: Types & Schema
- [x] Phase 2: Utilities (Core logic + Unit tests)
- [x] Phase 3: Transformers Tab (pipe nav sidebar, focused strip, + menu)
- [ ] Phase 4: Organize Tab (Management + Global Scope)
- [x] Phase 5: Verification & Polish (pipe nav tree + strip tests)
