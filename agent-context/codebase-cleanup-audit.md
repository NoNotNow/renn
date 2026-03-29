# Renn codebase cleanup audit

Tracks what was cleaned up and what remains optional.

## Done (implementation pass)

- **Dead modules removed:** `TextureSelector.tsx`, `utils/validation.ts`, `input/diagnosticKeyLogger.ts`.
- **Dead exports removed:** `disposeMesh`, deprecated `createSimpleAssetResolver` / `disposeLastSimpleResolver`, `findEntityById*`, `mergeActions`, `getCurrentInputActions`, `getPresetMapping`, unused `AssetResolver` type (kept `GLTF` in `assetResolver.ts`).
- **Debug stripped:** car-specific blocks and friction logs in `rapierPhysics.ts`; no-op lines in `inputTransformer`, `rawInput`, `SceneView`.
- **Props:** `getCurrentPose` removed from `PropertyPanel` / `PropertySidebar` / `Builder` (Builder still uses the callback internally).
- **Consolidation:** `transformTargetReach.ts`, `getScriptDef`, `TRANSFORMER_PRESET_TYPES` + `isPresetTransformerType`, `PresetTransformerType` only in `types/transformer.ts` (loader imports it), exported `isEditableElement` from `rawInput`, `VEC_EPS` in `editorConstants.ts`.
- **Docs:** `feature-transformers` (removed legacy `car`), `example-worlds`, `project-status`, `README`, `agent-context/README`, `architecture`, `feature-inspector` links, `transformerPresets/README`, `world-schema.json` transformer description.
- **Example:** `examples/airplane-world.json` uses only registry types (`car2`, `wanderer`, `kinematicMovement`).
- **UI:** ErrorBoundary reload button uses theme accent `#8ab4ff`; transformer template button uses `EntityPanelIcons.loadTemplate`.
- **Behavior:** `getDefaultTransformerConfig('car2')` matches `DEFAULT_CAR2_PARAMS`; `addRotation` comment matches code; `createTransformer` JSDoc explains async signature.

## Intensification pass (2026-03)

- **IndexedDB:** `DB_CONFIG` in `config/constants.ts` is source of truth (`version: 2`); `persistence/indexedDb.ts` and `utils/clearCache.ts` consume it. `window.__clearCache` typed via `declare global`.
- **Dedup:** `utils/assetId.ts` (`generateAssetIdFromFilename`); `runtime/restoreInitialPoses.ts`; `cameraStateFromWorld()` in `ProjectContext.tsx`.
- **Play URL:** `handlePlay` uses `${BASE_URL}play?world=...` for GitHub Pages basename.
- **Theme:** `config/theme.ts` — `sharedStyles.ts`, `Modal.tsx`, `SaveDialog.tsx`, and parts of `PerformanceBoosterDialog.tsx` use tokens; booster-specific keys under `theme.booster` / `theme.button.*`.
- **Modularity:** `BulkSpawnForm.tsx` (reducer state) extracted from `EntitySidebar.tsx`; per-frame logic in `runtime/sceneFrameLoop.ts` (`runSceneFrame`, `SCENE_FIXED_DT`).
- **Modals:** `SaveDialog` and `PerformanceBoosterDialog` use `Modal.tsx` (portal, ESC, body scroll, z-index).
- **Types:** `Transformer` optional `setRawInputGetter` / `setParams`; `renderItemRegistry` / `gameApi` use `typeof … === 'function'`. `schema/validate.ts` entity id resolution avoids `as any`.

## Optional follow-ups

- Migrate remaining components off raw hex (see ripgrep for `#1b1f2a`, `#2f3545`, etc.) toward `config/theme.ts`.
- Broader locale/styling tokens (radius scale, full i18n).
- `isGrounded` still TODO in `renderItemRegistry`.
- Project picker overlay: unify on `Modal.tsx` if/when it gets a dedicated component.

Run `npm run test:run` after further edits.
