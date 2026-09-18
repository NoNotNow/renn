# Renn – Codebase Cleanup Audit

Living backlog for stabilization passes. **Do not redo completed work** — scan this file first.

**Baseline (2026-09-18):** 212 test files, 1934 tests + 3 skipped · `npx tsc --noEmit -p tsconfig.app.json` clean · `npm run build` recommended pre-PR · `npm run test:perf` before Rapier/frame-loop changes.

**Verbose phase write-ups (1–27):** [`codebase-cleanup-history.md`](./codebase-cleanup-history.md) — archive only; append new phases here in **short** form.

---

## Test-only modules (kept, flagged)

| Module | Note |
|---|---|
| `src/utils/worldUtils.ts` | Only `Builder.test.tsx` |
| `src/utils/trimeshVisualPhysicsAlignment.ts` | Integration test only |

---

## Completed phases (index)

| Phase | Theme |
|---|---|
| 1 | Dead files, unused constants exports, DEV-gated logs, JSON parse helper |
| 2 | `DEFAULT_FREE_FLY_KEYS`, ground patch, UI infra doc, theme/sharedStyles, LivePosesPoll |
| 3 | `ValidatedJsonTextarea`, hex migration (priority panels), `assetUpload` tests |
| 4 | `visualBaseQuaternion`, CSS `:root` tokens, modelPresets/sampleWorld/scriptCtx tests |
| 5 | Live `scriptCtx.time`, `modelPreviewFraming` extraction |
| 6 | Hex migration (Builder, Material/Model/Property panels) |
| 7 | `sceneFrameLoop` branch tests (28) |
| 8 | `ProjectContext` → `useCameraState`, `useModelPresets`, `getWorldToSave` |
| 9 | Builder hooks: keyboard, fullscreen chrome, editor history |
| 10 | SceneView → sky/audio/fullscreen hooks + error overlay |
| 11 | `WorldPanel` → `world/*` sections |
| 12 | `EntitySidebar` → `entitySidebar/*` |
| 13–13b | `PropertyPanel` split; pre-existing `tsc -b` fixes |
| 14 | `TextureDialog` → `textureDialog/*` |
| 15 | `useTextureMakerSession` from Builder (-41% lines) |
| 16 | Asset picker layout, `AssignEntitiesDialog` |
| 17 | Workspace shell tab preserves pipe nav state |
| 18 | Hex: `Switch`, `ErrorBoundary` |
| 19 | `incrementalSceneSync` tests, registry port smoke tests |
| 20 | Undo gaps, param-scope single projection, `worldPipeRegistryChanged` fast path |
| 21 | `commitStageEdit` deep module |
| 22 | `pipeNavEdit` seam; controller 23 → 13 keys |
| 23 | `EntityStageRuntime` snapshot; per-row walk fix |
| 24 | `workspaceEditorSession` (Monaco view-state policy) |
| 25 | Stage strip `scope` prop; flat-index enable fix |
| 26 | Transformers tab hooks, editor store split, `behaviorRegistryBindings` |
| 27 | Pipe-strip ancestor grey-out; flat stack `applyStageWorldWrite` (partial candidate 6) |
| 28 | AI doc consolidation (audit slim, history archive) |
| 29 | Hex `BuilderHeader`/`SoundPanel`; pipe-nav dead exports; workspace tab/strip loose ends |

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

| File | Lines (approx) | Suggested extraction |
|------|------------------|----------------------|
| `pages/Builder.tsx` | 1177 | Selection/import handlers, `syncPosesThen` (texture maker done) |
| `components/SceneView.tsx` | ~1058 | Main scene-build `useEffect`; rAF wrapper |
| `physics/rapierPhysics.ts` | ~1085 | Collider/body/step modules |
| `TextureMaker/TextureMaker.tsx` | ~1028 | Tools/layers sub-components |
| `runtime/renderItemRegistry.ts` | ~1337 | Transformer exec, culling, mesh sync |
| `contexts/ProjectContext.tsx` | ~587 | IO still coupled to refs (see Phase 8 note in history) |

Smaller splits done: WorldPanel, EntitySidebar, PropertyPanel, TextureDialog — see phase index.

### Hex migration (opportunistic)

Priority panels done (phases 2–3, 6, 18, 29). Still scattered accents: `SceneView`, `ShapeEditor`, `TextureMaker/*`, snackbars, etc.

### Test gaps

| Area | Status |
|---|---|
| `renderItemRegistry.ts` | Port/contract smoke (Phase 19); behaviour via integration |
| `sceneFrameLoop.ts` | Unit + accumulator; SceneView rAF loop integration-only |
| `modelPreview.ts` | WebGL entry untested; framing in `modelPreviewFraming.ts` |
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
- [ ] Remaining god files and hex opportunistic migration

After edits: `npm run test:run` and keep baseline green or better.
