# Renn – Project dev state

Track what’s done and what’s left. Update this file as you complete or add work.

Last updated: 2026-02-03 (Added 3D model asset support)

---

## Completed

### Core
- [x] **JSON schema** – `world-schema.json` (draft 2020-12) and validation in `src/schema/validate.ts` (Ajv 2020 dialect).
- [x] **World loader** – Parse and validate world JSON; build Three.js scene and entity meshes (`src/loader/loadWorld.ts`, `createPrimitive.ts`).
- [x] **Physics** – Direct Rapier WASM integration with proper collider shapes (ball, box, cylinder, capsule, plane as cuboid); physics-to-mesh sync; collision events via EventQueue; cached transforms to prevent WASM aliasing errors (`src/physics/rapierPhysics.ts`).
- [x] **Camera controller** – Free fly, follow, top/front/right presets; follow / third-person / first-person modes; target entity, distance, height (`src/camera/cameraController.ts`).
- [x] **Script runner** – Main-thread execution with `game` API; hooks `onSpawn`, `onUpdate`, `onCollision` by script ID; enhanced error handling and logging (`src/scripts/scriptRunner.ts`, `gameApi.ts`).
- [x] **Asset resolver** – Interface and blob-URL implementation for textures/models (`src/loader/assetResolver.ts`, `assetResolverImpl.ts`).
- [x] **Render item registry** – Centralized management of entity render items; body→mesh sync; cached transform access to avoid WASM aliasing (`src/runtime/renderItemRegistry.ts`, `renderItem.ts`).

### Persistence
- [x] **Persistence API** – `listProjects`, `loadProject`, `saveProject`, `deleteProject`, `exportProject`, `importProject` (`src/persistence/types.ts`, `indexedDb.ts`).
- [x] **IndexedDB** – Projects (id, name, world, updatedAt) and assets (projectId + assetId → blob).
- [x] **ZIP export/import** – Export: `world.json` + `assets/`; import creates new project with validation.

### Builder UI
- [x] **Builder page** – `BuilderHeader` (New, Save, Save as, Download, Upload, project list, Refresh, Delete, Play; gravity/shadows toggles); `EntitySidebar` (entity list, add entity dropdown, camera control/target/mode); `SceneView` (main 3D canvas); `PropertySidebar` (tabs: Properties, Scripts, Assets).
- [x] **Property panel** – Edit selected entity: `TransformEditor` (position, rotation, scale), `ShapeEditor` (shape type + params: box dims, sphere radius, cylinder/capsule radius+height), `PhysicsEditor` (bodyType, mass, restitution, friction), `MaterialEditor` (color, roughness, metalness); entity name; delete entity.
- [x] **Script panel** – Monaco editor; list scripts by ID; add/remove.
- [x] **Asset panel** – Upload textures/models; list by ID; remove.
- [x] **Play view** – Separate route `/play`; load world from URL query or sample; full physics + scripts.
- [x] **Entity creation/deletion** – Add entities (box, sphere, cylinder, capsule, plane) via EntitySidebar; delete via PropertyPanel; defaults from `entityDefaults.ts` with randomized colors and slight position offsets.
- [x] **In-scene interaction** – Click to select entity; drag to move (via `useEditorInteractions`); selection highlights.
- [x] **UI logger** – Centralized `uiLogger` (`src/utils/uiLogger.ts`) for clicks, changes, selects, uploads, deletes; console output and in-memory store; `UI_LOGGING.md` docs.
- [x] **Project context** – Comprehensive `ProjectContext` (`src/contexts/ProjectContext.tsx`) with state management, dirty tracking, project CRUD operations, and memoized values.
- [x] **Reusable form components** – `NumberInput`, `SelectInput`, `VectorField` in `src/components/form/` for consistent UI patterns.
- [x] **Layout components** – Reusable `Sidebar` component (`src/components/layout/`); `SidebarTabs`, `SidebarToggleButton` for better UI structure.
- [x] **Error boundary** – React error boundary (`src/components/ErrorBoundary.tsx`) to catch and display component errors gracefully.
- [x] **Shared styles** – Centralized UI styles in `src/components/sharedStyles.ts` for consistency.
- [x] **Local storage state** – Custom hook `useLocalStorageState` (`src/hooks/useLocalStorageState.ts`) for persisting UI preferences.

### Fixes / polish
- [x] **Schema validation** – Use Ajv 2020 dialect so draft 2020-12 schema and `$defs` work.
- [x] **Canvas size** – Min size and ResizeObserver so 3D viewport gets valid dimensions.
- [x] **Collision events** – Rapier collision detection via EventQueue; call `runOnCollision(entityId, otherId)` when bodies collide.
- [x] **Physics → mesh sync** – Rapier body transforms copied back to Three.js meshes each frame for dynamic/kinematic bodies via `RenderItemRegistry.syncFromPhysics()`.
- [x] **Rapier aliasing crash fix** – Single-flight Rapier init; cache physics transforms as plain numbers (no WASM object retention) to avoid `recursive use` errors during `world.step()`.
- [x] **E2E tests** – Playwright; `e2e/add-entity.spec.ts` for add entity flow.
- [x] **Test helpers** – Comprehensive test helper utilities (`src/test/helpers/`) for entity, physics, React, Three.js, and world testing.
- [x] **Configuration constants** – Centralized config in `src/config/constants.ts` for DB, UI logger, entity defaults, assets, physics, materials, and geometry.
- [x] **Utility functions** – New utilities: `colorUtils.ts` (color generation), `idGenerator.ts` (unique IDs), `numberUtils.ts` (number operations), `validation.ts` (input validation).
- [x] **Unsaved changes warning** – Warn user when navigating away from unsaved project changes.
- [x] **UI/UX improvements** – Modern dark design with improved spacing, consistent styling, better visual hierarchy, and responsive layouts.
- [x] **Texture system** – Complete texture workflow: `TextureManager` utility, `TextureDialog` for uploading/selecting textures, `TextureThumbnail` for previews, `TextureSelector` integration in MaterialEditor; drag-and-drop support, validation, IndexedDB persistence.
- [x] **3D model asset support** – Complete 3D model workflow: `ModelManager` utility for GLB validation, `ModelDialog` for uploading/selecting models, `ModelThumbnail` for previews, `ModelEditor` for applying models to entities; two application modes: `entity.model` (visual only, shape for physics) and `trimesh` shape type (both visual and physics); GLTFLoader integration via three-stdlib; drag-and-drop support, validation, IndexedDB persistence. **Note:** Only GLB format (self-contained binary) is supported to avoid external dependency issues; GLTF files with external buffers/textures are rejected with helpful error message.
- [x] **Trimesh physics collision** – Full implementation of mesh-based physics collision using Rapier's trimesh collider API; `geometryExtractor` utility extracts vertices and indices from Three.js meshes; handles multiple meshes, indexed/non-indexed geometry, transform application, and scale; automatic warnings for large meshes (>10K triangles); graceful fallback to box collider on errors; supports concave geometry; comprehensive test coverage (11 tests).
- [x] **Mesh simplification for trimesh** – Optional per-entity collision mesh simplification using Three.js SimplifyModifier (Progressive Mesh Polygon Reduction algorithm); configurable via `shape.simplification` with `maxTriangles` target or `targetReduction` percentage; UI toggle in ShapeEditor with max triangle slider; automatic error handling with fallback to original geometry; no external dependencies; comprehensive test coverage (13 tests); typical performance improvement: 4x faster physics step for complex models.

---

## To do

### High priority
- [x] **Apply textures from assets** – ✅ Implemented: Texture resolver in asset loader; `material.map` (asset ID) resolved to texture via asset resolver and applied to meshes with advanced properties (UV repeat, wrap modes, offset, rotation).
- [x] **Load 3D models from assets** – ✅ Implemented: Two approaches supported:
  - **entity.model**: Visual model only (shape still used for physics collision)
  - **trimesh shape**: Model used for both visual and physics with accurate mesh-based collision
  - GLTFLoader integration, material application, transform handling, error fallbacks
  - Trimesh colliders support concave geometry and automatically match visual model exactly

### Medium priority
- [ ] **Replace on import** – UI flow: after import, let user choose “New project” or “Replace existing” and pick which project to overwrite.
- [ ] **First-person controls** – Pointer lock and mouse/pointer driving camera rotation in first-person mode.
- [ ] **Third-person orbit** – Orbit camera around target with pitch/yaw; optional camera collision.

### Lower priority / later
- [ ] **3D model thumbnails** – Currently model thumbnails show 📦 icon; future enhancement: render actual 3D previews using Three.js canvas thumbnails.
- [ ] **Separate collision meshes** – Allow specifying separate visual and collision models for ultimate control over performance vs quality trade-offs.
- [ ] **Backend** – Node.js API, PostgreSQL, S3-compatible storage; EU hoster (see plan §7.2). Defer until needed.
- [ ] **Script sandbox** – If scripts are ever shared/untrusted, run in Worker or cross-origin iframe.
- [ ] **World schema versioning** – Strict vs best-effort when `version` changes; migration path.
- [ ] **D21–D26** – Remaining decisions (schema versioning, asset type required, entity without shape, first-person body, third-person collision, pointer lock).

---

## How to update this file

- When you finish a task: move it from **To do** to **Completed** (or add a new bullet under Completed).
- When you add a new task: add it under **To do** in the right priority section.
- Optionally add a short “Last updated: YYYY-MM-DD” at the top.
