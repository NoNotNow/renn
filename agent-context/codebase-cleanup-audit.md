# Renn – Codebase Cleanup Audit

Post-milestone stabilization audit. Multiple agents contributed features; documentation was cleaned up in the prior pass. This audit targets dead code, duplicates, code smells, and consistency issues.

---

## Phase 1 — Quick fixes (completed)

### Dead files removed
- `src/types/editor.ts` — exported `BaseEditorProps`, `PoseHandlingProps`, `BasePropertyProps`; never imported anywhere.
- `src/input/inputManager.ts` — `useInputManager` hook; superseded by `rawInput.ts` + `inputMapping.ts`; zero production consumers.
- `src/components/InspectorLivePoseBridge.tsx` + test — `InspectorLivePoseBridge` component; never mounted in the app tree.
- `src/loader/prefetchMaterialTextures.ts` + test — `collectMaterialMapAssetIds` / `scheduleMaterialTextureDecodePrefetch`; no production consumer.

### Unused exports removed
- `src/config/constants.ts`: removed `UI_LOGGER_CONFIG`, `ENTITY_DEFAULTS`, `ASSET_CONFIG`, `PHYSICS_CONFIG`, `MATERIAL_CONFIG`, `GEOMETRY_CONFIG` (zero imports outside the defining file).

### Console.log cleanup
- `src/persistence/indexedDb.ts` — 8 verbose success-path logs gated behind `import.meta.env.DEV`.
- `src/contexts/ProjectContext.tsx` — save log gated behind `import.meta.env.DEV`.
- `src/physics/rapierPhysics.ts` — 3 trimesh diagnostic logs gated behind `import.meta.env.DEV`.
- `src/utils/clearCache.ts` — 2 logs gated behind `import.meta.env.DEV`.
- `src/scripts/gameApi.ts` — `[game]` log kept (runtime API, useful for script authors).

### Duplicated code extracted
- `extractJsonErrorPosition` / `lineColFromPosition` duplicated in `AvatarDialog.tsx` and `TransformerEditor.tsx` → `src/utils/jsonParseErrorLocation.ts`.

---

## Phase 2 — Larger tasks (partial, 2026-04-19)

**Performance:** No changes to per-frame simulation, physics, `sceneFrameLoop`, or Rapier hot paths. UI edits are event-driven (hover handlers same work as before; ground patch still one `entities.map` per user action).

### DRY — free-fly key defaults
- **`DEFAULT_FREE_FLY_KEYS`** lives in `src/types/camera.ts` (single source).
- `cameraController.ts` and `useKeyboardInput.ts` import it; `useKeyboardInput` re-exports for convenience.
- Tests import from `@/types/camera`.

### World ground edits
- **`patchFirstPlaneEntity`** in `src/utils/worldGroundPatch.ts` — used by `WorldPanel.tsx` for color / material / friction / scale updates (same allocations as inlined `map`).

### Shared UI — theme + `sharedStyles`
- **`theme`**: `bg.panelAltHover`, `bg.dropZoneActive`, `border.dropZoneActive`, `border.dropZoneHover` (same hex values as previous literals).
- **`sharedStyles`**: `secondaryPickIconButtonStyle`, `secondaryPickIconButtonHoverHandlers`, `assetDropZoneChrome`, `assetDropZoneHoverHandlers`.
- **Consumers**: `MaterialEditor`, `ModelEditor`, `ShapeEditor` (pick buttons); `ModelDialog`, `TextureDialog` (upload drop zone).

### Inspector pose polling (performance)
- **`LivePosesPoll`** (`src/components/LivePosesPoll.tsx`) — `setInterval` + `useState` for `getAllPoses()`; **wired in `Builder.tsx`** so only the render-prop subtree (currently `PropertySidebar`) updates on each tick, not the full Builder.
- `src/components/LivePosesPoll.test.tsx` — timer + async child update.

### Tests
- `src/utils/worldGroundPatch.test.ts` — one unit test for `patchFirstPlaneEntity`.
- **`TransformerTemplateDialog.test.tsx`** — first test now `await screen.findByText(/"type": "car2"/)` so async `loadPreset` completes under parallel Vitest (flakiness fix).

### Docs
- `agent-context/architecture.md` — `types/camera`, utils entries.
- `agent-context/performance-work.md` — removed broken links to deleted files; noted prefetch removal; Tier 3 row 11 updated (bridge removed; polling path is `Builder.tsx` again — see **Follow-up** below).

---

## Test-only modules (kept, but flagged)

These files are only imported by tests, not by any production code. They are valid test utilities but should not grow into production dependencies:

- `src/utils/worldUtils.ts` — `updateEntityPosition`; only used in `Builder.test.tsx`.
- `src/utils/trimeshVisualPhysicsAlignment.ts` — only used in integration test.

---

## Remaining larger tasks

### God files — candidates for splitting

| File | Lines | Suggested extraction |
|------|-------|---------------------|
| `pages/Builder.tsx` | ~1900 | Selection logic, undo/redo, texture maker state, import/export handlers → custom hooks; **optional:** isolate `livePoses` polling in a narrow wrapper again so `Builder` does not re-render every poll (see performance-work §8 / Tier 3) |
| `components/SceneView.tsx` | ~1360 | Physics lifecycle, skybox setup, overlay logic → hooks or sub-modules |
| `physics/rapierPhysics.ts` | ~1085 | Collider creation, body management, step logic → separate files |
| `TextureMaker/TextureMaker.tsx` | ~1030 | Tool logic, layer management → sub-components |
| `runtime/renderItemRegistry.ts` | ~970 | Transformer execution, culling, mesh sync → separate concerns |
| `components/WorldPanel.tsx` | ~930 | Ground editing, sim settings, culling UI → sub-panels (ground patch helper done) |
| `components/PropertyPanel.tsx` | ~840 | Could split per-tab content |
| `components/TextureDialog.tsx` | ~720 | Asset family grouping, filter logic → hooks (partial: drop zone chrome shared) |
| `contexts/ProjectContext.tsx` | ~660 | Persistence actions, camera state → split context or custom hooks |

### Raw hex color migration (remaining)

Many components still use raw hex. **Done in Phase 2 for:** pick icon buttons and asset drop zones (via `theme` + `sharedStyles`). **Still to migrate:** `TextureDialog`, `WorldPanel`, `EntityScriptEditor`, `ScriptDialog`, `EntitySidebar`, `TransformerTemplateDialog`, `ScriptPanelMultiSelect`, CSS (`TextureMaker.css`, `index.css`), etc.

### Duplicated UI patterns (remaining)

- **JSON textarea + apply button**: consider shared `ValidatedJsonTextarea` (`AvatarDialog` / `TransformerEditor`).
- **`visualBaseQuaternion` handling**: extract pure helpers used by `RenderItem`, gizmo, registry, `createPrimitive` (larger refactor).

### Test coverage gaps

Critical modules without dedicated tests:
- `runtime/renderItemRegistry.ts`
- `runtime/sceneFrameLoop.ts` (partial: accumulator tests exist)
- `scripts/scriptCtx.ts`
- `utils/assetUpload.ts`, `utils/modelPreview.ts`
- `data/modelPresets.ts`, `data/sampleWorld.ts`

### Optional — idle material prefetch

`prefetchMaterialTextures` was removed (no call sites). If mid-rAF decode becomes an issue again, reintroduce a **wired** prefetch from `SceneView` after load (idle `createImageBitmap`), document the entry point, and add a smoke test.

---

## Checklist for stabilization

- [x] Dead files removed
- [x] Unused exports removed (constants bundle)
- [x] Console.log gated behind DEV (IndexedDB, save, physics trimesh, clearCache)
- [x] Duplicated JSON helpers extracted
- [x] `DEFAULT_FREE_FLY_KEYS` single source (`types/camera.ts`)
- [x] Ground patch helper + unit test
- [x] Shared pick-button + drop-zone styles (theme + `sharedStyles`)
- [ ] Raw hex → theme tokens (bulk of components / CSS)
- [ ] God file splitting (Builder, SceneView, …)
- [ ] Test coverage for critical runtime modules
- [x] Inspector pose polling isolated (`LivePosesPoll` → `PropertySidebar`, not full `Builder`)

Run `npm run test:run` after further edits (currently **108** test files, **840** tests + 1 skipped). In `performance-benchmarks.integration.test.ts`, the **Heap growth** and **Scaling linearity** describes are skipped unless `RUN_PERF_BENCHMARKS=1` (use `npm run test:perf`) so agents avoid flaky wall-clock/heap thresholds; run that before Rapier/frame-loop/allocation hot-path changes.
