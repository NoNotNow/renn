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

## Optional follow-ups

- Unify custom overlays (`SaveDialog`, project picker, `PerformanceBoosterDialog`) on `Modal.tsx` where practical.
- Broader locale/styling tokens (radius scale, full i18n).
- `isGrounded` still TODO in `renderItemRegistry`.

Run `npm run test:run` after further edits.
