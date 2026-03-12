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
│   ├── hooks/
│   │   ├── useProjectContext.ts    # Access ProjectContext
│   │   ├── useEditorInteractions.ts # Raycast select, drag-to-move entity position
│   │   ├── useKeyboardInput.ts     # WASD free-fly input
│   │   └── useLocalStorageState.ts # Persist UI state to localStorage
│   ├── utils/
│   │   ├── uiLogger.ts       # Centralized UI interaction logging (click, change, select, etc.)
│   │   ├── worldUtils.ts     # updateEntityPosition, etc.
│   │   ├── colorUtils.ts     # Color generation and utilities
│   │   ├── idGenerator.ts    # Unique ID generation
│   │   ├── numberUtils.ts    # Number operations and utilities
│   │   └── validation.ts     # Input validation helpers
│   ├── components/
│   │   ├── SceneView.tsx     # 3D canvas: load world, physics, scripts, camera, render loop
│   │   ├── BuilderHeader.tsx # Toolbar: New, Save, Save as, Download, Upload, project list, Play, gravity/shadows
│   │   ├── EntitySidebar.tsx # Entity list, add-entity dropdown, camera control/target/mode
│   │   ├── PropertySidebar.tsx # Tabs: Properties | Scripts | Assets
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
2. Layout: **BuilderHeader** (toolbar + gravity/shadows toggles); **EntitySidebar** (entity list, add-entity dropdown, camera control/target/mode); **SceneView** (main canvas); **PropertySidebar** (tabs: Properties, Scripts, Assets).
3. **SceneView** receives `world` (and optional `assets`). It calls **loadWorld(world)** → scene + entities; then creates **RenderItemRegistry**, sets up **Rapier** (with cached transforms), **CameraController**, **ScriptRunner**, and the render loop.
4. **useEditorInteractions** (raycast + drag): click entity to select; drag to move. Selection and entity changes call `updateWorld()` from ProjectContext, marking project as dirty.
5. Entity list, **PropertyPanel** (shape, transform, physics, material, delete), **ScriptPanel**, and **AssetPanel** read/write via `updateWorld()` and `updateAssets()` from ProjectContext. Changes trigger SceneView to re-run its effect and rebuild the scene.
6. **RenderItemRegistry**: manages all entity render items; syncs physics body transforms to meshes each frame using cached transforms (avoiding WASM aliasing).
7. **Export**: ZIP = `world.json` + `assets/{id}.{ext}`; or JSON only when unsaved. **Import**: parse ZIP/JSON, validate world, save as new project (replace UI can be added).
8. **Unsaved changes**: ProjectContext tracks `isDirty` flag; warns user before navigation if changes exist.

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
- **Entity**: `id`, `bodyType` (static/dynamic/kinematic), `shape` (box/sphere/cylinder/capsule/cone/pyramid/ring/plane/trimesh), `position` (Vec3), `rotation` (Rotation / Euler [x,y,z] radians), `scale`, `model?`, `material?`, `mass`, `restitution`, `friction`, `linearDamping`, `angularDamping`, `scripts?` (hook → script ID).
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
- **Camera**: config in world (mode, target, distance, height); Builder can override target/mode for preview. Free fly (WASD), follow, third person, first person, and top/front/right presets. Follow/third-person offset now rotates with target quaternion from runtime registry.
- **UI logging**: centralized `uiLogger` for clicks, changes, selects, uploads, deletes; see `UI_LOGGING.md`.
- **ProjectContext pattern**: single source of truth for project state; all components access state/actions via context; memoized values prevent unnecessary re-renders.
- **RenderItemRegistry**: centralized entity management; single responsibility for physics-mesh sync; uses cached transforms to avoid WASM aliasing errors.
- **Visual base quaternion**: Shapes like `plane` require a visual rotation offset (e.g. `-PI/2` on X to lay flat). This offset is stored on `mesh.userData.visualBaseQuaternion` and compensated in `RenderItem.getRotation()`/`setRotation()` so it never leaks into entity data during save.
- **Reusable form components**: consistent UI patterns via shared form components (NumberInput, SelectInput, VectorField).
- **Configuration constants**: centralized config (`src/config/constants.ts`) for easy maintenance and testing.
- **Test helpers**: comprehensive test utilities for consistent, maintainable tests.
