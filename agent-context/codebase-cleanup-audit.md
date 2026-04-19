# Renn – Codebase Cleanup Audit

Post-milestone stabilization audit. Multiple agents contributed features; documentation was cleaned up in the prior pass. This audit targets dead code, duplicates, code smells, and consistency issues.

---

## Quick fixes (done in this pass)

### Dead files removed
- `src/types/editor.ts` — exported `BaseEditorProps`, `PoseHandlingProps`, `BasePropertyProps`; never imported anywhere.
- `src/input/inputManager.ts` — `useInputManager` hook; superseded by `rawInput.ts` + `inputMapping.ts`; zero production consumers.
- `src/components/InspectorLivePoseBridge.tsx` + test — `InspectorLivePoseBridge` component; never mounted in the app tree.
- `src/loader/prefetchMaterialTextures.ts` + test — `collectMaterialMapAssetIds` / `scheduleMaterialTextureDecodePrefetch`; no production consumer.

### Unused exports removed
- `src/config/constants.ts`: removed `UI_LOGGER_CONFIG`, `ENTITY_DEFAULTS`, `ASSET_CONFIG`, `PHYSICS_CONFIG`, `MATERIAL_CONFIG`, `GEOMETRY_CONFIG` (zero imports outside the defining file).
- `src/camera/cameraController.ts`: `DEFAULT_FREE_FLY_KEYS` — duplicate of the one in `useKeyboardInput.ts`; only referenced in tests.

### Console.log cleanup
- `src/persistence/indexedDb.ts` — 8 verbose success-path logs gated behind `import.meta.env.DEV`.
- `src/contexts/ProjectContext.tsx` — save log gated behind `import.meta.env.DEV`.
- `src/physics/rapierPhysics.ts` — 3 trimesh diagnostic logs gated behind `import.meta.env.DEV`.
- `src/utils/clearCache.ts` — 2 logs gated behind `import.meta.env.DEV`.
- `src/scripts/gameApi.ts` — `[game]` log kept (runtime API, useful for script authors).

### Duplicated code extracted
- `extractJsonErrorPosition` / `lineColFromPosition` duplicated in `AvatarDialog.tsx` and `TransformerEditor.tsx` → extracted to `src/utils/jsonParseErrorLocation.ts`.

---

## Test-only modules (kept, but flagged)

These files are only imported by tests, not by any production code. They are valid test utilities but should not grow into production dependencies:

- `src/utils/worldUtils.ts` — `updateEntityPosition`; only used in `Builder.test.tsx`.
- `src/utils/trimeshVisualPhysicsAlignment.ts` — only used in integration test.

---

## Larger refactoring tasks (future passes)

### God files — candidates for splitting

| File | Lines | Suggested extraction |
|------|-------|---------------------|
| `pages/Builder.tsx` | ~1900 | Selection logic, undo/redo, texture maker state, import/export handlers → custom hooks |
| `components/SceneView.tsx` | ~1360 | Physics lifecycle, skybox setup, overlay logic → hooks or sub-modules |
| `physics/rapierPhysics.ts` | ~1085 | Collider creation, body management, step logic → separate files |
| `TextureMaker/TextureMaker.tsx` | ~1030 | Tool logic, layer management → sub-components |
| `runtime/renderItemRegistry.ts` | ~970 | Transformer execution, culling, mesh sync → separate concerns |
| `components/WorldPanel.tsx` | ~930 | Ground editing, sim settings, culling UI → sub-panels |
| `components/PropertyPanel.tsx` | ~840 | Could split per-tab content |
| `components/TextureDialog.tsx` | ~720 | Asset family grouping, filter logic → hooks |
| `contexts/ProjectContext.tsx` | ~660 | Persistence actions, camera state → split context or custom hooks |

### Raw hex color migration

~60+ component files still use raw hex values (`#2f3545`, `#1b1f2a`, `#9aa4b2`, `#e6e9f2`, etc.) instead of `config/theme.ts` tokens. Key offenders:

- `TextureDialog.tsx` (~60 hex), `ModelDialog.tsx` (~41), `ScriptDialog.tsx` (~32), `EntityScriptEditor.tsx` (~28), `TransformerEditor.tsx` (~24), `PerformanceBoosterDialog.tsx` (~24), `WorldPanel.tsx` (~22), `BuilderHeader.tsx` (~21), `EntitySidebar.tsx` (~17)
- CSS files: `TextureMaker.css` (~77), `BrushToolPopover.css`, `index.css`

Strategy: For TSX files, import `theme` and replace literals. For CSS, introduce CSS custom properties set from `theme` at app root.

### Duplicated UI patterns

- **Secondary input hover handlers** (`onMouseEnter`/`onMouseLeave` toggling `#222`/`#1a1a1a`): repeated in `MaterialEditor`, `ModelEditor`, `ShapeEditor`, `ModelDialog`, `TextureDialog`. → Extract shared hover style helper.
- **Ground entity patch pattern** in `WorldPanel.tsx`: repeated guard + `entities.map` for color, material, friction, scale. → Extract `patchGroundEntity` helper.
- **JSON textarea + apply button**: similar validation/styling in `AvatarDialog` and `TransformerEditor`. → Consider a shared `ValidatedJsonTextarea` component.
- **`visualBaseQuaternion` handling**: plane rotation offset logic spread across `renderItem.ts`, `transformGizmoController.ts`, `renderItemRegistry.ts`, `createPrimitive.ts`. → Extract pure helpers for apply/remove base quaternion.

### Test coverage gaps

Critical modules without dedicated tests:
- `runtime/renderItemRegistry.ts` (966 lines, core frame sync)
- `runtime/sceneFrameLoop.ts` (383 lines, render loop)
- `scripts/scriptCtx.ts` (330 lines, scripting API surface)
- `utils/assetUpload.ts`, `utils/modelPreview.ts` (asset pipeline)
- `data/modelPresets.ts`, `data/sampleWorld.ts` (data correctness)

52 of 60 component files lack colocated tests (many are covered indirectly by integration tests).

### Consistency observations

- **Import style**: `@/` alias is dominant and correct; some deep relative imports could be switched.
- **Export style**: default exports for React components, named exports for utils/libs — acceptable but could be standardized.
- **Error handling**: ad-hoc (mix of throw, console.error, try/catch); consider a thin error boundary pattern if error reporting grows.
- **File naming**: PascalCase for components, camelCase for utils — consistent except for some kebab-case test scenarios.

---

## Checklist for stabilization

- [x] All 108 test files pass (840 tests)
- [x] Dead files removed
- [x] Unused exports removed
- [x] Console.log gated behind DEV
- [x] Duplicated JSON helpers extracted
- [ ] Raw hex → theme tokens (larger task)
- [ ] God file splitting (larger task)
- [ ] Test coverage for critical modules (larger task)
- [ ] Shared hover/input style helpers (medium task)

Run `npm run test:run` after any further edits.
