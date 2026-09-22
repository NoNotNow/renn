# Renn – Codebase Cleanup Audit

Living backlog for stabilization passes. **Do not redo completed work** — scan this file first.

**Baseline (2026-09-19):** 240 test files, 2050 tests + 3 skipped · `npm run typecheck` clean · `npm run build` recommended pre-PR · `npm run test:perf` before Rapier/frame-loop changes.

**Verbose phase write-ups (1–27):** [`codebase-cleanup-history.md`](./codebase-cleanup-history.md) — archive only; append new phases here in **short** form.

---

## Test-only modules (kept, flagged)

| Module                                       | Note                    |
| -------------------------------------------- | ----------------------- |
| `src/utils/worldUtils.ts`                    | Only `Builder.test.tsx` |
| `src/utils/trimeshVisualPhysicsAlignment.ts` | Integration test only   |

---

## Completed phases (index)

| Phase  | Theme                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | Dead files, unused constants exports, DEV-gated logs, JSON parse helper                                                                                       |
| 2      | `DEFAULT_FREE_FLY_KEYS`, ground patch, UI infra doc, theme/sharedStyles, LivePosesPoll                                                                        |
| 3      | `ValidatedJsonTextarea`, hex migration (priority panels), `assetUpload` tests                                                                                 |
| 4      | `visualBaseQuaternion`, CSS `:root` tokens, modelPresets/sampleWorld/scriptCtx tests                                                                          |
| 5      | Live `scriptCtx.time`, `modelPreviewFraming` extraction                                                                                                       |
| 6      | Hex migration (Builder, Material/Model/Property panels)                                                                                                       |
| 7      | `sceneFrameLoop` branch tests (28)                                                                                                                            |
| 8      | `ProjectContext` → `useCameraState`, `useModelPresets`, `getWorldToSave`                                                                                      |
| 9      | Builder hooks: keyboard, fullscreen chrome, editor history                                                                                                    |
| 10     | SceneView → sky/audio/fullscreen hooks + error overlay                                                                                                        |
| 11     | `WorldPanel` → `world/*` sections                                                                                                                             |
| 12     | `EntitySidebar` → `entitySidebar/*`                                                                                                                           |
| 13–13b | `PropertyPanel` split; pre-existing `tsc -b` fixes                                                                                                            |
| 14     | `TextureDialog` → `textureDialog/*`                                                                                                                           |
| 15     | `useTextureMakerSession` from Builder (-41% lines)                                                                                                            |
| 16     | Asset picker layout, `AssignEntitiesDialog`                                                                                                                   |
| 17     | Workspace shell tab preserves pipe nav state                                                                                                                  |
| 18     | Hex: `Switch`, `ErrorBoundary`                                                                                                                                |
| 19     | `incrementalSceneSync` tests, registry port smoke tests                                                                                                       |
| 20     | Undo gaps, param-scope single projection, `worldPipeRegistryChanged` fast path                                                                                |
| 21     | `commitStageEdit` deep module                                                                                                                                 |
| 22     | `pipeNavEdit` seam; controller 23 → 13 keys                                                                                                                   |
| 23     | `EntityStageRuntime` snapshot; per-row walk fix                                                                                                               |
| 24     | `workspaceEditorSession` (Monaco view-state policy)                                                                                                           |
| 25     | Stage strip `scope` prop; flat-index enable fix                                                                                                               |
| 26     | Transformers tab hooks, editor store split, `behaviorRegistryBindings`                                                                                        |
| 27     | Pipe-strip ancestor grey-out; flat stack `applyStageWorldWrite` (partial candidate 6)                                                                         |
| 28     | AI doc consolidation (audit slim, history archive)                                                                                                            |
| 29     | Hex `BuilderHeader`/`SoundPanel`; pipe-nav dead exports; workspace tab/strip loose ends                                                                       |
| 30     | God-file slices: TextureMaker shell, collider builder, registry culling, SceneView helpers, ProjectContext MRU, Builder pose-sync + explorer selection/groups |
| 31     | Builder workspace hook; ProjectContext persisted assets + last-project MRU pure module                                                                        |

---

## Phase 31 — Builder workspace + ProjectContext assets (completed, 2026-09-18)

**Performance:** none (event-driven IO / workspace open).

### Changes
- **Builder** (1478 → **1347**): `useBuilderWorkspace`, pure `workspaceOpenTarget.ts` (`resolveWorkspaceOpenTarget`, `resolveWorkspaceTargetForEntity`, defaults + memory restore).
- **ProjectContext** (724 → **680**, Phase 30 MRU unchanged): `usePersistedAssets` (`saveAsset` on blob map updates), `persistence/lastProjectId.ts` (localStorage MRU key).
- **Builder selection** (from same pass, if not in Phase 30 commit): `useBuilderExplorerSelection`, `builderEntityRangeSelection.ts`.

### Tests
- `workspaceOpenTarget.test.ts` (11; L2 fixed pipe-nav path expectation before abort), `lastProjectId.test.ts` (6), `builderEntityRangeSelection.test.ts` (6); `Builder.test.tsx`, `Builder.workspacePersistence.integration.test.tsx`, `ProjectContext.test.tsx`.

### Deferred
- `useProjectPersistence` / `useProjectImportExport` (Phase 8 IO split).

---

## Phase 32 — Builder entity world actions (completed, 2026-09-18)

**Performance:** none (event-driven entity / inspector writes).

### Changes
- **Builder** (1347 → **1006**): `useBuilderEntityWorldActions` — entity CRUD, clipboard, inspector/scene patches, transformer commit wiring, `applyWorldWrite`.

### Tests
- Existing `Builder.test.tsx`, workspace/selection integration tests (no new file; behaviour unchanged).

### Deferred
- Remaining Builder handlers (gizmo pose commit, camera reset, perf booster, texture session wiring).
- `renderItemRegistry` transformer exec (perf-gated).

---

## Phase 33 — Registry visual pose + TextureMaker types (completed, 2026-09-18)

**Performance:** hot-path behaviour unchanged (same sync/interpolation calls).

### Changes
- **renderItemRegistry**: `renderItemRegistryVisualPose.ts` (`VisualPoseStateRegistry`).
- **TextureMaker**: `textureMakerTypes.ts`; preview hooks import types without pulling shell.

### Tests
- `renderItemRegistryVisualPose.test.ts` (3).

---

## Phase 34 — Registry mesh/shape/material sync (completed, 2026-09-18)

**Performance:** none (cold-path / inspector incremental sync only; `executeTransformers` untouched).

### Changes
- **renderItemRegistry** (1289 → **1018**): `renderItemRegistryMeshSync.ts` (304) — shape geometry swap, material hot-swap, model transform, mesh color, wireframe overlay pass, `disposeMeshHierarchy`.

### Tests
- Existing `renderItem*.test.ts` + material scenario tests (behaviour unchanged).

### Deferred
- `renderItemRegistry` transformer exec internal module (perf-gated).

---

## Phase 30 — God-file orchestration pass (completed, 2026-09-18)

**Performance:** distance culling + collider build unchanged on hot path (cold-path / delegate only); SceneView main effect untouched.

### Changes
- **TextureMaker** (~1012 → **288**): `preview/*`, `layers/*`, integrator shell — [integrate shell](9c30b3f0-571a-4e2c-8777-32b85edc6010).
- **rapierPhysics** (~1156 → **930**): `colliderDescBuilder.ts` — [colliderDescBuilder extract](33b405a1-fb06-49f6-97ea-f20b07979eb5).
- **renderItemRegistry** (~1337 → **1289**): `renderItemRegistryDistanceCulling.ts` — [registry distance culling](607f8ba4-af9d-46d0-91be-deaff205a795).
- **SceneView** (1421 → **1394**): `debugForces`, `pointerNdc`, `sceneCameraPose`, `planSemiFixedPushFrames` — [SceneView safe helpers](d9a97649-5c3c-462c-8e17-8199a6e260c4).
- **ProjectContext** (724 → **680**): `useEntityWorkHistory` — [useEntityWorkHistory extract](2464be34-3e61-4053-b1ea-513701864dad).
- **Builder** (1725 → **1478** at Phase 30): pose-sync + explorer selection — see Phase 31 for workspace slice to **1347**.

### Orchestration note
[L2 god-file cleanup](07398815-183b-4a51-a12d-eb9007a982d7) errored mid-audit; L3 spawns landed (Phase 31). **L1 closure:** vitest + tsc verified below.

### Tests
- Full `npx vitest run`: **223 files / 1991 passed / 3 skipped** (L1 post-L2 abort).

### Deferred
- ~~SceneView main scene-build effect~~ → **done** (Phases 0–6): [scene-runtime-session-extract.md](./scene-runtime-session-extract.md); SceneView **906** lines (~35-line session adapter).
- `renderItemRegistry` transformer exec internal module (Phase 34 landed mesh sync).
- `useProjectIO` (Phase 8); Builder clipboard / optional `BuilderLayout` JSX split.
- `TextureMakerStudioTool` → small types module (preview import hygiene).

---

## Phase 28 — AI doc consolidation (completed, 2026-09-18)

**Performance:** none (docs only).

### Changes
- Slimmed this audit; moved verbatim history to `codebase-cleanup-history.md`.
- `README.md` + `start-here.md`: doc ownership rules (link, don’t repeat).
- `nomenclature.md`: trimmed duplicate/historical param-scope prose.
- `feature-transformer-pipes.md`: vocabulary → nomenclature; fixed stale param-scope note; shorter implementation pointers.
- `.cursor/skills/codebase-cleanup/SKILL.md`: doc consolidation pass criteria.
- **L3 follow-up:** `feature-workspace.md` (~280→~100 lines) — phases collapsed; registry/bindings → nomenclature; pipes → feature-transformer-pipes.
- **L3 follow-up:** `performance-work.md` (~370→~170 lines) — deduped trace essays; fixed stale `InspectorLivePoseBridge` → `LivePosesPoll`; tier narrative merged into backlog.
- **L3 follow-up:** `architecture.md` — related-doc links; persistence/Workspace/data-flow → feature docs; shorter pipe editor comments in file map.

### Deferred
- `feature-transformers.md` cross-link trim (still long).
- Organize Tab Phase 4 in `feature-transformer-pipes.md` (product backlog).

### Tests
- N/A

---

## Phase 29 — Hex + pipe-nav exports (completed, 2026-09-18)

**Performance:** none (theme literals → tokens; export surface trim).

### Changes
- `theme.ts`: `bg.destructiveSoft`, `sidebarButtonIdle`, `border.destructiveSoft`, `feedback.destructiveChip*`, `paint.defaultBrushHex`.
- `BuilderHeader.tsx`, `SoundPanel.tsx`: raw hex → `theme` (visual parity).
- `pipeNavResolve.ts` / `pipeStageResolve.ts`: move `isMemberEnabled` / `isBindingEnabled`; drop unused exports (`pipeNavDepth`, `resolveContainerPipeId`, …).
- `pipeNavMutations.ts`, `usePipeNavController.ts`: module-private create/handler types.
- `commitStageEdit.ts`: dedupe stack-intent JSDoc.
- `useTransformerCodeDraft.ts` / `WorkspaceTransformersTab.tsx`: drop unused `pipeScoped` flush field; hook deps fix; remove dead Monaco ref destructure.
- `PipeFocusedStrip.tsx`: shared `pipeStripScrollStyle`.
- L1 follow-up: removed dead `monacoEditorAreaRef` prop from Transformers tab (`Workspace.tsx` still passes ref to `WorkspaceMonacoSlot` only).

### Tests
- Baseline unchanged (1934 passed, 3 skipped); `pipeNavMutations.test.ts` (20) verified after export trim.

---

## Remaining larger tasks

### God files

| File                            | Lines (approx) | Suggested extraction                                                                                                                                                                                |
| ------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/Builder.tsx`             | **1004**       | Gizmo/perf/texture wiring remain; entity world actions in `useBuilderEntityWorldActions`                                                                                                            |
| `components/SceneView.tsx`      | **906**        | Main scene-build **done** — [`SceneRuntimeSession`](./scene-runtime-session-extract.md) (~**35**-line adapter); orchestration in `sceneRuntimeSession*.ts` (~**1226** LOC); safe helpers (Phase 30) |
| `physics/rapierPhysics.ts`      | **930**        | Step/touching contact dedup (hot — perf gate); collider factory done                                                                                                                                |
| `TextureMaker/TextureMaker.tsx` | **288**        | Done (Phase 30); optional types module for studio tool                                                                                                                                              |
| `runtime/renderItemRegistry.ts` | **1018**       | Transformer exec (culling Phase 30; mesh sync Phase 34)                                                                                                                                             |
| `contexts/ProjectContext.tsx`   | **680**        | `useProjectPersistence`, `useProjectImportExport`; assets + last-project id done (Phase 31)                                                                                                         |

**Architecture review (2026-09-18):** `/var/folders/cg/87j3kd8s3dqctsflnp71st2w0000gn/T/architecture-review-20260918-2128.html` — SceneRuntimeSession **approved** ([plan](./scene-runtime-session-extract.md)); Phases **0–6 done** (2026-09-18).

Smaller splits done: WorldPanel, EntitySidebar, PropertyPanel, TextureDialog — see phase index.

### Hex migration (opportunistic)

Priority panels done (phases 2–3, 6, 18, 29). Still scattered accents: `SceneView`, `ShapeEditor`, `TextureMaker/*`, snackbars, etc.

### Test gaps

| Area                      | Status                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| `renderItemRegistry.ts`   | Port/contract smoke (Phase 19); behaviour via integration                     |
| `sceneFrameLoop.ts`       | Unit + accumulator; SceneView rAF loop integration-only                       |
| `modelPreview.ts`         | WebGL entry untested; framing in `modelPreviewFraming.ts`                     |
| `incrementalSceneSync.ts` | 20 tests; reference equality by design (see `feature-world-update-reload.md`) |

### Open from recent pipe/workspace work (Phase 21–27)

- Flat `writeFlatStack` → `commitStacksRaw` may return `null` (no merged pipe-param sync on flat whole-stack commits).
- `ctx.world` stale after `flushPendingCode()` in `commitStageEdit` (pre-existing).
- `decouplePipeBinding` vs `treeDelete` sharing count predicates could unify.
- `usePipeNavController` focus→entry effect still depends on full `entry` (Phase 17 carry-over).
- Candidate 6 remainder: gateway paths without Builder `applyWorldWrite`.

### Optional

- Idle material prefetch — removed; reintroduce only if wired from SceneView with tests.

---

## Checklist for stabilization

- [x] Dead files / unused exports / DEV logs / JSON helpers
- [x] Theme tokens for priority `.tsx` (remaining accents flagged)
- [x] Shared UI helpers (`ValidatedJsonTextarea`, visual base quat, asset upload tests)
- [x] God-file splits listed above (partial — see table)
- [x] `scriptCtx.time` live; LivePosesPoll scoped
- [x] Pipe/stage seams: `pipeNavEdit`, `commitStageEdit`, `EntityStageRuntime`, stage strip `scope`
- [x] AI doc consolidation (Phase 28)
- [~] Remaining god files — Phase 30 slices; SceneView mega-effect **extracted** (Phases 0–6); registry transformer exec still open
- [ ] Hex opportunistic migration

After edits: `npm run test:run` and keep baseline green or better.
