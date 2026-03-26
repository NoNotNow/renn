# Renn – Architecture

High-level architecture of the 3D game world builder and runtime.

---

## Tech stack

| Layer         | Choice                       |
| ------------- | ---------------------------- |
| 3D            | Three.js                     |
| Physics       | Rapier (@dimforge/rapier3d-compat) |
| UI            | React                        |
| Script editor | Monaco (@monaco-editor/react) |
| Bundler       | Vite                         |
| Validation    | Ajv (2020 dialect)           |
| Persistence   | IndexedDB (idb), JSZip       |
| Routing       | react-router-dom             |
| E2E tests     | Playwright                   |

---

## Repository layout

```
renn/
├── world-schema.json         # JSON Schema for world documents (draft 2020-12)
├── agent-context/            # Agent-facing docs (transformers, examples, architecture)
├── e2e/
│   └── add-entity.spec.ts    # E2E: add entity flow
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Router: / (Builder), /play (Play)
│   ├── index.css             # Global styles
│   ├── types/
│   │   ├── world.ts          # RennWorld, Entity, Shape, Vec3, Quat, etc.
│   │   ├── sceneUserData.ts  # Typed userData for Scene and entity meshes
│   │   ├── camera.ts         # Camera-related types
│   │   └── editor.ts         # Editor-specific types
│   ├── config/
│   │   └── constants.ts      # App-wide constants (DB, physics, materials, etc.)
│   ├── contexts/
│   │   └── ProjectContext.tsx # ProjectProvider: state + actions for projects/world/assets/camera
│   ├── schema/
│   │   └── validate.ts       # validateWorldDocument(), Ajv + world-schema
│   ├── loader/
│   │   ├── loadWorld.ts        # loadWorld(data) → scene, entities, world
│   │   ├── loadWorldFromStatic.ts # Static world + assets; rejects text/html (Vite SPA fallback); tries assets/<assetId>.bin before ref.path
│   │   ├── createPrimitive.ts # Mesh from shape + material; plane/box/sphere/cylinder/capsule/cone/pyramid/ring/…
│   │   ├── assetResolver.ts  # (assetId) => URL | Blob | null
│   │   └── assetResolverImpl.ts # Blob → object URL
│   ├── physics/
│   │   └── rapierPhysics.ts  # initRapier, applyPhysicsToLoadedEntities, addScene, step; cached transforms
│   ├── runtime/
│   │   ├── renderItem.ts     # RenderItem: single entity wrapper (mesh + body + pose)
│   │   └── renderItemRegistry.ts # RenderItemRegistry: manages all render items, physics sync
│   ├── camera/
│   │   └── cameraController.ts # CameraController: free / follow / top|front|right; first/third person
│   ├── scripts/
│   │   ├── gameApi.ts        # createGameAPI(): game.time, getEntity, setPosition, …
│   │   └── scriptRunner.ts   # ScriptRunner: compile hooks, runOnSpawn/Update/Collision
│   ├── persistence/
│   │   ├── types.ts          # PersistenceAPI, ProjectMeta, LoadedProject
│   │   └── indexedDb.ts      # createIndexedDbPersistence(): list/load/save/delete/export/import
│   ├── data/
│   │   ├── sampleWorld.ts    # Default world (ground + ball + script)
│   │   └── entityDefaults.ts # createDefaultEntity(), getDefaultShapeForType()
│   ├── editor/
│   │   └── transformGizmoController.ts # Builder: TransformControls + click-to-select; translate/rotate/scale gizmo (scale axes clamped)
│   ├── hooks/
│   │   ├── useProjectContext.ts    # Access ProjectContext
│   │   ├── useKeyboardInput.ts     # Free-fly keys (WASD, Shift, Alt, arrows)
│   │   └── useLocalStorageState.ts # Persist UI state to localStorage
│   ├── utils/
│   │   ├── uiLogger.ts       # Centralized UI interaction logging (click, change, select, etc.)
│   │   ├── worldUtils.ts     # updateEntityPosition, etc.
│   │   ├── entityApproximateSize.ts # Approximate entity extent for list filters (not physics AABB)
│   │   ├── colorUtils.ts     # Color generation and utilities
│   │   ├── idGenerator.ts    # Unique ID generation
│   │   ├── numberUtils.ts    # Number operations and utilities
│   │   └── validation.ts     # Input validation helpers
│   ├── components/
│   │   ├── SceneView.tsx     # 3D canvas: load world, physics, scripts, camera, render loop
│   │   ├── BuilderHeader.tsx # Toolbar: New, Save, Save as, Download, Upload, project list, Play, gravity/shadows
│   │   ├── EntitySidebar.tsx # Entity list (search + collapsible filters), add-entity dropdown, camera control/target/mode
│   │   ├── PropertySidebar.tsx # Tabs: Properties | Scripts | Assets
│   │   ├── WorldPanel.tsx    # World tab: gravity, sleep thresholds, sky, lights, ground
│   │   ├── PropertyPanel.tsx # Edit selected entity (name, shape, transform, physics, material, transformers, delete)
│   │   ├── TransformEditor.tsx # Position, rotation (Vec3Field, Euler [x,y,z]), scale
│   │   ├── ShapeEditor.tsx   # Shape type + params (box, sphere, cylinder, capsule, cone, pyramid, ring, plane)
│   │   ├── PhysicsEditor.tsx # bodyType, mass, restitution, friction, linearDamping, angularDamping
│   │   ├── MaterialEditor.tsx # color, roughness, metalness, opacity (0–1, default 1)
│   │   ├── ScriptPanel.tsx   # Monaco + script list (add/remove)
│   │   ├── AssetPanel.tsx    # Upload assets, list by ID
│   │   ├── MenuBar.tsx       # Menu bar component
│   │   ├── DropdownMenu.tsx  # Reusable dropdown menu
│   │   ├── ErrorBoundary.tsx # Error boundary for graceful error handling
│   │   ├── SidebarTabs.tsx   # Tabbed interface for sidebars
│   │   ├── SidebarToggleButton.tsx # Toggle sidebar visibility
│   │   ├── Vec3Field.tsx     # Vec3 input (position, rotation, scale)
│   │   ├── DraggableNumberField.tsx # Number input with drag
│   │   ├── Switch.tsx        # Toggle (gravity, shadows)
│   │   ├── sharedStyles.ts   # Centralized UI styles
│   │   ├── form/
│   │   │   ├── NumberInput.tsx  # Reusable number input
│   │   │   ├── SelectInput.tsx  # Reusable select/dropdown
│   │   │   └── VectorField.tsx  # Reusable vector input
│   │   └── layout/
│   │       └── Sidebar.tsx   # Reusable sidebar layout
│   ├── test/
│   │   ├── setup.ts          # Vitest setup
│   │   └── helpers/
│   │       ├── entity.ts     # Entity test helpers
│   │       ├── mocks.ts      # Mock functions and objects
│   │       ├── physics.ts    # Physics test helpers
│   │       ├── react.ts      # React testing helpers
│   │       ├── three.ts      # Three.js test helpers
│   │       └── world.ts      # World test helpers
│   └── pages/
│       ├── Builder.tsx       # Builder: BuilderHeader, EntitySidebar, SceneView, PropertySidebar
│       └── Play.tsx          # Play: load world from ?world=… or sample; SceneView only
```

---

## Data flow

### Builder

1. User works in **Builder** (`/`): **ProjectContext** holds `currentProject` (id, name, isDirty), `world`, `assets`, `projects`, camera state; provides actions for project CRUD via IndexedDB.
2. Layout: **BuilderHeader** (toolbar + gravity/shadows toggles); **EntitySidebar** (entity list with search and collapsible filters, add-entity dropdown, camera control/target/mode); **SceneView** (main canvas); **PropertySidebar** (tabs: Properties, Scripts, Assets).
3. **SceneView** receives `world` (and optional `assets`). It calls **loadWorld(world)** → scene + entities; then creates **RenderItemRegistry**, sets up **Rapier** (with cached transforms), **CameraController**, **ScriptRunner**, and the render loop.
4. **Builder viewport** ([transformGizmoController.ts](src/editor/transformGizmoController.ts)): click entity to select (Shift/Cmd+click to add/remove from selection), click empty to clear selection; **TransformControls** for **translate**, **rotate**, and **scale**. Single unlocked target: attach to entity mesh, **`space: 'local'`**. Multiple unlocked targets: attach to a **pivot** at average position, **`space: 'world'`**, group transform applied to all. **Locked** entities are omitted from the gizmo target set. Scale gizmo drags clamp axes; on drag end, poses are committed in one batch to `updateWorld()` (dirty). **SceneView** disables camera orbit while the gizmo is dragging.
5. **Edit-Modus (Navigation)** in the Builder: toggle with **Ctrl+E** or **View → Edit-Modus** (checkmark when active). Red record-style dot top-right on the canvas. While on: **free-fly** via `CameraController.setForceFreeFlyNavigation`: **W/S** move along view forward/back unless **Alt/Option** is held (then **W/S** = world up/down); **A/D** strafe; **Shift** speeds up translation only; **arrow keys** yaw/pitch via quaternions with a **capped** max turn rate after a short ramp. Translation speed **ramps up without a hard cap** while move keys are held (decays when released). Does not change camera control/mode in the sidebar. **no** `executeTransformers`; **no** Rapier `step` (simulation frozen); **no** script `runOnUpdate` or collision hooks; debug forces are not applied during the pause. Gizmo and picking stay available. The viewport pose is kept across scene rebuilds via `savedCameraStateRef` and throttled writes to `editorFreePoseRef` (merged into `world.camera.editorFreePose` on save).
6. Entity list, **PropertyPanel** (multi-select aware: merged fields, bulk apply), **ScriptPanel** (script intersection + attach/detach on all selected), **AssetPanel** read/write via `updateWorld()` and `updateAssets()` from ProjectContext. Changes trigger SceneView to re-run its effect and rebuild the scene when needed.
7. **RenderItemRegistry**: manages all entity render items; syncs physics body transforms to meshes each frame using cached transforms (avoiding WASM aliasing).
8. **Export**: ZIP = `world.json` + `assets/{id}.{ext}`; or JSON only when unsaved. **Import**: parse ZIP/JSON, validate world, save as new project (replace UI can be added).
9. **Unsaved changes**: ProjectContext tracks `isDirty` flag; warns user before navigation if changes exist.

### Play

1. **Play** (`/play`) gets world from `?world=...` (JSON) or uses sample world.
2. **SceneView** runs with that world: physics stepped every frame, scripts (onUpdate, etc.) run, camera follows target, Three.js renders.

### Runtime pipeline (each frame)

1. Step **physics** (fixed dt); physics world caches all transforms after step.
2. **RenderItemRegistry** syncs all entity meshes from cached physics transforms.
3. Run **script** hooks (e.g. onUpdate).
4. **Camera** controller updates camera from target entity (via RenderItemRegistry).
5. **Render** scene with Three.js WebGLRenderer.

---

## World document

- **Root**: `version`, `world` (gravity, lighting, camera), `entities[]`, optional `assets`, optional `scripts`.
- **world.sleeping** (optional): `linearThreshold`, `angularThreshold`, `timeUntilSleep`. When present, `PhysicsWorld` runs a per-body timer after each Rapier `step(dt)` and calls `body.sleep()` once both velocity checks pass continuously for `timeUntilSleep` seconds. Negative `linearThreshold` or `angularThreshold` disables that axis check (Rapier-style). Recommended defaults are `RECOMMENDED_SLEEPING_SETTINGS` in `src/types/world.ts` (0.4, 0.5 rad/s, 2s). Configured in the Builder **World** tab (`WorldPanel`).
- **Entity**: `id`, `bodyType` (static/dynamic/kinematic), `shape` (box/sphere/cylinder/capsule/cone/pyramid/ring/plane/trimesh), `position` (Vec3), `rotation` (Rotation / Euler [x,y,z] radians), `scale`, `model?`, `modelRotation?` (Euler radians, applied to model/trimesh only), `modelScale?` (Vec3, applied to model/trimesh only), `material?`, `mass`, `restitution`, `friction`, `linearDamping`, `angularDamping`, `scripts?` (hook → script ID).
- **Scripts**: map of script ID → source string. Entity `scripts.onUpdate` etc. reference these IDs. Scripts run with a `game` API (read/write positions, entities, time; no DOM/fetch).

See **world-schema.json** and **src/types/world.ts** for the full shape.

---

## Persistence

- **PersistenceAPI** is implemented first with **IndexedDB** (projects + asset blobs). Same interface can later be backed by a REST API + Postgres + S3.
- **Export**: one ZIP per project (`world.json` + `assets/`); unsaved projects export as JSON. **Import**: validate, then save as new project (replace UI can be added).

---

## Key design choices

- **Play is a separate view** (route), not a toggle on the builder.
- **Edit mode is "alive"**: physics and scripts run in the builder so the scene responds as you edit.
- **Rotation in JSON is Euler** `[x, y, z]` radians via `Rotation`; legacy `Quat` alias is kept only for backward compatibility during migration.
- **Scripts**: main thread, trusted; `game` API only. Sandbox (Worker/iframe) later if scripts are shared.
- **Camera**: config in world (mode, target, distance, height); optional **`editorFreePose`** (`position` + `quaternion`) stores the last Builder free-fly / edit-navigation view for restore after reload or save. Builder can override target/mode for preview. **Free control**: same free-fly bindings as edit-navigation (W/S along view or Alt+W/S vertical, A/D strafe, uncapped translation boost while held, arrows with capped look rate, Shift = translation sprint only); follow, third person, first person, and top/front/right presets. Follow/third-person offset rotates with target quaternion from runtime registry. **First person**: eye at entity + height offset with **no position smoothing**; look = vehicle-local `orbitYaw` / `orbitPitch` (same drag/trackpad pipeline as other follow modes) on local −Z, then entity quaternion, then ~5° pitch up around entity right; wheel/pinch maps to **FOV** (clamped); **FOV resets to the default (50°)** when leaving first person. Orbit angles reset when switching into first person.
- **UI logging**: centralized `uiLogger` for clicks, changes, selects, uploads, deletes; see `UI_LOGGING.md`.
- **ProjectContext pattern**: single source of truth for project state; all components access state/actions via context; memoized values prevent unnecessary re-renders.
- **RenderItemRegistry**: centralized entity management; single responsibility for physics-mesh sync; uses cached transforms to avoid WASM aliasing errors.
- **Visual base quaternion**: Shapes like `plane` require a visual rotation offset (e.g. `-PI/2` on X to lay flat). This offset is stored on `mesh.userData.visualBaseQuaternion` and compensated in `RenderItem.getRotation()`/`setRotation()` so it never leaks into entity data during save.
- **Pyramid collision**: Pyramid uses a convex-hull collider (5 vertices) in `rapierPhysics.ts` so the collision footprint matches the square-base mesh; a cone collider would use a circular base circumscribing the square and be larger than the visual.
- **Trimesh and entity.model normalization**: At import time (in `createPrimitive.ts`), loaded GLTF scenes for trimesh shapes and for `entity.model` are normalized to fit a 1×1×1 unit cube centered at the origin. `normalizeSceneToUnitCube()` (in `src/utils/normalizeModelToUnitCube.ts`) computes the world bounding box, then bakes center and scale into each mesh’s geometry and resets mesh transforms. Stored geometry is thus in [-0.5, 0.5]³; entity scale is applied in physics and rendering as before.
- **Trimesh and entity.model rendering**: Trimesh and entity.model use the same lit material (MeshStandardMaterial) and shadow behavior as primitives. A default lit material is applied when no entity material is set; `loadWorld.ts` traverses the mesh hierarchy and sets `castShadow` and `receiveShadow` on every mesh so models cast and receive shadows.
- **Model-relative transform**: For entities with a 3D model (`entity.model`) or trimesh shape, optional `modelRotation` (Euler [x,y,z] radians) and `modelScale` (Vec3) apply only to the model/trimesh child (relative to item coordinates). This allows correcting model orientation (e.g. car on wheels) and per-axis scaling without changing the entity's world position/rotation/scale. The same transform is applied when building the trimesh collider in `rapierPhysics.ts`.
- **Reusable form components**: consistent UI patterns via shared form components (NumberInput, SelectInput, VectorField).
- **Configuration constants**: centralized config (`src/config/constants.ts`) for easy maintenance and testing.
- **Test helpers**: comprehensive test utilities for consistent, maintainable tests.
