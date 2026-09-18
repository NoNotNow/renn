# Feature: Workspace — Unified Behavior Authoring

Full-screen overlay for transformer/script authoring and Organize. Inspector **`CodingTabPanel`** is names-only; clicks open Workspace anchored to entity + item.

**Status:** Phases 1–8 complete. **Open:** E2E smoke (edit script → Apply → Play).

**Vocabulary & pipes:** [nomenclature.md](./nomenclature.md) (stage, registry, bindings). **Pipe stack / FRs:** [feature-transformer-pipes.md](./feature-transformer-pipes.md). **Floating panels:** [feature-ui-infrastructure.md](./feature-ui-infrastructure.md).

---

## Requirements (summary)

### R1 — Shell
- Tabs: **Transformers**, **Scripts**, **Organize**. Header: tab buttons, **EntitySearchPicker** (`compact`), reset/stop, docs toggle, background opacity cycle (20→40→60→100%), close.
- No-entity Transformers/Scripts: **EntitySearchPicker** (`panel`), not dead-end copy.
- **TransformerDocsContent:** optional resizable right column; width in `localStorage`.
- **One Monaco** shared by Transformers + Scripts; tab switch changes strip only.
- Monaco remount **200 ms** after first visible open (same as toolbar **Refresh editor**).
- **Session** (`WorkspaceTarget` + per-entity `WorkspaceSessionMemory` in `Builder.tsx`): tab, entity, `itemId`, `pipeNavPath`, `pipeNavSelectedIndex` — survives close/reopen; tab switches do not reset pipe depth.
- **View state:** keyed by [`workspaceEditorItemKey`](../src/utils/workspaceEditorItemKey.ts), stored in [`workspaceEditorViewState.ts`](../src/utils/workspaceEditorViewState.ts); policy in [`workspaceEditorSession.ts`](../src/editor/workspaceEditorSession.ts) (see below). **Script drafts:** [`workspaceEditorDraft.ts`](../src/utils/workspaceEditorDraft.ts) (Scripts tab only).
- **Watch** drawer: custom transformer on single entity; [`WorkspaceFloatingDrawer`](../src/components/workspace/WorkspaceFloatingDrawer.tsx); position persisted. **Once per page load** for delayed Monaco remount.
- **Shift+Escape** opens Workspace; **Escape** closes (or clears selection when closed). Monaco focused: Escape dismisses IntelliSense first. Fullscreen: plain Esc exits only when Workspace closed (`shouldExitFullscreenOnEscape`).

#### Editor session (`workspaceEditorSession.ts`)

`createWorkspaceEditorSession()` resolves live edits vs programmatic restore vs layout scroll jumps. `Workspace.tsx` calls it at named moments only (no view-state refs in the shell).

| Method | When | Role |
|---|---|---|
| `attachEditor` | `onEditorReady` | Subscribe save; pending restore |
| `beginNavigation` | layout on `editorItemKey` | Save outgoing; arm restore |
| `requestRestore` | `[open, editorItemKey]` | Restore + 250 ms retry |
| `noteUserEdit` | `onChange` | Block restores while typing |
| `persistNow` | close | Force-save |
| `repairAfterLayout` | delayed layout | Fix scroll-to-top; retry restore |
| `dispose` | unmount | Clear timers |

**Do not round timing constants:** `WORKSPACE_EDITOR_SUPPRESS_SAVE_MS` 400, `WORKSPACE_EDITOR_TYPING_QUIET_MS` 600, `WORKSPACE_EDITOR_RESTORE_RETRY_MS` 250. Tests: [`workspaceEditorSession.test.ts`](../src/editor/workspaceEditorSession.test.ts) (injectable clock); integration: `Builder.workspacePersistence.integration.test.tsx`.

### R2 — Transformers tab
- Horizontal pipeline: reorder, enable, drag, inline **name** on custom cards, **Configure** JSON (priority / `params`), live trace, preset **Load template** / **Field reference**, Monaco for **custom** stages. No redundant second toolbar under the chain.
- **+** → dialog (**Preset** / **Existing**); auto-select after add (custom → Monaco).
- Selection / code control → Monaco; `resolvePreferredStageId` prefers first custom at focused pipe level.
- Compile/runtime errors: `TransformerCodeErrorOverlay` (debounced compile 500 ms; cards show borders immediately).

| Hook | Role |
|---|---|
| [`useTransformerCodeDraft`](../src/hooks/useTransformerCodeDraft.ts) | Draft sync, debounce **350 ms**, undo prime, `flushPendingCode` for nav/copy/refresh |
| [`useStageRuntimeErrorDisplay`](../src/hooks/useStageRuntimeErrorDisplay.ts) | Runtime bridge → overlay; keep **10 s** after clear (`STAGE_RUNTIME_ERROR_KEEP_MS`) |

`flushPendingCode` reaches `commitStageEdit` via ref from the draft hook.

### R3 — Scripts tab
- Chip row (no pipeline order); event, `onTimer` interval, Apply, Manage → Organize Entity/scripts. Shared-script banner when script used by >1 entity.

### R4 — Organize
- Scopes: **Global**, **Project**, **Entity**; sub-tabs Transformers / Scripts (pipes: [feature-transformer-pipes.md](./feature-transformer-pipes.md)).
- Cards stacked by type; **Edit**, **Delete**, **Copy**, **Move**, **Assign**. Global: copy to project before entity assign; promote from project.
- **Registry queries:** [nomenclature.md § Behavior registry bindings](./nomenclature.md#behavior-registry-bindings) — `behaviorRegistryBindings(kind)`; migrate duplicate script queries in `WorkspaceScriptsTab` when touching that file.
- Multi-select Entity scope: **intersection** of assigned ids (same as legacy script multi-select).

### R5–R7 — Move, conflicts, registry
- **Move:** scope/assignment only (not pipeline reorder) — assign, promote, copy global→project, detach entity.
- **Conflict:** `WorkspaceConflictDialog` — Overwrite or Rename.
- **`world.transformers` + `entity.transformers: string[]`:** migration `migrateEntityTransformersToRegistry` on all load paths; schema in `world-schema.json`. Scripts unchanged.

### R8–R9 — Inspector & parity
- Sidebar: names only → Workspace. All prior operations reachable in Workspace (no regression list duplicated here — see removed legacy components in cleanup history).

---

## Data & persistence

- Project: `world.transformers`, `world.scripts`, entity id arrays (see [nomenclature.md](./nomenclature.md)).
- Global: IndexedDB **`globalBehaviorLibrary`** ([`globalBehaviorLibrary.ts`](../src/types/globalBehaviorLibrary.ts)) — not in world JSON/ZIP; v7+ store ([`architecture.md` § Persistence](./architecture.md#persistence)).

---

## Key files

| Area | Paths |
|---|---|
| Shell | `Workspace.tsx`, `workspace/*Tab.tsx`, `WorkspaceConflictDialog.tsx` |
| Global panels | `WorkspaceGlobalTransformerPanel.tsx`, `WorkspaceGlobalScriptPanel.tsx` |
| Inspector entry | `CodingTabPanel.tsx` (thin lists) |
| Types / DB | `types/workspace.ts`, `types/transformer.ts`, `persistence/indexedDb.ts` |
| Runtime resolve | `renderItemRegistry.ts` (registry ids → chain) |
| Pipe edits | `commitStageEdit.ts`, `pipeNavEdit.ts` — [feature-transformer-pipes.md](./feature-transformer-pipes.md) |

Removed legacy: `CustomTransformerCodeTab`, `EntityScriptEditor`, `ScriptPanel*`, `ScriptDialog` (Phase 8).

---

## Tests (Vitest)

`Workspace.test.tsx`, `CodingTabPanel.test.tsx`, `Builder.workspacePersistence.integration.test.tsx` — shell, Organize, Monaco view state, pipe depth memory, Shift+Escape.
