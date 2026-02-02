# Renn – Project dev state

Track what’s done and what’s left. Update this file as you complete or add work.

Last updated: 2026-02-02

---

## Completed

### Core
- [x] **JSON schema** – `world-schema.json` (draft 2020-12) and validation in `src/schema/validate.ts` (Ajv 2020 dialect).
- [x] **World loader** – Parse and validate world JSON; build Three.js scene and entity meshes (`src/loader/loadWorld.ts`, `createPrimitive.ts`).
- [x] **Physics** – Direct Rapier WASM integration with proper collider shapes (ball, box, cylinder, capsule, plane as cuboid); physics-to-mesh sync; collision events via EventQueue (`src/physics/rapierPhysics.ts`).
- [x] **Camera controller** – Free fly, follow, top/front/right presets; follow / third-person / first-person modes; target entity, distance, height (`src/camera/cameraController.ts`).
- [x] **Script runner** – Main-thread execution with `game` API; hooks `onSpawn`, `onUpdate`, `onCollision` by script ID (`src/scripts/scriptRunner.ts`, `gameApi.ts`).
- [x] **Asset resolver** – Interface and blob-URL implementation for textures/models (`src/loader/assetResolver.ts`, `assetResolverImpl.ts`).

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
- [x] **Entity creation/deletion** – Add entities (box, sphere, cylinder, capsule, plane) via EntitySidebar; delete via PropertyPanel; defaults from `entityDefaults.ts`.
- [x] **In-scene interaction** – Click to select entity; drag to move (via `useEditorInteractions`); selection highlights.
- [x] **UI logger** – Centralized `uiLogger` (`src/utils/uiLogger.ts`) for clicks, changes, selects, uploads, deletes; console output and in-memory store; `UI_LOGGING.md` docs.

### Fixes / polish
- [x] **Schema validation** – Use Ajv 2020 dialect so draft 2020-12 schema and `$defs` work.
- [x] **Canvas size** – Min size and ResizeObserver so 3D viewport gets valid dimensions.
- [x] **Collision events** – Rapier collision detection via EventQueue; call `runOnCollision(entityId, otherId)` when bodies collide.
- [x] **Physics → mesh sync** – Rapier body transforms copied back to Three.js meshes each frame for dynamic/kinematic bodies.
- [x] **Rapier aliasing crash fix** – Single-flight Rapier init; cache physics transforms as plain numbers (no WASM object retention) to avoid `recursive use` errors during `world.step()`.
- [x] **E2E tests** – Playwright; `e2e/add-entity.spec.ts` for add entity flow.

---

## To do

### High priority
- [ ] **Apply textures from assets** – Loader currently uses placeholder materials; resolve `material.map` (asset ID) to texture via asset resolver and apply to meshes.
- [ ] **Load 3D models from assets** – When entity has `model` (asset ID), load glTF/GLB from assets and use for mesh (and optionally trimesh collision).

### Medium priority
- [ ] **Replace on import** – UI flow: after import, let user choose “New project” or “Replace existing” and pick which project to overwrite.
- [ ] **First-person controls** – Pointer lock and mouse/pointer driving camera rotation in first-person mode.
- [ ] **Third-person orbit** – Orbit camera around target with pitch/yaw; optional camera collision.

### Lower priority / later
- [ ] **Backend** – Node.js API, PostgreSQL, S3-compatible storage; EU hoster (see plan §7.2). Defer until needed.
- [ ] **Script sandbox** – If scripts are ever shared/untrusted, run in Worker or cross-origin iframe.
- [ ] **World schema versioning** – Strict vs best-effort when `version` changes; migration path.
- [ ] **D21–D26** – Remaining decisions (schema versioning, asset type required, entity without shape, first-person body, third-person collision, pointer lock).

---

## How to update this file

- When you finish a task: move it from **To do** to **Completed** (or add a new bullet under Completed).
- When you add a new task: add it under **To do** in the right priority section.
- Optionally add a short “Last updated: YYYY-MM-DD” at the top.
