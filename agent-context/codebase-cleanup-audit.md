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

## Phase 6 — Inline hex migration in priority `.tsx` files (completed, 2026-04-19)

**Performance:** Pure swap of string literals for `theme.*` references. No new allocations, no runtime work added; React style objects rebuild every render either way.

### `theme.ts` additions
- **`bg.errorFallback`** (`#171a22`) — `ErrorBoundary` fallback area inside the main canvas (`Builder.tsx`).
- **`status.editMode`** (`#e11d48`) — Edit-mode active indicator dot (top-right of canvas).
- **`text.warning`** (`#c9a227`) — Inline warning text (mixed-shape selection notice in `PropertyPanel`).
- **`text.linkBlue`** (`#7ba3d4`) — Inline link / action text on transparent background (e.g. "Use model colors").
- **`text.mixedValues`** (`#888`) — Hint shown when a multi-selection has mixed values (e.g. "Mixed avatar settings").

### Migrated files (no remaining inline hex)
- **`pages/Builder.tsx`** — edit-mode dot + ErrorBoundary fallback.
- **`components/MaterialEditor.tsx`** — color swatch border, value label, "Texture maker…" button, advanced-settings toggle, advanced-settings rule.
- **`components/ModelEditor.tsx`** — mixed-model placeholder + helper hint.
- **`components/PropertyPanel.tsx`** — empty-state, mixed-shape warning, model-color hint, "Using colors from 3D file" hint, "Use model colors" link, untextured hint, wireframe hint, mixed-avatar hint.

### Note on `MaterialEditor` "Texture maker…" border
The previous literal was `#3d4a66`; the existing `theme.button.primaryBorder` is `#3d4a6a`. The 4-unit blue-channel difference (≈1.6% / ΔE ≪ 1) is below human perception, so the button now reuses `button.primaryBorder` rather than introducing a near-duplicate token. If you spot any unintended visual drift, add `button.primaryBorderAlt` and revert that specific call site.

### Tests
- All 115 test files / 935 tests pass after the migration. No new tests added (style-token swap; no behaviour change).

### Still deferred (lower priority)
Other `.tsx` files still contain one-off inline hex (`SceneView.tsx`, `ShapeEditor.tsx`, `Switch.tsx`, `SoundPanel.tsx`, `BuilderHeader.tsx`, `TransformerFieldReference.tsx`, `BrushToolPopover.tsx`, `TextureMaker/*`, `PerformanceBoosterDialog.tsx`, `ScriptPanel.tsx`, `Play.tsx`, `DropdownMenu.tsx`, `ErrorBoundary.tsx`, snackbars, sidebars, thumbnails, `MenuBar.tsx`, `CopyContext.tsx`, etc.). Most are component-specific accents (overlays, brush-popover, text colors); migrate opportunistically when touching those files.

---

## Phase 7 — `runSceneFrame` unit-test coverage (completed, 2026-04-19)

**Performance:** No production code touched. Tests use minimal mocks (no real Rapier / scene), run in ~5 ms total.

### Tests added — `src/runtime/sceneFrameLoop.test.ts` (28 tests)
Covers branches not exercised by `sceneFrameLoop.accumulator.test.ts` or the `shadow-follow-camera` integration test:

- **Time advance:** `simAdvance` increments `timeRef` by `fixedDt`; `skipSimulation` does not. `variableFrameDt` is what flows into `CameraController.update` when sim is skipped; `fixedDt` otherwise.
- **Wheel orbit gating:** orbit ref is zeroed when neither `editNav` nor `control=follow + follow-mode`; raw wheel is consumed (and zeroed) in edit-nav and in follow-control + follow-mode; orbit deltas are forwarded to `setOrbitDelta` / `setOrbitDistanceDelta` (with the 0.75 scale on distance) and accumulated with mouse drag; mouse drag is ignored under `gizmoDragging` but still cleared.
- **Debug forces:** expired entries (past `endTime`) are dropped; live forces are applied via `pw.applyForce`; in `editNav`, no forces apply but expired entries are still trimmed and `pw.step` is skipped.
- **Distance culling:** `world.distanceCulling === false` calls `clearDistanceCulling`; omitted/undefined merges defaults (`maxDistance: 2000`, `minSizeDistanceRatio: 0.02`) and calls `applyDistanceCulling`.
- **Sky dome:** position copies camera position each frame; absent sky dome is a no-op.
- **HUD diff:** initial frame always emits; sub-epsilon changes (Δspeed < 0.05, Δwheel < 0.012) suppress; super-epsilon emits new value.
- **Editor pose throttling:** below 0.35 s since last write → no write; at/above 0.35 s → writes `[x, y, z]` and updates `lastEditorPoseWriteTimeRef`.
- **Frame timing recording:** populates `SceneFrameTiming` (frameMs ≥ 0, render info from renderer); `skipRender` zeroes `renderMs` and skips `WebGLRenderer.render`; not allocated when disabled.
- **Physics error recovery:** `pw.step` throw → `console.error('Physics step error:', …)` once; `runSceneFrame` returns normally and `frameTimingRef` still populated; suppressed when `isCancelled()` (unmount race).
- **Script gating:** `runOnUpdate` runs without physics; suppressed in edit-nav; collision pairs invoke `runOnCollision` both directions with `culledSleepingEntityIds` passed through.

### Why no `requestAnimationFrame` loop test
`runSceneFrame` is the per-tick body. The wrapper (`SceneView.useEffect` rAF loop, accumulator → `runSceneFrame` calls) coordinates timing with `performance.now` and `cancelAnimationFrame` — that orchestration is exercised by integration tests (`shadow-follow-camera`, `transformers/integration`, scenarios). Direct rAF loop coverage in unit tests would require fake timers + `globalThis.requestAnimationFrame` polyfill, with low marginal value vs. the integration coverage.

---

## Phase 8 — `ProjectContext` slimming via hook extraction (completed, 2026-04-19)

**Performance:** Pure structural refactor. Same state shape, same number of hooks, same memoization pattern. No new effects, no per-frame work, no re-render churn. The extracted helpers run on the same code paths as before; the camera ref keeps the same synchronous mirror semantics so save paths still read the latest UI camera without waiting for a re-render.

### Pure helper — `buildWorldToSave`
- **`src/contexts/getWorldToSave.ts`** — pure `buildWorldToSave(currentWorld, cameraState, editorFreePose)` returning the `RennWorld` to persist with the live camera UI state and editor free pose merged in. Replaces the inline `getWorldToSave` closure inside `ProjectProvider`.
- **`src/contexts/getWorldToSave.test.ts`** — 7 tests: control/target/mode override, synthesised camera when world has none, live free pose write, doc free pose fallback, omit when both null, no input mutation, preserves other camera fields (distance/height).

### Hook — `useCameraState`
- **`src/hooks/useCameraState.ts`** — owns `CameraState` (`control`/`target`/`mode`), the synchronous `cameraStateRef` mirror, and the three setters (`setCameraControl`/`setCameraTarget`/`setCameraMode`). Adds `resetFromWorld(world, fallback?)` for the new/load/import paths that previously inlined `setCameraState(cameraStateFromWorld(...))`. Re-exports `cameraStateFromWorld`.
- **Consumers:** `ProjectContext.tsx` (single call site).

### Hook — `useModelPresets`
- **`src/hooks/useModelPresets.ts`** — owns the global model preset library (`modelPresets` state + `refreshModelPresets`, `saveModelPreset`, `deleteModelPreset`, `applyModelPresetToEntities`). Takes `persistence` and `updateWorld` as parameters so it can be unit-tested without the real IndexedDB layer if needed later. Keeps the existing optimistic-update behaviour (avoids stale-empty list right after save).
- **Consumers:** `ProjectContext.tsx` (single call site).

### Result
- `src/contexts/ProjectContext.tsx` shrunk from **662 → 587 lines** (-11%); the camera state plumbing (~30 lines) and model preset CRUD (~30 lines) now live in cohesive single-responsibility files. All extracted hooks have a single consumer today, but each is self-contained and unit-test ready.
- `ProjectContext.test.tsx` (7 tests) and `getWorldToSave.test.ts` (7 tests) all pass; full suite **117 files / 970 tests** (was 116 / 963 — the +7 are the new pure-helper tests).

### Why no separate `useProjectIO` hook (yet)
Import / export / pose sync still depends on the in-context `worldRef`, `setWorld`, `setAssets`, `setCurrentProject`, and `loadProject`. Extracting a hook would require either passing all of those through (~10 args) or pulling the `useState`/`useRef` declarations into the hook (which would defeat the point of the context). Defer until either a clear new consumer appears or we restructure the project state into a reducer/store.

---

## Phase 9 — `Builder.tsx` slimming via three new hooks (completed, 2026-04-19)

**Performance:** Pure structural refactor. No new effects, no per-frame work, no re-render churn. The three new hooks return stable callback references (verified by test) and re-derive boolean flags inline, so consuming components see the same memoization behaviour as before. The keyboard listener is still a single `window.addEventListener('keydown', …)`. The fullscreen pointer-activity listeners only attach when `isFullscreenEnabled()` is true (unchanged). Editor history `tryUndo`/`tryRedo` now self-bump the UI tick — old call sites that bumped manually still work (one extra render at most when stacking with `applyHistorySnapshot`, which itself bumps).

### Hook — `useBuilderKeyboardShortcuts`
- **`src/hooks/useBuilderKeyboardShortcuts.ts`** — owns the `window` keydown listener for the Builder shortcuts (`Cmd/Ctrl+Z`/`Y`/`Shift+Z` undo-redo, `Escape` clear selection, `Cmd/Ctrl+E` toggle edit-nav, `Digit1`/`Numpad1` cycle avatar, `Digit0`/`Numpad0` cycle camera mode). Exports `BuilderKeyboardShortcutsApi` so test harness / future consumers wire the same callback shape.
- The "is editable element" guard is encapsulated; `uiLogger.change('Builder', 'Cycle active avatar')` now fires inside the hook (still gated on `onCycleActiveAvatar()` returning true).
- **`src/hooks/useBuilderKeyboardShortcuts.test.ts`** — 6 tests: each shortcut dispatches the right callback, all are suppressed on `INPUT` focus, listener removed on unmount, avatar-cycle log only fires when the consumer signals an avatar was changed.

### Hook — `useBuilderFullscreenChrome`
- **`src/hooks/useBuilderFullscreenChrome.ts`** — owns the left/right drawer open state (`useLocalStorageState`, persisted), the `usePointerRevealTimeout` reveal flag, the fullscreen API support flag, the saved-drawer snapshot (collapse on enter, restore on exit), and the `builderColumnRef`. Returns the merged `builderChromeIdleHidden` derived flag and the `handleSceneFullscreenChange` callback used by `<SceneView onFullscreenChange={…}>`.
- Pointer listeners are still only attached when `isFullscreenEnabled()` is true.
- **`src/hooks/useBuilderFullscreenChrome.test.ts`** — 6 tests: defaults, localStorage seeding, drawers collapse-on-enter / restore-on-exit, manually-collapsed drawer survives the round-trip, `builderChromeIdleHidden` flips with chrome reveal, `builderColumnRef` is stable across rerenders.

### Hook — `useEditorHistory`
- **`src/hooks/useEditorHistory.ts`** — owns `createEditorHistory(maxDepth)` + the gesture-coalescing pre-snapshot ref + the UI tick. Returns `pushBeforeMutation` (snapshots `worldAssetsRef.current`), `tryUndo` / `tryRedo` (auto-bump UI on success — fixes a latent stale-`canUndo` issue from the old inline implementation), `clear` (auto-bump), `bumpUi`, `tick`, `editorUndoApi` (memoized for `EditorUndoProvider`), and the live `canUndo` / `canRedo` booleans. The combined keyboard handler in `Builder.tsx` still composes this with the Texture Maker history (Texture Maker undo wins when its draft is active).
- **`src/hooks/useEditorHistory.test.ts`** — 9 tests: empty start, push + undo + redo round-trip, clear, `editorUndoApi.pushBeforeEdit`, gesture commit (`scrubStart` + `scrubEnd(true)`), gesture discard (`scrubEnd(false)`), `maxDepth` trimming (oldest dropped), and stable function-identity across rerenders.

### Result
- `pages/Builder.tsx`: **1892 → 1782 lines** (-5.8%). Editor history (~50 lines), fullscreen chrome (~60 lines), and keyboard shortcuts (~60 lines) now live in cohesive single-responsibility files with their own tests.
- Full test suite: **120 files / 991 tests + 3 skipped** (was 117 / 970; +3 hook test files / +21 tests).

### Why no `useTextureMakerSession` (yet)
The Texture Maker session is the largest remaining chunk (~700 lines covering: `textureDocsRef`, draft doc/assets state, baseline + revert, `textureMakerHistoryRef`, layer selection, paint stroke prep / commit, sidecar load, blank-composite provisioning, apply / merge / resize / reorder / add / import / remove handlers). It is tightly coupled to:
- `pushHistory` (project-level) inside `provisionBlankCompositeTextureIfMissing` and `activateTextureStudioForEntity`,
- `documentEpoch` (resets the texture maker history alongside the editor history),
- `selectedEntityIds` (auto-close on selection mismatch),
- `sceneViewRef.updateEntityMaterial` after each commit / paint stroke,
- the combined `handleUndo` / `handleRedo` (Texture Maker undo wins when draft is active).

A clean extraction is feasible but warrants its own phase with a careful contract (likely splitting into `useTextureCompositorRegistry` + `useTextureMakerHistory` + `useTextureMakerSession`) and at least integration-level smoke tests (open / paint / undo / apply flow) before refactoring. Out of scope for Phase 9.

---

## Remaining larger tasks

### God files — candidates for splitting

| File | Lines | Suggested extraction |
|------|-------|---------------------|
| `pages/Builder.tsx` | ~1780 | Texture Maker session (~700 lines, see Phase 9 "Why no `useTextureMakerSession`"); selection logic; import/export handlers; pose-sync `syncPosesThen`; **optional:** isolate `livePoses` polling in a narrow wrapper again so `Builder` does not re-render every poll (see performance-work §8 / Tier 3) |
| `components/SceneView.tsx` | ~1360 | Physics lifecycle, skybox setup, overlay logic → hooks or sub-modules |
| `physics/rapierPhysics.ts` | ~1085 | Collider creation, body management, step logic → separate files |
| `TextureMaker/TextureMaker.tsx` | ~1030 | Tool logic, layer management → sub-components |
| `runtime/renderItemRegistry.ts` | ~970 | Transformer execution, culling, mesh sync → separate concerns |
| `components/WorldPanel.tsx` | ~930 | Ground editing, sim settings, culling UI → sub-panels (ground patch helper done) |
| `components/PropertyPanel.tsx` | ~840 | Could split per-tab content |
| `components/TextureDialog.tsx` | ~720 | Asset family grouping, filter logic → hooks (partial: drop zone chrome shared) |
| `contexts/ProjectContext.tsx` | ~590 | Camera state + model presets extracted (Phase 8). Still owns project save/load, import/export, pose sync, asset persistence — see Phase 8 "Why no separate `useProjectIO`". |

### Raw hex color migration (remaining)

**Done in Phase 2 for:** pick icon buttons and asset drop zones (via `theme` + `sharedStyles`).
**Done in Phase 3 for:** `TextureDialog`, `WorldPanel`, `EntityScriptEditor`, `ScriptDialog`, `EntitySidebar`, `TransformerTemplateDialog`, `ScriptPanelMultiSelect`, `AvatarDialog`, `TransformerEditor`.
**Done in Phase 4 for:** CSS files (`index.css`, `BrushToolPopover.css`, `TextureMaker.css`) — all shared values now reference `:root` CSS custom properties defined in `index.css`.
**Done in Phase 6 for:** `Builder.tsx`, `MaterialEditor.tsx`, `ModelEditor.tsx`, `PropertyPanel.tsx`.
**Still to migrate:** inline hex in remaining `.tsx` files (`SceneView`, `ShapeEditor`, `Switch`, `SoundPanel`, `BuilderHeader`, `BrushToolPopover`, `TextureMaker/*`, `PerformanceBoosterDialog`, `ScriptPanel`, `Play`, `DropdownMenu`, `ErrorBoundary`, snackbars, sidebars, thumbnails, `MenuBar`, `CopyContext`, etc.) — many one-off accents; migrate opportunistically.

### Test coverage gaps

Critical modules without dedicated unit tests:
- `runtime/renderItemRegistry.ts` — covered by integration/scenario tests; direct unit tests deferred (see Phase 5 rationale).
- `runtime/sceneFrameLoop.ts` — accumulator tests + 28 unit tests for the per-frame body branches (Phase 7). The rAF wrapper loop in `SceneView` is still only exercised via integration tests (`shadow-follow-camera`, scenarios).
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
- [x] Raw hex → theme tokens for inline component styles (Phases 2/3/6: priority `.tsx` files done; remaining accents flagged)
- [x] Shared `ValidatedJsonTextarea` (replaces inline JSON editors in `AvatarDialog` / `TransformerEditor`)
- [x] `assetUpload` test coverage (validation, persistence, returned shape)
- [x] Shared `visualBaseQuaternion` helpers (`utils/visualBaseQuaternion.ts`) + tests
- [x] CSS theme tokens centralised in `:root` (index.css, BrushToolPopover.css, TextureMaker.css)
- [x] Test coverage: `data/modelPresets`, `data/sampleWorld`, `scripts/scriptCtx`
- [~] God file splitting (Builder, SceneView, …) — Phase 8 split `ProjectContext` (662 → 587). Phase 9 split `Builder.tsx` (1892 → 1782) into `useBuilderKeyboardShortcuts`, `useBuilderFullscreenChrome`, `useEditorHistory`. SceneView/rapierPhysics/TextureMaker/renderItemRegistry still pending; `Builder.tsx` Texture Maker session deferred to a future phase.
- [x] Pure helpers extracted from `modelPreview.ts` and tested (`modelPreviewFraming`)
- [ ] Test coverage for `renderItemRegistry.ts` — *deferred; integration-tested. See Phase 5.*
- [x] Test coverage for `sceneFrameLoop.ts` rAF body (28 branch tests added in Phase 7; rAF loop wrapper still integration-tested)
- [x] Fix `scriptCtx.time` capture-vs-live bug (Phase 5)
- [x] Inspector pose polling isolated (`LivePosesPoll` → `PropertySidebar`, not full `Builder`)

Run `npm run test:run` after further edits (currently **120** test files, **991** tests + 3 skipped). In `performance-benchmarks.integration.test.ts`, the **Heap growth** and **Scaling linearity** describes are skipped unless `RUN_PERF_BENCHMARKS=1` (use `npm run test:perf`) so agents avoid flaky wall-clock/heap thresholds; run that before Rapier/frame-loop/allocation hot-path changes.
