# Where To Find What

This file maps the repository structure and gives a short description of each tracked file.

## Folder Structure

```text
.
├── .cursor
│   └── .gitignore
├── .gitignore
├── .idea
│   ├── .gitignore
│   ├── inspectionProfiles
│   │   └── Project_Default.xml
│   ├── modules.xml
│   ├── renn.iml
│   └── vcs.xml
├── .vscode
│   └── launch.json
├── README.md
├── UI_LOGGING.md
├── agent-context
│   ├── README.md
│   ├── architecture.md
│   ├── bugfix-spinning.md
│   ├── codebase-cleanup-audit.md
│   ├── direction-rotation-coordinates.md
│   ├── example-worlds.md
│   ├── feature-inspector.md
│   ├── feature-lod.md
│   ├── feature-scripting.md
│   ├── feature-texture-compositor.md
│   ├── feature-transformers.md
│   ├── feature-world-update-reload.md
│   ├── performance-work.md
│   ├── project-status.md
│   ├── script-examples.md
│   ├── start-here.md
│   └── transformer-paradigm-input-and-car2.md
├── docs
│   └── transformer-pattern-llm.md
├── e2e
│   ├── add-entity.spec.ts
│   ├── fixtures
│   │   ├── README.md
│   │   ├── brush-1x1.png
│   │   └── giraffe-world.json
│   ├── helpers
│   │   ├── buildGiraffeFixture.ts
│   │   └── importWorld.ts
│   ├── model-preset-panel.spec.ts
│   ├── multi-select.spec.ts
│   ├── performance-booster-giraffe.spec.ts
│   ├── performance-booster.spec.ts
│   ├── script-panel-layout.spec.ts
│   ├── texture-brush-color.spec.ts
│   └── texture-maker-painting.spec.ts
├── eslint.config.js
├── examples
│   └── airplane-world.json
├── favicon.ico
├── index.html
├── package-lock.json
├── package.json
├── playwright.config.ts
├── public
│   ├── .nojekyll
│   ├── favicon.svg
│   └── world
│       ├── assets
│       │   ├── 32254bdb72b2477224edbcfd2e6228d7.bin
│       │   ├── 6385886491_5242390365_b.bin
│       │   ├── Bildschirmfoto_vom_2026-03-06_16-45-13.png
│       │   ├── PXL_20250810_083457073.bin
│       │   ├── PXL_20250817_114541105.bin
│       │   ├── PXL_20250817_114554452_2.bin
│       │   ├── PXL_20250907_120647394.bin
│       │   ├── PXL_20250922_151148340.bin
│       │   ├── PXL_20251214_115852767.bin
│       │   ├── PXL_20260103_225022988.bin
│       │   ├── PXL_20260117_160120714-EDIT.bin
│       │   ├── PXL_20260201_130221188.bin
│       │   ├── PXL_20260301_124404330_3.bin
│       │   ├── PXL_20260301_124415823_2.bin
│       │   ├── PXL_20260306_220016074.bin
│       │   ├── PXL_20260307_104306918.bin
│       │   ├── Stunning Bruticus-Esboo.bin
│       │   ├── Stunning_Bruticus-Esboo_1.bin
│       │   ├── affenkopf.bin
│       │   ├── auto_1.bin
│       │   ├── baumkrone.bin
│       │   ├── c99d8623-9469-4ccd-a88d-74e428637ff1.bin
│       │   ├── caner-ercan-highresscreenshot00014-kopya.bin
│       │   ├── earth.bin
│       │   ├── elefant(1).glb
│       │   ├── flugzeug bunt.glb
│       │   ├── flugzeug.bin
│       │   ├── giraffe.glb
│       │   ├── image.bin
│       │   ├── street.bin
│       │   ├── teapot.bin
│       │   ├── textures-wood-thumb.bin
│       │   ├── windows.bin
│       │   └── woven-rug-texture.bin
│       └── world.json
├── renn@0.0.0
├── screenshots
│   ├── 01-initial-page.png
│   ├── 02-scripts-tab-opened.png
│   ├── 03-with-resize-handle.png
│   └── 05-final-state.png
├── src
│   ├── App.tsx
│   ├── assets
│   │   └── game-hud-steering-wheel.png
│   ├── camera
│   │   ├── cameraController.test.ts
│   │   └── cameraController.ts
│   ├── components
│   │   ├── AssetPanel.tsx
│   │   ├── AvatarDialog.test.tsx
│   │   ├── AvatarDialog.tsx
│   │   ├── BrushToolPopover.css
│   │   ├── BrushToolPopover.tsx
│   │   ├── BuilderHeader.brush-color.test.tsx
│   │   ├── BuilderHeader.tsx
│   │   ├── BulkSpawnForm.tsx
│   │   ├── CollapsibleSection.tsx
│   │   ├── CopyableArea.tsx
│   │   ├── DraggableNumberField.tsx
│   │   ├── DropdownMenu.tsx
│   │   ├── EntityPanelIcons.tsx
│   │   ├── EntityScriptEditor.tsx
│   │   ├── EntitySidebar.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── FrameStatsOverlay.tsx
│   │   ├── GameHud.tsx
│   │   ├── GizmoModeIcons.tsx
│   │   ├── InspectorLivePoseBridge.test.tsx
│   │   ├── InspectorLivePoseBridge.tsx
│   │   ├── MaterialEditor.tsx
│   │   ├── MenuBar.tsx
│   │   ├── Modal.tsx
│   │   ├── ModelDialog.tsx
│   │   ├── ModelEditor.tsx
│   │   ├── ModelPresetPanel.tsx
│   │   ├── ModelThumbnail.tsx
│   │   ├── PerformanceBoosterDialog.tsx
│   │   ├── PhysicsEditor.tsx
│   │   ├── PropertyPanel.test.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── PropertySidebar.tsx
│   │   ├── SaveDialog.tsx
│   │   ├── SceneView.test.tsx
│   │   ├── SceneView.tsx
│   │   ├── ScriptDialog.tsx
│   │   ├── ScriptPanel.test.tsx
│   │   ├── ScriptPanel.tsx
│   │   ├── ScriptPanelMultiSelect.tsx
│   │   ├── ScriptSnackbar.tsx
│   │   ├── ShapeEditor.tsx
│   │   ├── SidebarTabs.tsx
│   │   ├── SidebarToggleButton.tsx
│   │   ├── SoundPanel.tsx
│   │   ├── SplashScreen.tsx
│   │   ├── Switch.test.tsx
│   │   ├── Switch.tsx
│   │   ├── TabIcons.tsx
│   │   ├── TextureDialog.tsx
│   │   ├── TextureMaker
│   │   │   ├── LayerTransformOverlay.tsx
│   │   │   ├── TextureMaker.css
│   │   │   ├── TextureMaker.tsx
│   │   │   └── TextureMakerBrushPopover.tsx
│   │   ├── TextureThumbnail.tsx
│   │   ├── TransformEditor.tsx
│   │   ├── TransformerEditor.test.tsx
│   │   ├── TransformerEditor.tsx
│   │   ├── TransformerFieldReference.tsx
│   │   ├── TransformerTemplateDialog.test.tsx
│   │   ├── TransformerTemplateDialog.tsx
│   │   ├── Vec3Field.tsx
│   │   ├── WarningSnackbar.tsx
│   │   ├── WorldPanel.tsx
│   │   ├── form
│   │   │   ├── NumberInput.tsx
│   │   │   ├── SelectInput.tsx
│   │   │   └── VectorField.tsx
│   │   ├── layout
│   │   │   └── Sidebar.tsx
│   │   └── sharedStyles.ts
│   ├── config
│   │   ├── constants.ts
│   │   └── theme.ts
│   ├── contexts
│   │   ├── CopyContext.test.tsx
│   │   ├── CopyContext.tsx
│   │   ├── EditorUndoContext.tsx
│   │   ├── ProjectContext.test.tsx
│   │   └── ProjectContext.tsx
│   ├── data
│   │   ├── entityDefaults.test.ts
│   │   ├── entityDefaults.ts
│   │   ├── modelPresets.ts
│   │   ├── sampleWorld.ts
│   │   └── transformerPresets
│   │       ├── README.md
│   │       ├── car2
│   │       │   ├── .gitkeep
│   │       │   ├── default.json
│   │       │   └── fast.json
│   │       ├── follow
│   │       │   └── default.json
│   │       ├── input
│   │       │   ├── .gitkeep
│   │       │   ├── keyboard-car.json
│   │       │   └── keyboard-person.json
│   │       ├── kinematicMovement
│   │       │   └── default.json
│   │       ├── loader.test.ts
│   │       ├── loader.ts
│   │       ├── person
│   │       │   └── default.json
│   │       ├── targetPoseInput
│   │       │   └── default.json
│   │       └── wanderer
│   │           └── default.json
│   ├── editor
│   │   ├── bakeScaleIntoShape.test.ts
│   │   ├── bakeScaleIntoShape.ts
│   │   ├── editorHistory.test.ts
│   │   ├── editorHistory.ts
│   │   ├── transformGizmoController.test.ts
│   │   └── transformGizmoController.ts
│   ├── hooks
│   │   ├── useKeyboardInput.ts
│   │   ├── useLocalStorageState.ts
│   │   └── useProjectContext.ts
│   ├── index.css
│   ├── input
│   │   ├── inputManager.ts
│   │   ├── inputMapping.test.ts
│   │   ├── inputMapping.ts
│   │   ├── inputPresets.ts
│   │   ├── rawInput.test.ts
│   │   ├── rawInput.ts
│   │   ├── rawMouseDrag.test.ts
│   │   └── rawMouseDrag.ts
│   ├── loader
│   │   ├── assetResolver.ts
│   │   ├── assetResolverImpl.test.ts
│   │   ├── assetResolverImpl.ts
│   │   ├── createPrimitive.test.ts
│   │   ├── createPrimitive.ts
│   │   ├── floorSaveLoad.test.ts
│   │   ├── loadWorld.test.ts
│   │   ├── loadWorld.ts
│   │   ├── loadWorldFromStatic.test.ts
│   │   ├── loadWorldFromStatic.ts
│   │   ├── planeGeometryConstants.ts
│   │   ├── prefetchMaterialTextures.test.ts
│   │   ├── prefetchMaterialTextures.ts
│   │   ├── shapeWireframeOverlay.test.ts
│   │   └── shapeWireframeOverlay.ts
│   ├── main.tsx
│   ├── pages
│   │   ├── Builder.test.tsx
│   │   ├── Builder.tsx
│   │   └── Play.tsx
│   ├── persistence
│   │   ├── indexedDb.test.ts
│   │   ├── indexedDb.ts
│   │   └── types.ts
│   ├── physics
│   │   ├── forceAccumulation.test.ts
│   │   ├── rapierPhysics.test.ts
│   │   └── rapierPhysics.ts
│   ├── runtime
│   │   ├── avatarSession.test.ts
│   │   ├── avatarSession.ts
│   │   ├── frameTiming.ts
│   │   ├── renderItem.test.ts
│   │   ├── renderItem.ts
│   │   ├── renderItemRegistry.ts
│   │   ├── restoreInitialPoses.ts
│   │   └── sceneFrameLoop.ts
│   ├── schema
│   │   ├── validate.test.ts
│   │   └── validate.ts
│   ├── scripts
│   │   ├── gameApi.test.ts
│   │   ├── gameApi.ts
│   │   ├── migrateWorld.test.ts
│   │   ├── migrateWorld.ts
│   │   ├── scriptCtx.ts
│   │   ├── scriptCtxDecl.ts
│   │   ├── scriptDef.ts
│   │   ├── scriptRunner.test.ts
│   │   └── scriptRunner.ts
│   ├── test
│   │   ├── helpers
│   │   │   ├── benchmarkUtils.ts
│   │   │   ├── entity.ts
│   │   │   ├── mocks.ts
│   │   │   ├── physics.ts
│   │   │   ├── react.tsx
│   │   │   ├── three.ts
│   │   │   ├── transformer.ts
│   │   │   ├── world.ts
│   │   │   └── worldSimulator.ts
│   │   ├── scenarios
│   │   │   ├── avatar-preferred-camera.integration.test.ts
│   │   │   ├── box-model-material.test.ts
│   │   │   ├── box-model-simplification-texture.test.ts
│   │   │   ├── car-input-direction.test.ts
│   │   │   ├── car-movement.test.ts
│   │   │   ├── car-steering.test.ts
│   │   │   ├── car2-tire-grip.test.ts
│   │   │   ├── model-presets.integration.test.ts
│   │   │   ├── moving-platform-car-steer.test.ts
│   │   │   ├── moving-platform-friction.test.ts
│   │   │   ├── performance-benchmarks.integration.test.ts
│   │   │   ├── shadow-follow-camera.integration.test.ts
│   │   │   ├── texture-brush.integration.test.ts
│   │   │   ├── texture-maker.integration.test.tsx
│   │   │   ├── trimesh-simplification-model-colors.test.ts
│   │   │   ├── trimesh-texture-uv-integration.test.ts
│   │   │   └── trimesh-visual-physics-alignment.integration.test.ts
│   │   ├── setup.ts
│   │   └── worlds
│   │       ├── car-test-world.json
│   │       ├── moving-platform-box-world.json
│   │       └── moving-platform-car-world.json
│   ├── transformers
│   │   ├── integration.test.ts
│   │   ├── presets
│   │   │   ├── car2Transformer.test.ts
│   │   │   ├── car2Transformer.ts
│   │   │   ├── followTransformer.test.ts
│   │   │   ├── followTransformer.ts
│   │   │   ├── inputTransformer.test.ts
│   │   │   ├── inputTransformer.ts
│   │   │   ├── kinematicMovementTransformer.test.ts
│   │   │   ├── kinematicMovementTransformer.ts
│   │   │   ├── personTransformer.test.ts
│   │   │   ├── personTransformer.ts
│   │   │   ├── targetPoseInputTransformer.test.ts
│   │   │   ├── targetPoseInputTransformer.ts
│   │   │   ├── wandererTransformer.test.ts
│   │   │   └── wandererTransformer.ts
│   │   ├── transformer.test.ts
│   │   ├── transformer.ts
│   │   ├── transformerParamDocs.test.ts
│   │   ├── transformerParamDocs.ts
│   │   ├── transformerPresets.test.ts
│   │   ├── transformerPresets.ts
│   │   ├── transformerRegistry.test.ts
│   │   └── transformerRegistry.ts
│   ├── types
│   │   ├── camera.ts
│   │   ├── editor.ts
│   │   ├── sceneUserData.ts
│   │   ├── transformer.ts
│   │   ├── world.cameraMode.test.ts
│   │   ├── world.distanceCulling.test.ts
│   │   └── world.ts
│   ├── utils
│   │   ├── assetExport.test.ts
│   │   ├── assetExport.ts
│   │   ├── assetId.ts
│   │   ├── assetUpload.ts
│   │   ├── avatarUtils.test.ts
│   │   ├── avatarUtils.ts
│   │   ├── bakeSimplifiedModelAsset.test.ts
│   │   ├── bakeSimplifiedModelAsset.ts
│   │   ├── clearCache.test.ts
│   │   ├── clearCache.ts
│   │   ├── clonePlacement.test.ts
│   │   ├── clonePlacement.ts
│   │   ├── colorUtils.ts
│   │   ├── distanceCullingMath.test.ts
│   │   ├── distanceCullingMath.ts
│   │   ├── editorConstants.ts
│   │   ├── entityApproximateSize.test.ts
│   │   ├── entityApproximateSize.ts
│   │   ├── entityAvatarValidation.ts
│   │   ├── entityInspectorMerge.test.ts
│   │   ├── entityInspectorMerge.ts
│   │   ├── entityPicking.test.ts
│   │   ├── entityPicking.ts
│   │   ├── geometryExtractor.test.ts
│   │   ├── geometryExtractor.ts
│   │   ├── idGenerator.ts
│   │   ├── jsonTextareaRows.test.ts
│   │   ├── jsonTextareaRows.ts
│   │   ├── layerTransformHandles.test.ts
│   │   ├── layerTransformHandles.ts
│   │   ├── lightUtils.test.ts
│   │   ├── lightUtils.ts
│   │   ├── meshSimplifier.scenarios.test.ts
│   │   ├── meshSimplifier.test.ts
│   │   ├── meshSimplifier.ts
│   │   ├── meshWorldExtent.test.ts
│   │   ├── meshWorldExtent.ts
│   │   ├── mixedShapeDimensions.test.ts
│   │   ├── mixedShapeDimensions.ts
│   │   ├── modelManager.test.ts
│   │   ├── modelManager.ts
│   │   ├── modelPreview.ts
│   │   ├── monacoExtraLib.ts
│   │   ├── multiSelectShapeChange.test.ts
│   │   ├── multiSelectShapeChange.ts
│   │   ├── normalizeModelTextureUVs.test.ts
│   │   ├── normalizeModelTextureUVs.ts
│   │   ├── normalizeModelToUnitCube.test.ts
│   │   ├── normalizeModelToUnitCube.ts
│   │   ├── numberUtils.ts
│   │   ├── paintAssetRouting.test.ts
│   │   ├── paintAssetRouting.ts
│   │   ├── rotationUtils.test.ts
│   │   ├── rotationUtils.ts
│   │   ├── sceneDependencyKey.test.ts
│   │   ├── sceneDependencyKey.ts
│   │   ├── shadowBounds.ts
│   │   ├── shapeConversion.test.ts
│   │   ├── shapeConversion.ts
│   │   ├── textureAssetVersioning.test.ts
│   │   ├── textureAssetVersioning.ts
│   │   ├── textureCompositor.test.ts
│   │   ├── textureCompositor.ts
│   │   ├── textureDownscale.test.ts
│   │   ├── textureDownscale.ts
│   │   ├── textureMakerHistory.test.ts
│   │   ├── textureMakerHistory.ts
│   │   ├── textureManager.test.ts
│   │   ├── textureManager.ts
│   │   ├── texturePaint.test.ts
│   │   ├── texturePaint.ts
│   │   ├── transformTargetReach.ts
│   │   ├── trimeshTransform.ts
│   │   ├── trimeshVisualPhysicsAlignment.ts
│   │   ├── uiLogger.ts
│   │   ├── vec3.ts
│   │   └── worldUtils.ts
│   └── vite-env.d.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── vite
├── vite.config.ts
└── world-schema.json
```

## File Index

### `.cursor/.gitignore`
- Project file used by build/runtime/docs.

### `.gitignore`
- Project file used by build/runtime/docs.

### `.idea/.gitignore`
- Project file used by build/runtime/docs.

### `.idea/inspectionProfiles/Project_Default.xml`
- Project file used by build/runtime/docs.

### `.idea/modules.xml`
- Project file used by build/runtime/docs.

### `.idea/renn.iml`
- Project file used by build/runtime/docs.

### `.idea/vcs.xml`
- Project file used by build/runtime/docs.

### `.vscode/launch.json`
- JSON-like project data/config file.

### `README.md`
- Documentation page: Renn.

### `UI_LOGGING.md`
- Documentation page: UI Interaction Logging.

### `agent-context/README.md`
- Documentation page: Agent context.

### `agent-context/architecture.md`
- Documentation page: Renn – Architecture.

### `agent-context/bugfix-spinning.md`
- Documentation page: Bug Reference: Physics Force Accumulation (Spinning).

### `agent-context/codebase-cleanup-audit.md`
- Documentation page: Renn codebase cleanup audit.

### `agent-context/direction-rotation-coordinates.md`
- Documentation page: Direction / rotation coordinates.

### `agent-context/example-worlds.md`
- Documentation page: Example Worlds and Test Fixtures.

### `agent-context/feature-inspector.md`
- Documentation page: Inspector (Property panel).

### `agent-context/feature-lod.md`
- Documentation page: Multi-Resolution LOD (Level of Detail).

### `agent-context/feature-scripting.md`
- Documentation page: Scripting – Current State & Roadmap.

### `agent-context/feature-texture-compositor.md`
- Documentation page: Texture compositor & non-destructive paint.

### `agent-context/feature-transformers.md`
- Documentation page: Transformers.

### `agent-context/feature-world-update-reload.md`
- Documentation page: World update path and minimal rebuild strategy.

### `agent-context/performance-work.md`
- Documentation page: Performance work backlog.

### `agent-context/project-status.md`
- Documentation page: Renn – Project Status.

### `agent-context/script-examples.md`
- Documentation page: Script Examples.

### `agent-context/start-here.md`
- Documentation page: Renn – Start Here.

### `agent-context/transformer-paradigm-input-and-car2.md`
- Documentation page: Input transformer + Car2: paradigms and transferability.

### `docs/transformer-pattern-llm.md`
- Documentation page: Transformer Pattern — LLM-Friendly Guide.

### `e2e/add-entity.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/fixtures/README.md`
- Automated tests covering behavior and regressions.
- Documentation page: E2E fixtures (GLB / world ZIP).

### `e2e/fixtures/brush-1x1.png`
- Automated tests covering behavior and regressions.
- Static binary asset used by the app or docs.

### `e2e/fixtures/giraffe-world.json`
- Automated tests covering behavior and regressions.
- JSON data/config with keys: version, world, entities, assets, scripts.

### `e2e/helpers/buildGiraffeFixture.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/helpers/importWorld.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/model-preset-panel.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/multi-select.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/performance-booster-giraffe.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/performance-booster.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/script-panel-layout.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/texture-brush-color.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `e2e/texture-maker-painting.spec.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `eslint.config.js`
- Project tooling and build/test configuration.
- Runtime or configuration source code.

### `examples/airplane-world.json`
- JSON data/config with keys: version, world, entities, assets, scripts.

### `favicon.ico`
- Static binary asset used by the app or docs.

### `index.html`
- HTML entry point/template.

### `package-lock.json`
- Project tooling and build/test configuration.
- JSON data/config with keys: name, version, lockfileVersion, requires, packages.

### `package.json`
- Project tooling and build/test configuration.
- JSON data/config with keys: name, private, version, type, scripts, dependencies, ....

### `playwright.config.ts`
- Project tooling and build/test configuration.
- Runtime or configuration source code.

### `public/.nojekyll`
- Project file used by build/runtime/docs.

### `public/favicon.svg`
- Project file used by build/runtime/docs.

### `public/world/assets/32254bdb72b2477224edbcfd2e6228d7.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/6385886491_5242390365_b.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/Bildschirmfoto_vom_2026-03-06_16-45-13.png`
- Static binary asset used by the app or docs.

### `public/world/assets/PXL_20250810_083457073.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20250817_114541105.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20250817_114554452_2.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20250907_120647394.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20250922_151148340.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20251214_115852767.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260103_225022988.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260117_160120714-EDIT.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260201_130221188.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260301_124404330_3.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260301_124415823_2.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260306_220016074.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/PXL_20260307_104306918.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/Stunning Bruticus-Esboo.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/Stunning_Bruticus-Esboo_1.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/affenkopf.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/auto_1.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/baumkrone.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/c99d8623-9469-4ccd-a88d-74e428637ff1.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/caner-ercan-highresscreenshot00014-kopya.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/earth.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/elefant(1).glb`
- Static binary asset used by the app or docs.

### `public/world/assets/flugzeug bunt.glb`
- Static binary asset used by the app or docs.

### `public/world/assets/flugzeug.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/giraffe.glb`
- Static binary asset used by the app or docs.

### `public/world/assets/image.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/street.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/teapot.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/textures-wood-thumb.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/windows.bin`
- Project file used by build/runtime/docs.

### `public/world/assets/woven-rug-texture.bin`
- Project file used by build/runtime/docs.

### `public/world/world.json`
- JSON data/config with keys: version, world, assets, entities, scripts.

### `renn@0.0.0`
- Project file used by build/runtime/docs.

### `screenshots/01-initial-page.png`
- Static binary asset used by the app or docs.

### `screenshots/02-scripts-tab-opened.png`
- Static binary asset used by the app or docs.

### `screenshots/03-with-resize-handle.png`
- Static binary asset used by the app or docs.

### `screenshots/05-final-state.png`
- Static binary asset used by the app or docs.

### `src/App.tsx`
- Runtime or configuration source code.

### `src/assets/game-hud-steering-wheel.png`
- Static binary asset used by the app or docs.

### `src/camera/cameraController.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/camera/cameraController.ts`
- Runtime or configuration source code.

### `src/components/AssetPanel.tsx`
- Runtime or configuration source code.

### `src/components/AvatarDialog.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/AvatarDialog.tsx`
- Runtime or configuration source code.

### `src/components/BrushToolPopover.css`
- Stylesheet for UI components/layout.

### `src/components/BrushToolPopover.tsx`
- Runtime or configuration source code.

### `src/components/BuilderHeader.brush-color.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/BuilderHeader.tsx`
- Runtime or configuration source code.

### `src/components/BulkSpawnForm.tsx`
- Runtime or configuration source code.

### `src/components/CollapsibleSection.tsx`
- Runtime or configuration source code.

### `src/components/CopyableArea.tsx`
- Runtime or configuration source code.

### `src/components/DraggableNumberField.tsx`
- Runtime or configuration source code.

### `src/components/DropdownMenu.tsx`
- Runtime or configuration source code.

### `src/components/EntityPanelIcons.tsx`
- Runtime or configuration source code.

### `src/components/EntityScriptEditor.tsx`
- Runtime or configuration source code.

### `src/components/EntitySidebar.tsx`
- Runtime or configuration source code.

### `src/components/ErrorBoundary.tsx`
- Runtime or configuration source code.

### `src/components/FrameStatsOverlay.tsx`
- Runtime or configuration source code.

### `src/components/GameHud.tsx`
- Runtime or configuration source code.

### `src/components/GizmoModeIcons.tsx`
- Runtime or configuration source code.

### `src/components/InspectorLivePoseBridge.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/InspectorLivePoseBridge.tsx`
- Runtime or configuration source code.

### `src/components/MaterialEditor.tsx`
- Runtime or configuration source code.

### `src/components/MenuBar.tsx`
- Runtime or configuration source code.

### `src/components/Modal.tsx`
- Runtime or configuration source code.

### `src/components/ModelDialog.tsx`
- Runtime or configuration source code.

### `src/components/ModelEditor.tsx`
- Runtime or configuration source code.

### `src/components/ModelPresetPanel.tsx`
- Runtime or configuration source code.

### `src/components/ModelThumbnail.tsx`
- Runtime or configuration source code.

### `src/components/PerformanceBoosterDialog.tsx`
- Runtime or configuration source code.

### `src/components/PhysicsEditor.tsx`
- Runtime or configuration source code.

### `src/components/PropertyPanel.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/PropertyPanel.tsx`
- Runtime or configuration source code.

### `src/components/PropertySidebar.tsx`
- Runtime or configuration source code.

### `src/components/SaveDialog.tsx`
- Runtime or configuration source code.

### `src/components/SceneView.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/SceneView.tsx`
- Runtime or configuration source code.

### `src/components/ScriptDialog.tsx`
- Runtime or configuration source code.

### `src/components/ScriptPanel.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/ScriptPanel.tsx`
- Runtime or configuration source code.

### `src/components/ScriptPanelMultiSelect.tsx`
- Runtime or configuration source code.

### `src/components/ScriptSnackbar.tsx`
- Runtime or configuration source code.

### `src/components/ShapeEditor.tsx`
- Runtime or configuration source code.

### `src/components/SidebarTabs.tsx`
- Runtime or configuration source code.

### `src/components/SidebarToggleButton.tsx`
- Runtime or configuration source code.

### `src/components/SoundPanel.tsx`
- Runtime or configuration source code.

### `src/components/SplashScreen.tsx`
- Runtime or configuration source code.

### `src/components/Switch.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/Switch.tsx`
- Runtime or configuration source code.

### `src/components/TabIcons.tsx`
- Runtime or configuration source code.

### `src/components/TextureDialog.tsx`
- Runtime or configuration source code.

### `src/components/TextureMaker/LayerTransformOverlay.tsx`
- Runtime or configuration source code.

### `src/components/TextureMaker/TextureMaker.css`
- Stylesheet for UI components/layout.

### `src/components/TextureMaker/TextureMaker.tsx`
- Runtime or configuration source code.

### `src/components/TextureMaker/TextureMakerBrushPopover.tsx`
- Runtime or configuration source code.

### `src/components/TextureThumbnail.tsx`
- Runtime or configuration source code.

### `src/components/TransformEditor.tsx`
- Runtime or configuration source code.

### `src/components/TransformerEditor.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/TransformerEditor.tsx`
- Runtime or configuration source code.

### `src/components/TransformerFieldReference.tsx`
- Runtime or configuration source code.

### `src/components/TransformerTemplateDialog.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/components/TransformerTemplateDialog.tsx`
- Runtime or configuration source code.

### `src/components/Vec3Field.tsx`
- Runtime or configuration source code.

### `src/components/WarningSnackbar.tsx`
- Runtime or configuration source code.

### `src/components/WorldPanel.tsx`
- Runtime or configuration source code.

### `src/components/form/NumberInput.tsx`
- Runtime or configuration source code.

### `src/components/form/SelectInput.tsx`
- Runtime or configuration source code.

### `src/components/form/VectorField.tsx`
- Runtime or configuration source code.

### `src/components/layout/Sidebar.tsx`
- Runtime or configuration source code.

### `src/components/sharedStyles.ts`
- Runtime or configuration source code.

### `src/config/constants.ts`
- Runtime or configuration source code.

### `src/config/theme.ts`
- Runtime or configuration source code.

### `src/contexts/CopyContext.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/contexts/CopyContext.tsx`
- Runtime or configuration source code.

### `src/contexts/EditorUndoContext.tsx`
- Runtime or configuration source code.

### `src/contexts/ProjectContext.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/contexts/ProjectContext.tsx`
- Runtime or configuration source code.

### `src/data/entityDefaults.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/data/entityDefaults.ts`
- Runtime or configuration source code.

### `src/data/modelPresets.ts`
- Runtime or configuration source code.

### `src/data/sampleWorld.ts`
- Runtime or configuration source code.

### `src/data/transformerPresets/README.md`
- Documentation page: Transformer preset templates.

### `src/data/transformerPresets/car2/.gitkeep`
- Project file used by build/runtime/docs.

### `src/data/transformerPresets/car2/default.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/data/transformerPresets/car2/fast.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/data/transformerPresets/follow/default.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/data/transformerPresets/input/.gitkeep`
- Project file used by build/runtime/docs.

### `src/data/transformerPresets/input/keyboard-car.json`
- JSON data/config with keys: type, priority, enabled, inputMapping.

### `src/data/transformerPresets/input/keyboard-person.json`
- JSON data/config with keys: type, priority, enabled, inputMapping.

### `src/data/transformerPresets/kinematicMovement/default.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/data/transformerPresets/loader.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/data/transformerPresets/loader.ts`
- Runtime or configuration source code.

### `src/data/transformerPresets/person/default.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/data/transformerPresets/targetPoseInput/default.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/data/transformerPresets/wanderer/default.json`
- JSON data/config with keys: type, priority, enabled, params.

### `src/editor/bakeScaleIntoShape.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/editor/bakeScaleIntoShape.ts`
- Runtime or configuration source code.

### `src/editor/editorHistory.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/editor/editorHistory.ts`
- Runtime or configuration source code.

### `src/editor/transformGizmoController.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/editor/transformGizmoController.ts`
- Runtime or configuration source code.

### `src/hooks/useKeyboardInput.ts`
- Runtime or configuration source code.

### `src/hooks/useLocalStorageState.ts`
- Runtime or configuration source code.

### `src/hooks/useProjectContext.ts`
- Runtime or configuration source code.

### `src/index.css`
- Stylesheet for UI components/layout.

### `src/input/inputManager.ts`
- Runtime or configuration source code.

### `src/input/inputMapping.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/input/inputMapping.ts`
- Runtime or configuration source code.

### `src/input/inputPresets.ts`
- Runtime or configuration source code.

### `src/input/rawInput.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/input/rawInput.ts`
- Runtime or configuration source code.

### `src/input/rawMouseDrag.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/input/rawMouseDrag.ts`
- Runtime or configuration source code.

### `src/loader/assetResolver.ts`
- Runtime or configuration source code.

### `src/loader/assetResolverImpl.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/assetResolverImpl.ts`
- Runtime or configuration source code.

### `src/loader/createPrimitive.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/createPrimitive.ts`
- Runtime or configuration source code.

### `src/loader/floorSaveLoad.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/loadWorld.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/loadWorld.ts`
- Runtime or configuration source code.

### `src/loader/loadWorldFromStatic.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/loadWorldFromStatic.ts`
- Runtime or configuration source code.

### `src/loader/planeGeometryConstants.ts`
- Runtime or configuration source code.

### `src/loader/prefetchMaterialTextures.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/prefetchMaterialTextures.ts`
- Runtime or configuration source code.

### `src/loader/shapeWireframeOverlay.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/loader/shapeWireframeOverlay.ts`
- Runtime or configuration source code.

### `src/main.tsx`
- Runtime or configuration source code.

### `src/pages/Builder.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/pages/Builder.tsx`
- Runtime or configuration source code.

### `src/pages/Play.tsx`
- Runtime or configuration source code.

### `src/persistence/indexedDb.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/persistence/indexedDb.ts`
- Runtime or configuration source code.

### `src/persistence/types.ts`
- Runtime or configuration source code.

### `src/physics/forceAccumulation.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/physics/rapierPhysics.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/physics/rapierPhysics.ts`
- Runtime or configuration source code.

### `src/runtime/avatarSession.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/runtime/avatarSession.ts`
- Runtime or configuration source code.

### `src/runtime/frameTiming.ts`
- Runtime or configuration source code.

### `src/runtime/renderItem.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/runtime/renderItem.ts`
- Runtime or configuration source code.

### `src/runtime/renderItemRegistry.ts`
- Runtime or configuration source code.

### `src/runtime/restoreInitialPoses.ts`
- Runtime or configuration source code.

### `src/runtime/sceneFrameLoop.ts`
- Runtime or configuration source code.

### `src/schema/validate.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/schema/validate.ts`
- Runtime or configuration source code.

### `src/scripts/gameApi.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/scripts/gameApi.ts`
- Runtime or configuration source code.

### `src/scripts/migrateWorld.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/scripts/migrateWorld.ts`
- Runtime or configuration source code.

### `src/scripts/scriptCtx.ts`
- Runtime or configuration source code.

### `src/scripts/scriptCtxDecl.ts`
- Runtime or configuration source code.

### `src/scripts/scriptDef.ts`
- Runtime or configuration source code.

### `src/scripts/scriptRunner.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/scripts/scriptRunner.ts`
- Runtime or configuration source code.

### `src/test/helpers/benchmarkUtils.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/entity.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/mocks.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/physics.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/react.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/three.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/transformer.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/world.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/helpers/worldSimulator.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/avatar-preferred-camera.integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/box-model-material.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/box-model-simplification-texture.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/car-input-direction.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/car-movement.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/car-steering.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/car2-tire-grip.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/model-presets.integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/moving-platform-car-steer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/moving-platform-friction.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/performance-benchmarks.integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/shadow-follow-camera.integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/texture-brush.integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/texture-maker.integration.test.tsx`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/trimesh-simplification-model-colors.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/trimesh-texture-uv-integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/scenarios/trimesh-visual-physics-alignment.integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/setup.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/test/worlds/car-test-world.json`
- Automated tests covering behavior and regressions.
- JSON data/config with keys: version, world, entities, assets, scripts.

### `src/test/worlds/moving-platform-box-world.json`
- Automated tests covering behavior and regressions.
- JSON data/config with keys: version, world, entities, assets, scripts.

### `src/test/worlds/moving-platform-car-world.json`
- Automated tests covering behavior and regressions.
- JSON data/config with keys: version, world, entities, assets, scripts.

### `src/transformers/integration.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/car2Transformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/car2Transformer.ts`
- Runtime or configuration source code.

### `src/transformers/presets/followTransformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/followTransformer.ts`
- Runtime or configuration source code.

### `src/transformers/presets/inputTransformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/inputTransformer.ts`
- Runtime or configuration source code.

### `src/transformers/presets/kinematicMovementTransformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/kinematicMovementTransformer.ts`
- Runtime or configuration source code.

### `src/transformers/presets/personTransformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/personTransformer.ts`
- Runtime or configuration source code.

### `src/transformers/presets/targetPoseInputTransformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/targetPoseInputTransformer.ts`
- Runtime or configuration source code.

### `src/transformers/presets/wandererTransformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/presets/wandererTransformer.ts`
- Runtime or configuration source code.

### `src/transformers/transformer.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/transformer.ts`
- Runtime or configuration source code.

### `src/transformers/transformerParamDocs.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/transformerParamDocs.ts`
- Runtime or configuration source code.

### `src/transformers/transformerPresets.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/transformerPresets.ts`
- Runtime or configuration source code.

### `src/transformers/transformerRegistry.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/transformers/transformerRegistry.ts`
- Runtime or configuration source code.

### `src/types/camera.ts`
- Runtime or configuration source code.

### `src/types/editor.ts`
- Runtime or configuration source code.

### `src/types/sceneUserData.ts`
- Runtime or configuration source code.

### `src/types/transformer.ts`
- Runtime or configuration source code.

### `src/types/world.cameraMode.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/types/world.distanceCulling.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/types/world.ts`
- Runtime or configuration source code.

### `src/utils/assetExport.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/assetExport.ts`
- Runtime or configuration source code.

### `src/utils/assetId.ts`
- Runtime or configuration source code.

### `src/utils/assetUpload.ts`
- Runtime or configuration source code.

### `src/utils/avatarUtils.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/avatarUtils.ts`
- Runtime or configuration source code.

### `src/utils/bakeSimplifiedModelAsset.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/bakeSimplifiedModelAsset.ts`
- Runtime or configuration source code.

### `src/utils/clearCache.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/clearCache.ts`
- Runtime or configuration source code.

### `src/utils/clonePlacement.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/clonePlacement.ts`
- Runtime or configuration source code.

### `src/utils/colorUtils.ts`
- Runtime or configuration source code.

### `src/utils/distanceCullingMath.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/distanceCullingMath.ts`
- Runtime or configuration source code.

### `src/utils/editorConstants.ts`
- Runtime or configuration source code.

### `src/utils/entityApproximateSize.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/entityApproximateSize.ts`
- Runtime or configuration source code.

### `src/utils/entityAvatarValidation.ts`
- Runtime or configuration source code.

### `src/utils/entityInspectorMerge.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/entityInspectorMerge.ts`
- Runtime or configuration source code.

### `src/utils/entityPicking.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/entityPicking.ts`
- Runtime or configuration source code.

### `src/utils/geometryExtractor.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/geometryExtractor.ts`
- Runtime or configuration source code.

### `src/utils/idGenerator.ts`
- Runtime or configuration source code.

### `src/utils/jsonTextareaRows.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/jsonTextareaRows.ts`
- Runtime or configuration source code.

### `src/utils/layerTransformHandles.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/layerTransformHandles.ts`
- Runtime or configuration source code.

### `src/utils/lightUtils.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/lightUtils.ts`
- Runtime or configuration source code.

### `src/utils/meshSimplifier.scenarios.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/meshSimplifier.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/meshSimplifier.ts`
- Runtime or configuration source code.

### `src/utils/meshWorldExtent.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/meshWorldExtent.ts`
- Runtime or configuration source code.

### `src/utils/mixedShapeDimensions.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/mixedShapeDimensions.ts`
- Runtime or configuration source code.

### `src/utils/modelManager.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/modelManager.ts`
- Runtime or configuration source code.

### `src/utils/modelPreview.ts`
- Runtime or configuration source code.

### `src/utils/monacoExtraLib.ts`
- Runtime or configuration source code.

### `src/utils/multiSelectShapeChange.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/multiSelectShapeChange.ts`
- Runtime or configuration source code.

### `src/utils/normalizeModelTextureUVs.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/normalizeModelTextureUVs.ts`
- Runtime or configuration source code.

### `src/utils/normalizeModelToUnitCube.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/normalizeModelToUnitCube.ts`
- Runtime or configuration source code.

### `src/utils/numberUtils.ts`
- Runtime or configuration source code.

### `src/utils/paintAssetRouting.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/paintAssetRouting.ts`
- Runtime or configuration source code.

### `src/utils/rotationUtils.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/rotationUtils.ts`
- Runtime or configuration source code.

### `src/utils/sceneDependencyKey.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/sceneDependencyKey.ts`
- Runtime or configuration source code.

### `src/utils/shadowBounds.ts`
- Runtime or configuration source code.

### `src/utils/shapeConversion.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/shapeConversion.ts`
- Runtime or configuration source code.

### `src/utils/textureAssetVersioning.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/textureAssetVersioning.ts`
- Runtime or configuration source code.

### `src/utils/textureCompositor.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/textureCompositor.ts`
- Runtime or configuration source code.

### `src/utils/textureDownscale.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/textureDownscale.ts`
- Runtime or configuration source code.

### `src/utils/textureMakerHistory.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/textureMakerHistory.ts`
- Runtime or configuration source code.

### `src/utils/textureManager.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/textureManager.ts`
- Runtime or configuration source code.

### `src/utils/texturePaint.test.ts`
- Automated tests covering behavior and regressions.
- Runtime or configuration source code.

### `src/utils/texturePaint.ts`
- Runtime or configuration source code.

### `src/utils/transformTargetReach.ts`
- Runtime or configuration source code.

### `src/utils/trimeshTransform.ts`
- Runtime or configuration source code.

### `src/utils/trimeshVisualPhysicsAlignment.ts`
- Runtime or configuration source code.

### `src/utils/uiLogger.ts`
- Runtime or configuration source code.

### `src/utils/vec3.ts`
- Runtime or configuration source code.

### `src/utils/worldUtils.ts`
- Runtime or configuration source code.

### `src/vite-env.d.ts`
- Runtime or configuration source code.

### `tsconfig.app.json`
- Project tooling and build/test configuration.
- JSON data/config with keys: compilerOptions, include.

### `tsconfig.json`
- Project tooling and build/test configuration.
- JSON data/config with keys: compilerOptions, include.

### `tsconfig.tsbuildinfo`
- Project file used by build/runtime/docs.

### `vite`
- Project file used by build/runtime/docs.

### `vite.config.ts`
- Project tooling and build/test configuration.
- Runtime or configuration source code.

### `world-schema.json`
- JSON data/config with keys: $schema, $id, title, description, type, required, ....
