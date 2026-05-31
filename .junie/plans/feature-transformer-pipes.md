---
sessionId: session-260531-152124-mwkm
---

# Requirements

### Overview & Goals

Add **Transformer Pipes** — named, reusable, ordered sequences of transformer stages that can be shared across entities or used as independent copies. This enables users to define a behavior pipeline once (e.g. a "car controller" or "platformer movement" pipe) and apply it to many entities, with the option to live-link (shared edits propagate) or copy (independent clone).

---

### Scope

**In Scope**
- New data model: `world.transformerPipes: Record<string, TransformerPipe>`
- New `entity.transformerPipe?: string` field (link marker; runtime uses `entity.transformers` as before)
- Two assign modes: **linked** (shared IDs, edits propagate) and **copy** (independent clone via `cloneEntityTransformersIntoWorld`)
- **Save as Pipe** button in the Workspace Transformers tab
- **Add Pipe** dropdown in the Transformers tab pipeline header (replaces current pipeline)
- **Shared pipe banner** above the pipeline strip (with Decouple action)
- New **Transformer Pipes** sub-tab in Workspace Organize tab (alongside Transformers and Scripts)
- Pipe cards in Organize: name, stage count, usage count, assign/detach/delete/rename/promote-to-global
- Global scope: pipes can be promoted to / copied from the IndexedDB global behavior library
- Migration: existing worlds are unaffected (no `transformerPipe` field = no pipe link)

**Out of Scope (this iteration)**
- Per-entity stage overrides within a shared pipe
- Partial pipe assignment (pipe always replaces the full pipeline)
- Pipe versioning or diff view
- Pipe import/export as standalone JSON

---

### User Stories

1. **As a builder**, I want to save my entity's current transformer pipeline as a named pipe so I can reuse it on other entities.
2. **As a builder**, I want to assign a pipe to an entity in linked mode so that editing the pipeline on any linked entity updates all of them.
3. **As a builder**, I want to assign a pipe in copy mode so I get an independent starting point without affecting other entities.
4. **As a builder**, I want to see a banner when an entity's pipeline is linked to a pipe, and decouple it with one click.
5. **As a builder**, I want to manage all pipes in the Organize tab — rename, delete, see which entities use them, and promote them to the global library.
6. **As a builder**, I want to add a whole pipe to an entity from the Transformers tab pipeline view.

---

### Functional Requirements

#### FR1 — Save as Pipe
- In the Workspace Transformers tab header, a **"Save as Pipe"** button (or chip) is available when the entity has at least one transformer stage.
- Clicking opens a small inline dialog: pipe name input + mode selector (**Linked** / **Copy**).
- **Linked mode**: the current `entity.transformers` IDs become the pipe's `stageIds`. `entity.transformerPipe` is set to the new pipe ID. No new registry entries are created.
- **Copy mode**: a new pipe is created with a snapshot of the current configs (stored inline in `TransformerPipe.stages`). `entity.transformerPipe` is NOT set (entity remains independent). The pipe acts as a reusable template.
- The new pipe is written to `world.transformerPipes`.

#### FR2 — Add Pipe (from Transformers tab)
- A **"+ Add Pipe"** dropdown/button in the pipeline header lists all pipes in `world.transformerPipes`.
- Selecting a pipe shows a mode selector: **Link** or **Copy**.
- **Link**: entity's `transformers` array is replaced with the pipe's `stageIds`. `entity.transformerPipe` is set.
- **Copy**: `cloneEntityTransformersIntoWorld` is called with the pipe's stage configs, creating fresh registry entries. `entity.transformerPipe` is NOT set.
- The existing pipeline is replaced (with an undo-able history push).

#### FR3 — Shared Pipe Banner
- When `entity.transformerPipe` is set, a banner appears above the pipeline strip:
  > **Shared pipe: [pipe name]** — editing stages here affects all linked entities. [Decouple]
- **Decouple**: calls `cloneEntityTransformersIntoWorld` to create independent registry entries for this entity, then clears `entity.transformerPipe`.
- If the pipe no longer exists in `world.transformerPipes` (deleted), the banner shows a warning: "Linked pipe not found — [Decouple]" and decouple auto-clears the stale reference.

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


# Technical Design

### Current Implementation

- `world.transformers: Record<string, TransformerConfig>` — flat registry of transformer stage configs.
- `entity.transformers: string[]` — ordered list of registry IDs for the entity's pipeline.
- `cloneEntityTransformersIntoWorld()` in `src/utils/commitTransformerConfigsToWorld.ts` — creates independent registry entries for a cloned entity (used in clone/paste flows).
- Workspace Organize tab (`WorkspaceOrganizeTab.tsx`) has **Global / Project / Entity** scope subtabs, each with **Transformers** and **Scripts** sub-tabs.
- Shared-script banner pattern exists in `WorkspaceScriptsTab.tsx` — reuse for pipe banner.
- Global behavior library: `GlobalBehaviorLibrary` in `src/types/globalBehaviorLibrary.ts`, persisted via `loadGlobalBehaviorLibrary` / `saveGlobalBehaviorLibrary` in `src/persistence/indexedDb.ts`.

---

### Key Decisions

 Decision | Choice | Rationale |
---|---|---|
 Pipe storage | `world.transformerPipes: Record<string, TransformerPipe>` | Mirrors `world.transformers` pattern; stays in world JSON |
 Link marker on entity | `entity.transformerPipe?: string` | Minimal schema change; runtime (`entity.transformers`) unchanged |
 Pipe definition | `stageIds: string[]` (linked) + `stages: TransformerConfig[]` (snapshot for copy-mode template) | Supports both modes; stageIds used for live-link, stages used when assigning as copy |
 Assign modes | Linked (shared IDs) vs Copy (clone via `cloneEntityTransformersIntoWorld`) | User-chosen at assign time; matches mental model |
 Pipeline replacement | Assigning a pipe replaces the full pipeline | Simpler UX; partial merge deferred |
 Editing propagation | Editing a linked entity's stages updates shared registry IDs automatically | No extra sync needed; same mechanism as shared scripts |
 Organize tab extension | New "Transformer Pipes" sub-tab in existing Organize tab | Consistent with existing Transformers/Scripts sub-tab pattern |

---

### Data Models

```ts
// src/types/transformer.ts (new)
export interface TransformerPipe {
  id: string
  name: string
  /** Ordered transformer registry IDs — used when assigning in 'linked' mode. */
  stageIds: string[]
  /** Inline config snapshots — used when assigning in 'copy' mode (template). */
  stages: TransformerConfig[]
  createdAt?: number
}

// src/types/world.ts (additions)
interface RennWorld {
  // ... existing fields ...
  transformerPipes?: Record<string, TransformerPipe>  // NEW
}

interface Entity {
  // ... existing fields ...
  transformerPipe?: string  // NEW — pipe ID if linked; absent = independent
}

// src/types/globalBehaviorLibrary.ts (addition)
interface GlobalBehaviorLibrary {
  transformers: Record<string, TransformerDef>
  scripts: Record<string, ScriptDef>
  transformerPipes?: Record<string, TransformerPipe>  // NEW
}
```

---

### Proposed Changes

#### 1. Types & Schema
- `src/types/transformer.ts`: add `TransformerPipe` interface.
- `src/types/world.ts`: add `transformerPipes?` to `RennWorld`; add `transformerPipe?` to `Entity`.
- `world-schema.json`: add `$defs/TransformerPipe`, add `transformerPipes` to world object, add `transformerPipe` to entity.
- `src/types/globalBehaviorLibrary.ts`: add `transformerPipes?` field.

#### 2. Utilities
- `src/utils/commitTransformerConfigsToWorld.ts`: add `assignPipeToEntity(world, entityId, pipe, mode: 'linked' | 'copy')` — for linked: sets `entity.transformerPipe`, replaces `entity.transformers` with `pipe.stageIds`; for copy: calls `cloneEntityTransformersIntoWorld` with pipe's stage configs.
- Add `decoupleEntityFromPipe(world, entityId)` — clones registry entries, clears `entity.transformerPipe`.
- Add `deletePipeFromWorld(world, pipeId)` — removes pipe, clears `entity.transformerPipe` on all linked entities.

#### 3. Workspace Transformers Tab (`WorkspaceTransformersTab.tsx`)
- Add **"Save as Pipe"** button/chip in the pipeline header area.
- Add **"+ Add Pipe"** dropdown in the pipeline header.
- Add **shared pipe banner** above the pipeline strip (reuse banner pattern from `WorkspaceScriptsTab.tsx`).

#### 4. Organize Tab (`WorkspaceOrganizeTab.tsx`)
- Add **"Transformer Pipes"** as a third sub-tab in the existing Transformers/Scripts sub-tab row.
- Render pipe cards using `WorkspaceOrganizeCard` (extend or reuse with pipe-specific actions).
- Wire assign (with mode dialog), rename, delete, promote-to-global, copy-from-global.

#### 5. Global Library (`src/persistence/indexedDb.ts`)
- Extend `loadGlobalBehaviorLibrary` / `saveGlobalBehaviorLibrary` to include `transformerPipes`.

---

### File Structure

```
src/
├── types/
│   ├── transformer.ts          # + TransformerPipe interface
│   ├── world.ts                # + RennWorld.transformerPipes, Entity.transformerPipe
│   └── globalBehaviorLibrary.ts # + transformerPipes field
├── utils/
│   └── commitTransformerConfigsToWorld.ts  # + assignPipeToEntity, decoupleEntityFromPipe, deletePipeFromWorld
├── components/workspace/
│   ├── WorkspaceTransformersTab.tsx  # + Save as Pipe, Add Pipe, shared pipe banner
│   └── WorkspaceOrganizeTab.tsx      # + Transformer Pipes sub-tab
world-schema.json                     # + TransformerPipe def, entity.transformerPipe, world.transformerPipes
agent-context/
└── feature-transformer-pipes.md      # NEW — this feature document
```

---

### Architecture Diagram

```mermaid
graph TD
  A[Entity] -->|entity.transformers: string[]| B[world.transformers registry]
  A -->|entity.transformerPipe?: string| C[world.transformerPipes]
  C -->|stageIds: string[]| B
  C -->|stages: TransformerConfig[]| D[Copy-mode template]

  E[WorkspaceTransformersTab] -->|Save as Pipe| C
  E -->|Add Pipe - linked| A
  E -->|Add Pipe - copy| B
  E -->|Decouple| F[cloneEntityTransformersIntoWorld]
  F --> B

  G[WorkspaceOrganizeTab - Transformer Pipes sub-tab] --> C
  G -->|Promote| H[GlobalBehaviorLibrary.transformerPipes]
  H -->|Copy to Project| C
```

---

### Risks

 Risk | Mitigation |
---|---|
 Stale `entity.transformerPipe` if pipe is deleted | `deletePipeFromWorld` clears all references; banner shows warning if pipe not found |
 Linked entities silently affected by pipeline edits | Banner always visible when linked; wording makes propagation explicit |
 `stageIds` in pipe diverge from `entity.transformers` if entity is edited without pipe awareness | Decouple clears `entity.transformerPipe`; any direct pipeline edit on a linked entity should prompt "This will affect all linked entities — continue?" or auto-decouple |
 Schema migration for existing worlds | No migration needed — `transformerPipes` and `entity.transformerPipe` are optional fields |


# Feature Document

### Document to create

`agent-context/feature-transformer-pipes.md`

This document will be the authoritative spec for the Transformer Pipes feature, following the same format as `feature-workspace.md`. It will include:

- **Context** — how it fits into the existing workspace/transformer architecture
- **Requirements** (R1–R7) — full functional spec
- **Data model** — `TransformerPipe`, `world.transformerPipes`, `entity.transformerPipe`, global library extension
- **Key decisions** — link vs copy modes, pipeline replacement, propagation model
- **UI flows** — Save as Pipe, Add Pipe, banner + decouple, Organize Pipes sub-tab
- **Key files affected** — table of all files to add/modify
- **Todo / implementation plan** — phased checklist (Phase 1: types + schema; Phase 2: utilities; Phase 3: Transformers tab UI; Phase 4: Organize tab; Phase 5: Global scope)


# Delivery Steps

###   Step 1: Create feature-transformer-pipes.md in agent-context/
The authoritative feature document exists at agent-context/feature-transformer-pipes.md.

- Write the full feature spec document following the same format and conventions as feature-workspace.md
- Include: Context, Requirements (R1–R7), Data model section with TypeScript interfaces, Key decisions table, UI flows for all entry points, Key files affected table, and a phased Todo/implementation checklist
- Cover all decisions made: two assign modes (linked/copy), entity.transformerPipe link marker, pipeline replacement on assign, live propagation for linked entities, shared pipe banner with decouple, Organize Transformer Pipes sub-tab, global scope promotion

###   Step 2: Add TransformerPipe type and extend world/entity types
Type definitions and JSON schema are updated to support transformer pipes.

- Add `TransformerPipe` interface to `src/types/transformer.ts` (id, name, stageIds, stages, createdAt)
- Add `transformerPipes?: Record<string, TransformerPipe>` to `RennWorld` in `src/types/world.ts`
- Add `transformerPipe?: string` to `Entity` in `src/types/world.ts`
- Add `transformerPipes?` field to `GlobalBehaviorLibrary` in `src/types/globalBehaviorLibrary.ts`
- Update `world-schema.json`: add `$defs/TransformerPipe`, add `transformerPipes` to world object, add `transformerPipe` to entity definition

###   Step 3: Add pipe utility functions to commitTransformerConfigsToWorld.ts
Core pipe operations are implemented as pure world-transform utilities.

- Add `assignPipeToEntity(world, entityId, pipe, mode: 'linked' | 'copy'): RennWorld` — linked mode sets entity.transformerPipe and replaces entity.transformers with pipe.stageIds; copy mode calls cloneEntityTransformersIntoWorld with pipe.stages
- Add `decoupleEntityFromPipe(world, entityId): RennWorld` — clones registry entries via cloneEntityTransformersIntoWorld, clears entity.transformerPipe
- Add `deletePipeFromWorld(world, pipeId): RennWorld` — removes pipe from world.transformerPipes, clears entity.transformerPipe on all linked entities
- Add `savePipeFromEntity(world, entityId, pipeName, mode): RennWorld` — creates a new TransformerPipe from the entity's current pipeline
- Add unit tests for all four functions in commitTransformerConfigsToWorld.test.ts

###   Step 4: Add Save as Pipe, Add Pipe, and shared pipe banner to WorkspaceTransformersTab
The Transformers tab gains pipe-aware UI controls.

- Add 'Save as Pipe' button/chip in the pipeline header; clicking opens an inline dialog with pipe name input and mode selector (Linked / Copy); on confirm calls savePipeFromEntity and updates world
- Add '+ Add Pipe' dropdown in the pipeline header listing world.transformerPipes; selecting a pipe shows a Link/Copy mode dialog; on confirm calls assignPipeToEntity
- Add shared pipe banner above the pipeline strip when entity.transformerPipe is set: shows pipe name, 'editing affects all linked entities' warning, and a Decouple button that calls decoupleEntityFromPipe
- Add stale-pipe warning variant when entity.transformerPipe references a pipe that no longer exists in world.transformerPipes

###   Step 5: Add Transformer Pipes sub-tab to WorkspaceOrganizeTab
The Organize tab gains a third sub-tab for managing pipes.

- Add 'Transformer Pipes' as a third sub-tab alongside Transformers and Scripts in WorkspaceOrganizeTab.tsx
- Project scope: list all world.transformerPipes as cards using WorkspaceOrganizeCard (extended or reused); card shows name, stage count, usage count, linked entity names
- Entity scope: show only pipes where entity.transformerPipe matches the pipe ID
- Global scope: list pipes from globalBehaviorLibrary.transformerPipes
- Card actions: Assign (opens Link/Copy mode dialog), Rename, Delete (with linked-entity warning), Promote to Global, Copy from Global to Project (with WorkspaceConflictDialog)
- Extend loadGlobalBehaviorLibrary / saveGlobalBehaviorLibrary in src/persistence/indexedDb.ts to include transformerPipes