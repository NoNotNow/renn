# Transformer Pipes

### Context
Add **Transformer Pipes** — named, reusable, ordered sequences of transformer stages that can be shared across entities or used as independent copies. This enables users to define a behavior pipeline once (e.g. a \"car controller\" or \"platformer movement\" pipe) and apply it to many entities, with the option to live-link (shared edits propagate) or copy (independent clone).

---

### Requirements

#### FR1 — Save as Pipe
- In the Workspace Transformers tab header, a **\"Save as Pipe\"** button (or chip) is available when the entity has at least one transformer stage.
- Clicking opens a small inline dialog: pipe name input + mode selector (**Linked** / **Copy**).
- **Linked mode**: the current `entity.transformers` IDs become the pipe's `stageIds`. `entity.transformerPipe` is set to the new pipe ID. No new registry entries are created.
- **Copy mode**: a new pipe is created with a snapshot of the current configs (stored inline in `TransformerPipe.stages`). `entity.transformerPipe` is NOT set (entity remains independent). The pipe acts as a reusable template.
- The new pipe is written to `world.transformerPipes`.

#### FR2 — Add Pipe (from Transformers tab)
- A **\"+ Add Pipe\"** dropdown/button in the pipeline header lists all pipes in `world.transformerPipes`.
- Selecting a pipe shows a mode selector: **Link** or **Copy**.
- **Link**: entity's `transformers` array is replaced with the pipe's `stageIds`. `entity.transformerPipe` is set.
- **Copy**: `cloneEntityTransformersIntoWorld` is called with the pipe's stage configs, creating fresh registry entries. `entity.transformerPipe` is NOT set.
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
  mode?: 'linked' | 'copy'
}

export interface TransformerPipe {
  id: string
  name: string
  stageIds: string[]          // legacy flat leaf list
  stages: TransformerConfig[] // copy template snapshots
  members?: TransformerPipeMember[] // manifold source of truth when set
  paramDefs?: PipeParamDef[]
  defaultParams?: Record<string, unknown>
  paramBindings?: Record<string, string>
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

#### Save as Pipe
1. User clicks \"Save as Pipe\" in Transformers tab header.
2. Dialog asks for Name and Mode (Linked/Copy).
3. If Linked: pipe created with `stageIds = entity.transformers`, `entity.transformerPipe = pipeId`.
4. If Copy: pipe created with `stages = snapshot(entity.transformers)`, `entity.transformerPipe` remains unset.

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
| `src/components/workspace/WorkspaceTransformersTab.tsx` | Save/Add Pipe UI, Link banner |
| `src/components/workspace/WorkspaceOrganizeTab.tsx` | Organize Pipes sub-tab |
| `src/persistence/indexedDb.ts` | Global library persistence |

---

### Implementation Plan

- [ ] Phase 1: Types & Schema
- [ ] Phase 2: Utilities (Core logic + Unit tests)
- [ ] Phase 3: Transformers Tab (Save/Add Pipe + Banner)
- [ ] Phase 4: Organize Tab (Management + Global Scope)
- [ ] Phase 5: Verification & Polish
