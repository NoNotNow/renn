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

## Phase 3 — Component cleanup (completed, 2026-04-19)

**Performance:** No runtime hot paths touched. All edits are component-level: shared component extraction, hex → token swap (same hex values via `theme`), and a new pure-utility test.

### Shared UI — `ValidatedJsonTextarea`
- **`src/components/ValidatedJsonTextarea.tsx`** — extracted from inline JSON editors in `AvatarDialog` and `TransformerEditor`. Owns draft text, parse state, line/column error, optional content `validate` callback, and the apply button (text or icon variant).
- **Consumers:** `AvatarDialog.tsx` (passes `validateAvatarJson` for schema-level errors), `TransformerEditor.tsx` (per-transformer config card; uses `applyVariant="icon"`).
- `src/components/ValidatedJsonTextarea.test.tsx` — covers seeding, apply callback, JSON parse error, custom validate failure, reseeding when `value` changes, icon variant.

### Raw hex → theme tokens
- **`theme.ts` additions** (no visual changes; same hex values, named):
  - `bg.codeOverlay`, `bg.codeBlock`, `bg.listHover`, `bg.primarySubtle`, `bg.inactiveTile`, `bg.sectionMuted`, `bg.thumbnailFrame`, `bg.thumbnailHeader`, `bg.thumbnailTile`.
  - `button.info`, `button.infoActive`, `button.infoBorder`, `button.infoActiveBorder`, `button.disabledBorder`, `button.selectable`, `button.selectableBorder`.
  - `text.accentBlue`, `text.error`, `text.infoSubtle`, `text.dim`, `text.subtle`.
  - `border.error`.
  - `feedback.{successBg,successBorder,successText,successTextSubtle,destructiveSelectedBg,destructiveSelectedText}`.
- **Migrated components (no remaining raw hex):**
  - `EntityScriptEditor.tsx`, `ScriptDialog.tsx`, `ScriptPanelMultiSelect.tsx`
  - `TransformerTemplateDialog.tsx`, `EntitySidebar.tsx`
  - `WorldPanel.tsx`, `TextureDialog.tsx`
- Local style consts (`manageScriptsButtonStyle`, `monoSelectStyle`, `compactSelectStyle`, `intervalInputStyle`, etc.) introduced in script-related panels for in-file reuse.

### Test coverage — `assetUpload`
- `src/utils/assetUpload.test.ts` — 11 tests covering `uploadModel`, `uploadTexture`, `uploadAudio`, `uploadVideo`, `saveVideoMapBlob`. Mocks `defaultPersistence`, `generateModelPreview`, and `convertVideoToWebMp4` so the suite is fast and deterministic. Verifies validation paths, persistence call shape, returned `worldAssetEntry`, and that the input `assets` map is never mutated.

---

## Phase 4 — Helpers, tests, CSS tokens (completed, 2026-04-19)

**Performance:** No per-frame allocations introduced. `visualBaseQuaternion` helpers re-use a module-level scratch quaternion (`SCRATCH_INVERSE`) instead of the previous `baseQ.clone().invert()` per call — net allocation reduction in the physics-sync hot path and `getRotation` calls.

### Shared `visualBaseQuaternion` helpers
- **`src/utils/visualBaseQuaternion.ts`** — `isFlatShape`, `createVisualBaseForShape`, `getVisualBase`, `setVisualBaseFromShape`, `initVisualBaseFromShape`, `stripVisualBase`, `applyVisualBase`. Single source of truth for the `mesh.userData.visualBaseQuaternion` pattern (plane / ring lay-flat offset).
- **Consumers migrated** (no remaining direct `userData.visualBaseQuaternion` writes outside the helper):
  - `runtime/renderItem.ts` — `getRotation`, `setRotationEuler` use `stripVisualBase` / `applyVisualBase` (plus a module-level read scratch quaternion).
  - `runtime/renderItemRegistry.ts` — `getRotationAsQuaternion`, `updateShape` flat-shape transition, `syncFromPhysics` hot path.
  - `loader/createPrimitive.ts` — both flat-shape branches use `initVisualBaseFromShape`.
  - `editor/transformGizmoController.ts` — `logicalRotationFromMeshWorldQuaternion` uses `stripVisualBase` (with own scratch quaternion).
- **`src/utils/visualBaseQuaternion.test.ts`** — 17 tests: shape predicate, base creation, set/get/init, `stripVisualBase` (no-op / inverse / no-mutation / out-param), `applyVisualBase` round-trip.

### CSS theme tokens (raw hex centralised)
- **`src/index.css` `:root`** — added shared CSS custom properties (`--c-bg-*`, `--c-border-*`, `--c-text-*`, `--c-accent`, `--c-success-*`, `--shadow-overlay`) mirroring `theme.ts`.
- Migrated `index.css`, `components/BrushToolPopover.css`, `components/TextureMaker/TextureMaker.css` to reference the variables. Remaining hex in CSS files are component-specific accents (TextureMaker checker pattern, italic pen hint, `#fff` colorpicker pointer) — kept inline.

### Test coverage additions
- `src/data/modelPresets.test.ts` — 10 tests (`extractPresetFromEntity`, `applyPresetToEntity`: deep clone, undefined-stripping, round-trip, no-mutate).
- `src/data/sampleWorld.test.ts` — 7 tests (schema validation, unique ids, camera target, ground singleton, transformer presence, dynamic mass, version).
- `src/scripts/scriptCtx.test.ts` — 30 tests (entity-method descriptors, `ZERO_IMPACT`, `OTHER_REF_SYMBOL`, alloc functions, entity-view delegation, detect threshold semantics, touching list/empty, ctx pass-through helpers).

### Follow-up flagged during testing
- ~~**`scriptCtx.time` is captured at allocation, not live.**~~ **Fixed in Phase 5.**

---

## Phase 5 — Bug fix + WebGL helper extraction (completed, 2026-04-19)

**Performance:** No hot-path regressions. `attachLiveTime` runs once per ctx allocation (not per frame). `frameCamera` / `disposeObject` extraction is a structural move; identical work, same allocations.

### Fixed: `scriptCtx.time` is now live
- **`scripts/scriptCtx.ts`** — added `attachLiveTime(target, game)`: a one-line `Object.defineProperty` helper applied after each `{ ...baseCtx(...) }` spread to re-attach a live `get time()` getter. Used by all four alloc functions (`allocOnSpawnCtx`, `allocOnUpdateCtx`, `allocOnCollisionCtx`, `allocOnTimerCtx`).
- The previous test (`captures game.time at allocation`) was inverted to assert correct behaviour ("exposes a live game.time getter") and three new tests added — one per remaining alloc variant (`onUpdate`, `onCollision`, `onTimer`) — to prevent regression.

### Extracted: `modelPreviewFraming` (testable without WebGL)
- **`src/utils/modelPreviewFraming.ts`** — extracted `frameCamera`, `disposeObject`, `disposeMaterial` from `modelPreview.ts`. These are pure Three.js math / scene-graph traversal (no GL context needed). Constants (`FRAMING_OFFSET_MULTIPLIER`, `FRAMING_OFFSET_DIRECTION`, `FALLBACK_CAMERA_POSITION`) exported so tests can compute expected values without hard-coding magic numbers.
- **`src/utils/modelPreview.ts`** — now imports `frameCamera` and `disposeObject` from the new file; only retains the WebGL-bound entry point (`generateModelPreview`).
- **`src/utils/modelPreviewFraming.test.ts`** — 14 tests: empty-object fallback, offset direction, FOV-fit distance, near/far derivation + clamping, largest-dimension selection, texture disposal, multi-texture material, nested-mesh traversal, material array, non-mesh skip.

### Why no direct unit tests for `renderItemRegistry.ts`
- Heavy coupling to `RenderItem`, `PhysicsWorld`, Three.js mesh state, transformer chain, and per-frame allocations. Mocking enough surface for meaningful direct coverage would be brittle and high-noise.
- Existing coverage: 9+ scenario / integration tests already exercise `RenderItemRegistry` end-to-end (`controlled-entity-transformers-culling`, `box-model-material`, `box-model-simplification-texture`, `trimesh-simplification-model-colors`, `transformers/integration`, `editor/transformGizmoController`, `loader/floorSaveLoad`, `physics/rapierPhysics`, plus `runtime/renderItem.test.ts` for the per-item layer).
- **If a deterministic regression appears,** prefer extending an existing scenario test (or `runtime/renderItem.test.ts`) over building a mock of the registry.

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

**Done in Phase 2 for:** pick icon buttons and asset drop zones (via `theme` + `sharedStyles`).
**Done in Phase 3 for:** `TextureDialog`, `WorldPanel`, `EntityScriptEditor`, `ScriptDialog`, `EntitySidebar`, `TransformerTemplateDialog`, `ScriptPanelMultiSelect`, `AvatarDialog`, `TransformerEditor`.
**Done in Phase 4 for:** CSS files (`index.css`, `BrushToolPopover.css`, `TextureMaker.css`) — all shared values now reference `:root` CSS custom properties defined in `index.css`.
**Still to migrate:** inline hex in misc `.tsx` files (`Builder.tsx`, `MaterialEditor.tsx`, `ModelEditor.tsx`, `PropertyPanel.tsx`, etc.) — many one-off accents; lower priority.

### Test coverage gaps

Critical modules without dedicated unit tests:
- `runtime/renderItemRegistry.ts` — covered by integration/scenario tests; direct unit tests deferred (see Phase 5 rationale).
- `runtime/sceneFrameLoop.ts` — partial (accumulator tests only); the rAF loop body / culling / transformer ordering still untested.
- `utils/modelPreview.ts` — pure framing/disposal helpers extracted to `modelPreviewFraming.ts` and tested (Phase 5). The remaining `generateModelPreview` entry point is WebGL-bound and still has no direct test.

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
- [x] Raw hex → theme tokens for inline component styles (CSS files still pending)
- [x] Shared `ValidatedJsonTextarea` (replaces inline JSON editors in `AvatarDialog` / `TransformerEditor`)
- [x] `assetUpload` test coverage (validation, persistence, returned shape)
- [x] Shared `visualBaseQuaternion` helpers (`utils/visualBaseQuaternion.ts`) + tests
- [x] CSS theme tokens centralised in `:root` (index.css, BrushToolPopover.css, TextureMaker.css)
- [x] Test coverage: `data/modelPresets`, `data/sampleWorld`, `scripts/scriptCtx`
- [ ] God file splitting (Builder, SceneView, …)
- [x] Pure helpers extracted from `modelPreview.ts` and tested (`modelPreviewFraming`)
- [ ] Test coverage for `renderItemRegistry.ts` — *deferred; integration-tested. See Phase 5.*
- [ ] Test coverage for `sceneFrameLoop.ts` rAF body (accumulator already covered)
- [x] Fix `scriptCtx.time` capture-vs-live bug (Phase 5)
- [x] Inspector pose polling isolated (`LivePosesPoll` → `PropertySidebar`, not full `Builder`)

Run `npm run test:run` after further edits (currently **115** test files, **935** tests + 3 skipped). In `performance-benchmarks.integration.test.ts`, the **Heap growth** and **Scaling linearity** describes are skipped unless `RUN_PERF_BENCHMARKS=1` (use `npm run test:perf`) so agents avoid flaky wall-clock/heap thresholds; run that before Rapier/frame-loop/allocation hot-path changes.
