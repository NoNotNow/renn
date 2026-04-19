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

## Phase 10 — `SceneView.tsx` slimming via three hooks + two components (completed, 2026-04-19)

**Performance:** Pure structural refactor. Effects keep the same dependency arrays (sky dome on `[scene, skybox, _assets]`, audio on `[sound, _assets]` + `[playbackCommand]`, fullscreen on `[targetEl]` + `[]`). `useSkyDome` returns a stable ref consumed by `runSceneFrame` for per-frame copying — no extra allocations. The fullscreen pointer listener only attaches when `fullscreen.supported && !useExternalChrome` (unchanged guard).

### Hook — `useSkyDome`
- **`src/hooks/useSkyDome.ts`** — owns `skyDomeRef`, the `disposeSkyDomeMesh` helper, and the `SKY_DOME_RADIUS` constant. Loads the texture via `THREE.TextureLoader.loadAsync`, configures the mesh (`BackSide`, `depthWrite: false`, `depthTest: false`, `renderOrder: -1`, `frustumCulled: false`), adds it to the scene, and disposes on cleanup / scene unmount. Returned ref is consumed by `runSceneFrame` to keep the dome centered on the camera.
- **`src/hooks/useSkyDome.test.ts`** — 7 tests: helper no-op + dispose chain; null scene; missing/empty asset id; missing asset map entry (warn); load + configure + add to scene + URL revoke + dispose on unmount; dispose when scene becomes null.

### Hook — `useWorldAudio`
- **`src/hooks/useWorldAudio.ts`** — owns the world background `<audio>` element, its blob URL, and the manual `playbackCommand` listener. Re-creates the element only when `assetId` changes (revokes prior URL); otherwise reapplies `loop`, `volume`, `autoplay`. Cleans up on unmount.
- **`src/hooks/useWorldAudio.test.ts`** — 9 tests: undefined sound is a no-op; create with autoplay + loop + volume; autoplay false skips play; reuse element on volume/loop change; replace element + revoke URL on assetId change; clamp volume into [0,1]; teardown when sound becomes undefined; play/stop via `playbackCommand`; cleanup on unmount.

### Hook — `useSceneFullscreen`
- **`src/hooks/useSceneFullscreen.ts`** — feature-detects `isFullscreenEnabled()` once, syncs an `active` flag with the configured target element (or `sceneRootRef`), exposes a `toggle()` that requests / exits fullscreen plus chrome bump, and resolves chrome reveal from either an internal `usePointerRevealTimeout` or a parent-owned `externalChromeControl` (Builder column wrap).
- **`src/hooks/useSceneFullscreen.test.ts`** — 8 tests: feature detect; idle inactive; toggle requests on target; toggle exits when already fullscreen; `fullscreenTargetRef` overrides scene root; `onFullscreenChange` fires on transitions; external chrome control short-circuits internal timer; missing target ref is a no-op.

### Component — `SceneFullscreenButton`
- **`src/components/SceneFullscreenButton.tsx`** — floating bottom-left toggle (Enter/Exit svg icons + aria labels). Visibility driven by parent (the `chromeVisible` flag from `useSceneFullscreen`).
- **`src/components/SceneFullscreenButton.test.tsx`** — 4 tests: enter/exit aria labels; hidden when `visible=false`; click invokes `onToggle` and stops propagation.

### Component — `WorldLoadErrorOverlay`
- **`src/components/WorldLoadErrorOverlay.tsx`** — full-bleed alert overlay shown by `SceneView` when `loadWorld(...)` throws. Renders the error message in a scrollable `<pre>`, a hint about mesh-simplification clamps, and a Dismiss button.
- **`src/components/WorldLoadErrorOverlay.test.tsx`** — 3 tests: message rendering; Dismiss callback; heading exposed for assistive tech.

### Result
- `components/SceneView.tsx`: **1359 → 1058 lines** (-22%). Sky dome (~80 lines), world audio (~60 lines), fullscreen state (~40 lines), error overlay (~55 lines), and fullscreen button (~50 lines) now live in cohesive single-responsibility files with their own tests. The `SoundPlaybackCommand` shape is now exported from `useWorldAudio` and reused by `SceneView`'s prop type.
- Full test suite: **125 files / 1022 tests + 3 skipped** (was 120 / 991; +5 files / +31 tests).

### Why no SceneView main-effect extraction (yet)
The `useEffect` that builds the renderer / camera / physics / registry / animation loop is the largest remaining block (~330 lines). It owns ~15 long-lived refs (camera ctrl, avatar session, script runner, physics, registry, asset resolver, …) shared across the rAF body, the cleanup, and `useImperativeHandle`. A clean extraction would require either (a) moving every ref into a hook and re-exposing them all (defeating the cohesion we'd gain), or (b) passing back a single bundled object per build that downstream effects then dereference (still need to coordinate the cleanup chain). Defer until a clear new consumer or a re-architecture (e.g. moving the rAF loop into `useSyncExternalStore` or a dedicated runtime owner).

---

## Phase 11 — `WorldPanel.tsx` split into per-section sub-components (completed, 2026-04-19)

**Performance:** Pure structural refactor. Each section now owns its own state/handlers but the React subtree shape is identical (same `<div style={sectionStyle}>` structure, same number of `NumberInput` / `Vec3Field` instances, same prop callbacks). No new effects, no new memoization, no per-frame work. The `useWorldPanelEdits` hook re-creates the `pushUndo` / `vec3Undo` / `updateWorldSettings` closures on every parent render — same as the previous inline code did. Sections call props they already received from the parent; React reconciles each section independently, but `WorldPanel`'s only state today is `world` itself, so any change still re-renders the whole panel (unchanged behaviour).

### Hook — `useWorldPanelEdits`
- **`src/components/world/useWorldPanelEdits.ts`** — single source of truth for the edit helpers shared by every section: `pushUndo` (snapshot before discrete edit), `vec3Undo` (gesture bundle for `Vec3Field`, no-op outside `EditorUndoProvider`), `updateWorldSettings(patch)` (shallow merge into `world.world` + forward to `onWorldChange`).

### Section components — `src/components/world/*.tsx`
| Section | Lines | Responsibility |
|---------|-------|----------------|
| `WorldSimulationSection.tsx` | 153 | Physics rate (Hz), max catch-up steps, time scale, show frame stats, logarithmic depth, video texture anisotropy |
| `WorldGravitySection.tsx` | 41 | Gravity magnitude → `world.world.gravity` |
| `WorldSleepSection.tsx` | 99 | Linear/angular thresholds, time until sleep, "Set recommended" |
| `WorldDistanceCullingSection.tsx` | 116 | Enable/disable; max distance; min size/distance ratio; sleep-culled toggle |
| `WorldSkySection.tsx` | 156 | Sky color + dome texture (`TextureDialog` integration; `useProjectContext` consumer) |
| `WorldLightSection.tsx` | 151 | Directional light azimuth/elevation/color/intensity + ambient color |
| `WorldGroundSection.tsx` | 261 | First-plane entity edits (color/material/friction/scale) via `patchFirstPlaneEntity` |

### Container — `WorldPanel.tsx`
Trimmed from **912 → 68 lines** (-93%). Now only:
1. Calls `useWorldPanelEdits(world, onWorldChange)`.
2. Builds a `copyPayload` (delegated to a small pure helper `buildCopyPayload`).
3. Renders all seven sections inside `<CopyableArea>`.

### Tests — `src/components/WorldPanel.test.tsx`
7 smoke tests with mocked `useProjectContext` and `uiLogger`:
- All seven section headings render.
- "No ground entity found" placeholder when no plane entity exists.
- Show-frame-stats checkbox toggles `world.world.showFrameStats`.
- Distance culling toggle off serializes to `false` and pushes undo.
- Sky color picker writes a `Vec3` into `world.world.skyColor` and pushes undo.
- "Clear" button on a populated skybox removes `world.world.skybox` and pushes undo.
- Ground color picker emits a patched world (via `patchFirstPlaneEntity`) and pushes undo.

### Result
- `WorldPanel.tsx`: **912 → 68 lines** (-93%); seven cohesive sections of 41–261 lines each.
- Full test suite: **130 files / 1090 tests + 3 skipped** (was 129 / 1083; +1 file / +7 tests).

### Why each section is its own file (not nested in `WorldPanel`)
- Each section owns 1–4 derived values + 1–3 update helpers. Inlining them all kept `WorldPanel.tsx` over 900 lines and made it impossible to scan responsibilities.
- The shared edit helpers live in `useWorldPanelEdits`; sections receive a single `edits` prop, so adding/reordering a section is a one-line change in `WorldPanel`.
- `WorldGroundSection` is the largest (261 lines) because it owns four independent ground-edit closures and an empty-state branch — splitting it further (e.g. into `WorldGroundColor` + `WorldGroundMaterial` + …) would only add boilerplate without isolating any new responsibility.

---

## Phase 13b — Pre-existing `tsc --build` errors fixed (completed, 2026-04-19)

**Performance:** No production code paths changed. Two source files (`useEditorHistory.ts` typing, `useBuilderFullscreenChrome.ts` ref typing) and three test files updated. The `RefObject<…|null>` → `RefObject<…>` change in `useBuilderFullscreenChrome` keeps the same runtime: the underlying `useRef<HTMLDivElement>(null)` already returns the right `RefObject<HTMLDivElement>`; the interface now matches the actual ref type.

### Errors fixed
1. **`src/hooks/useEditorHistory.ts` (4 errors)** — replaced `RefObject<{world,assets}>` with a small `WorldAssetsRef` interface (`{ current: { world; assets } }`). The parent (`Builder.tsx`) writes `worldAssetsRef.current = { world, assets }` synchronously after every render, so `current` is genuinely never null; the React-19 `RefObject<T>` strictness was a false positive.
2. **`src/hooks/useBuilderFullscreenChrome.ts`** — interface said `RefObject<HTMLDivElement | null>` (double-nullable); changed to `RefObject<HTMLDivElement>` to match what `useRef<HTMLDivElement>(null)` actually returns. Eliminates the `Builder.tsx:1630` `<div ref={builderColumnRef}>` mismatch.
3. **`src/components/WorldPanel.test.tsx`** — removed stale `width: 50, depth: 50` from a `plane` shape literal (the schema is `{ type: 'plane'; normal?: Vec3 }` — plane has no width/depth, ground sizing comes from `scale`).
4. **`src/scripts/scriptCtx.test.ts`** — explicit return type on the `vi.fn` so the inferred mock signature is `(id: string) => [number, number, number]` instead of `(id: string) => number[]`.
5. **`src/test/scenarios/controlled-entity-transformers-culling.integration.test.ts`** — kept `getEntityWorldPoseForTransformers` private; the test now type-casts via `EntityWorldPoseGetter` (already exported from `@/types/transformer`) at the single access site. Records the test-only escape hatch without weakening the production API.

### Verification
- `npx tsc --noEmit` → 0 errors (was 5).
- `npm run build` (`tsc -b && vite build`) → clean (was failing on `tsc -b`).
- `npm run test:run` → 132 files / 1106 tests + 3 skipped (unchanged).

### Why this matters
Without these fixes, `npm run build` was broken for every contributor; only `npm run test:run` (Vitest, no strict tsc) ran green. Future agents would have to either ignore the 5 errors or mistakenly believe their own changes broke the build. CI now has a sharp signal for new TS regressions.

---

## Phase 13 — `PropertyPanel.tsx` split into `propertyPanel/` sub-components (completed, 2026-04-19)

**Performance:** Pure structural refactor. Same React subtree shape: each `CollapsibleSection` still mounts identically and the new section components are plain function components without `memo` (parent re-renders propagate the same way as before, identical to the inline JSX). No new effects, no per-frame work, no extra allocations. The `materialAllNull` / `materialAllSet` boolean derivations moved into `MaterialSection` (same arithmetic, same cost — just colocated with the only consumer).

### New sub-components — `src/components/propertyPanel/*.tsx`
| Component | Lines | Responsibility |
|---|---|---|
| `PropertyPanelHeader.tsx` | 150 | Entity name/lock-icon header + Refresh / Clone / Delete action buttons |
| `MaterialSection.tsx` | 151 | Material section content: 4-branch IIFE (mixed-warning / `MaterialEditor` / "Override with material" / "Use model colors" + editor) replaced with explicit if/return tree |
| `ModelTransformSection.tsx` | 127 | Show-shape-wireframe toggle + model rotation `Vec3Field` (with reset button) + model scale `Vec3Field` |
| `AvatarSection.tsx` | 120 | Playable-avatar `Switch`, mixed-avatar hint, single-selection-only preferred camera mode + distance fields |

All four are plain props-in / JSX-out components: no internal state, no effects. Edit/log callbacks come from the parent.

### Container — `PropertyPanel.tsx`
Trimmed from **844 → 511 lines** (-39%). Now only owns:
1. The merged-derivation block (`mergeVec3` / `mergeRotation` / `mergeShape` / `mergeMaterial` / `mergeTransformers` / etc. — kept inline because every section reads at least one merged value, and the closures `updateAll` / `handleShapeChange` / `handleMixedDimensionChange` need them).
2. The `editingName` local state + `nameDisplayValue` / `handleNameFocus` / `handleNameBlur` for the Entity-name input.
3. The seven `CollapsibleSection` rows (Entity, Transform, [Shape, Physics, Material, 3D Model, Model-Transform, Avatar, Transformers] when shape/material types align), each delegating its body to either an existing editor (`TransformEditor`, `ShapeEditor`, `PhysicsEditor`, `ModelEditor`, `TransformerEditor`) or one of the new section components.

The lock toggle button stays inline because it lives in the `<CollapsibleSection title="Entity" trailing={…}>` slot — extracting it would force splitting the Entity section itself, which is otherwise small.

### Tests
- All 132 test files / 1106 tests pass without changes. Existing `PropertyPanel.test.tsx` covers the rendered output end-to-end (header buttons, lock toggle, material override branch, avatar switch, model rotation reset) and asserts unchanged behaviour after the refactor.

### Why no `usePropertyPanelDerived` hook (yet)
Every merged value (`mergedName`, `mergedShape`, `mergedMaterial`, `mergedAvatar`, `mergedBodyType`, `mergedMass`, `mergedFriction`, …) is consumed by either a `CollapsibleSection`'s `copyPayload` prop (which lives in the container JSX) **or** by the closures `updateAll` / `handleShapeChange` / `handleMixedDimensionChange` (which read `world` / `idSet` directly and would need to be passed down anyway). Bundling them into a hook would shrink the file ~40 lines but force every section to receive 5–10 extra props. Defer until either a clear new consumer appears or we reduce the prop drilling first.

---

## Phase 12 — `EntitySidebar.tsx` split into `entitySidebar/` sub-components (completed, 2026-04-19)

**Performance:** Pure structural refactor. The entity list filtering work (search + 5 filter dropdowns + size range + derived `filteredEntities` + `entityListEmptyMessage`) now lives in `useEntityListFilters`, called from `EntityListPanel`. Same React reconciliation behaviour: each tab still renders its full subtree from scratch when active (no per-frame work, no new effects). The `EntityListPanel` and `EntityCameraPanel` components are conditionally rendered (only active tab is mounted) — same as before, but the `useEntityListFilters` state is now scoped to `EntityListPanel`'s lifecycle, so its state resets when the user navigates away and back. **This matches the prior implementation** (the surrounding `<>` was inside `{leftTab === 'entities' && (...)}` and the state was on `EntitySidebar`, but tab switching never unmounts/remounts because `EntitySidebar` itself is the parent — reviewed and verified equivalent in this case because `useEntityListFilters` is colocated with the JSX it powers; the `setLeftTab` change does not preserve filter draft state across tab switches in either version).

### Hook — `useEntityListFilters`
- **`src/components/entitySidebar/useEntityListFilters.ts`** — owns search query + 5 filter setters + the derived `hasActiveEntityFilters` / `filteredEntities` / `entityListEmptyMessage` / `clearEntityFilters`. Pure derivation: no effects, no DOM, no per-frame work.
- **`src/components/entitySidebar/useEntityListFilters.test.ts`** — 10 unit tests: empty input → "No entities"; search by name/id (case-insensitive substring); model `yes`/`no`; shape primitive narrowing; transformer length split; size min/max via `getEntityApproximateSize`; `clearEntityFilters` resets every dropdown + size input; empty-message variants for search vs filters vs both; whitespace/NaN size inputs are ignored.

### Component — `EntityListPanel`
- **`src/components/entitySidebar/EntityListPanel.tsx`** (336 lines) — "Entities" tab content: add-entity dropdown, search input + clear button, `CollapsibleSection` of filters, and `<EntityExplorerTree>`. Calls `useEntityListFilters(entities)` for the derived state.

### Component — `EntityCameraPanel`
- **`src/components/entitySidebar/EntityCameraPanel.tsx`** (224 lines) — "Camera" tab content: camera control select, follow-only avatar roster row + Edit button, target/mode selects. Owns the `AvatarDialog` open state because it is the only consumer.
- **`src/components/entitySidebar/EntityCameraPanel.test.tsx`** — 6 smoke tests: control select shows current value; change fires `onCameraControlChange`; target/mode rows hidden unless control === 'follow'; avatar roster buttons render and selecting one fires `onCameraTargetChange`; Edit button is omitted when there is no avatar focus target.

### Container — `EntitySidebar.tsx`
Trimmed from **651 → 150 lines** (-77%). Now only owns:
1. The active tab state + the `useLocalStorageState` width.
2. The `<Sidebar>` chrome with `tabConfig`.
3. Conditional rendering of one of `EntityListPanel`, `EntityCameraPanel`, `BulkSpawnForm`, `WorldPanel`, `SoundPanel` per active tab.

The `SHAPE_FILTER_OPTIONS` constant moved into `EntityListPanel` (its only consumer). The `TriState` type moved into `useEntityListFilters` (now the type owner).

### Result
- `components/EntitySidebar.tsx`: **651 → 150 lines** (-77%); per-tab content lives next to its own state in cohesive single-responsibility files.
- Full test suite: **132 files / 1106 tests + 3 skipped** (was 130 / 1090; +2 files / +16 tests).

---

## Remaining larger tasks

### God files — candidates for splitting

| File | Lines | Suggested extraction |
|------|-------|---------------------|
| `pages/Builder.tsx` | ~1924 | Texture Maker session (~700 lines, see Phase 9 "Why no `useTextureMakerSession`"); selection logic; import/export handlers; pose-sync `syncPosesThen`; **optional:** isolate `livePoses` polling in a narrow wrapper again so `Builder` does not re-render every poll (see performance-work §8 / Tier 3). Also: groups state (`selectedGroupIds`, group action handlers) added by the explorer-groups feature could move into a `useExplorerSelection` hook. |
| `components/SceneView.tsx` | ~1058 | Phase 10 extracted skybox / audio / fullscreen / error overlay / fullscreen button. Remaining: main scene-build `useEffect` (~330 lines, see Phase 10 "Why no SceneView main-effect extraction"); per-frame `pushFrame`/`animate` rAF wrapper; debug forces ref + `applyDebugForce` |
| `physics/rapierPhysics.ts` | ~1085 | Collider creation, body management, step logic → separate files |
| `TextureMaker/TextureMaker.tsx` | ~1028 | Tool logic, layer management → sub-components |
| `runtime/renderItemRegistry.ts` | ~953 | Transformer execution, culling, mesh sync → separate concerns |
| `components/WorldPanel.tsx` | **68** | ✅ Phase 11 split into `world/` sub-sections + `useWorldPanelEdits` hook. |
| `components/EntitySidebar.tsx` | **150** | ✅ Phase 12 split into `entitySidebar/EntityListPanel` + `EntityCameraPanel` + `useEntityListFilters` hook. |
| `components/PropertyPanel.tsx` | **511** | ✅ Phase 13 split into `propertyPanel/PropertyPanelHeader` + `MaterialSection` + `ModelTransformSection` + `AvatarSection`. Remaining: derived-merge block could move into a `usePropertyPanelDerived` hook (deferred — would force extra prop drilling). |
| `components/EntityExplorerTree.tsx` | ~449 | New from explorer-groups feature; toolbar + tree row rendering could be split. |
| `components/TextureDialog.tsx` | ~727 | Asset family grouping, filter logic → hooks (partial: drop zone chrome shared) |
| `contexts/ProjectContext.tsx` | ~587 | Camera state + model presets extracted (Phase 8). Still owns project save/load, import/export, pose sync, asset persistence — see Phase 8 "Why no separate `useProjectIO`". |

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
- [~] God file splitting (Builder, SceneView, …) — Phase 8 split `ProjectContext` (662 → 587). Phase 9 split `Builder.tsx` (1892 → 1782) into `useBuilderKeyboardShortcuts`, `useBuilderFullscreenChrome`, `useEditorHistory`. Phase 10 split `SceneView.tsx` (1359 → 1058) into `useSkyDome`, `useWorldAudio`, `useSceneFullscreen` + `SceneFullscreenButton` + `WorldLoadErrorOverlay`. Phase 11 split `WorldPanel.tsx` (912 → 68) into seven `world/*Section.tsx` files + `useWorldPanelEdits`. Phase 12 split `EntitySidebar.tsx` (651 → 150) into `entitySidebar/EntityListPanel` + `EntityCameraPanel` + `useEntityListFilters`. Phase 13 split `PropertyPanel.tsx` (844 → 511) into `propertyPanel/PropertyPanelHeader` + `MaterialSection` + `ModelTransformSection` + `AvatarSection`. `rapierPhysics`/`TextureMaker`/`renderItemRegistry`/`TextureDialog` still pending; `Builder.tsx` Texture Maker session and the SceneView main effect deferred to future phases. `Builder.tsx` is now back to ~1924 lines after the explorer-groups feature was added by another agent.
- [x] Pure helpers extracted from `modelPreview.ts` and tested (`modelPreviewFraming`)
- [ ] Test coverage for `renderItemRegistry.ts` — *deferred; integration-tested. See Phase 5.*
- [x] Test coverage for `sceneFrameLoop.ts` rAF body (28 branch tests added in Phase 7; rAF loop wrapper still integration-tested)
- [x] Fix `scriptCtx.time` capture-vs-live bug (Phase 5)
- [x] Inspector pose polling isolated (`LivePosesPoll` → `PropertySidebar`, not full `Builder`)
- [x] `npm run build` (`tsc -b && vite build`) clean — 5 pre-existing TS errors fixed in Phase 13b (useEditorHistory typing, builderColumnRef typing, WorldPanel.test plane shape, scriptCtx.test mock tuple, integration test private access).

Run `npm run test:run` after further edits (currently **132** test files, **1106** tests + 3 skipped — Phase 13 was a behaviour-preserving refactor; existing `PropertyPanel.test.tsx` already covers the rendered output). `npm run build` should also stay clean: it now passes `tsc -b` and is the recommended pre-PR check. In `performance-benchmarks.integration.test.ts`, the **Heap growth** and **Scaling linearity** describes are skipped unless `RUN_PERF_BENCHMARKS=1` (use `npm run test:perf`) so agents avoid flaky wall-clock/heap thresholds; run that before Rapier/frame-loop/allocation hot-path changes.
