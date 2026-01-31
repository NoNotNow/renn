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
├── e2e/
│   └── add-entity.spec.ts    # E2E: add entity flow
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Router: / (Builder), /play (Play)
│   ├── index.css             # Global styles
│   ├── types/
│   │   ├── world.ts          # RennWorld, Entity, Shape, Vec3, Quat, etc.
│   │   └── sceneUserData.ts  # Typed userData for Scene and entity meshes
│   ├── schema/
│   │   └── validate.ts       # validateWorldDocument(), Ajv + world-schema
│   ├── loader/
│   │   ├── loadWorld.ts      # loadWorld(data) → scene, entities, world
│   │   ├── createPrimitive.ts # Mesh from shape + material; plane/box/sphere/…
│   │   ├── assetResolver.ts  # (assetId) => URL | Blob | null
│   │   └── assetResolverImpl.ts # Blob → object URL
│   ├── physics/
│   │   └── rapierPhysics.ts  # initRapier, applyPhysicsToLoadedEntities, addScene, step
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
│   │   ├── useProjectManagement.ts # Project CRUD, camera state, handleNew/Open/Save/etc.
│   │   ├── useEditorInteractions.ts # Raycast select, drag-to-move entity position
│   │   └── useKeyboardInput.ts     # WASD free-fly input
│   ├── utils/
│   │   ├── uiLogger.ts       # Centralized UI interaction logging (click, change, select, etc.)
│   │   └── worldUtils.ts     # updateEntityPosition, etc.
│   ├── components/
│   │   ├── SceneView.tsx     # 3D canvas: load world, physics, scripts, camera, render loop
│   │   ├── BuilderHeader.tsx # Toolbar: New, Save, Save as, Download, Upload, project list, Play, gravity/shadows
│   │   ├── EntitySidebar.tsx # Entity list, add-entity dropdown, camera control/target/mode
│   │   ├── PropertySidebar.tsx # Tabs: Properties | Scripts | Assets
│   │   ├── PropertyPanel.tsx # Edit selected entity (name, shape, transform, physics, material, delete)
│   │   ├── TransformEditor.tsx # Position, rotation (QuatField), scale
│   │   ├── ShapeEditor.tsx   # Shape type + params (box, sphere, cylinder, capsule, plane)
│   │   ├── PhysicsEditor.tsx # bodyType, mass, restitution, friction
│   │   ├── MaterialEditor.tsx # color, roughness, metalness
│   │   ├── ScriptPanel.tsx   # Monaco + script list (add/remove)
│   │   ├── AssetPanel.tsx    # Upload assets, list by ID
│   │   ├── Vec3Field.tsx     # Vec3 input
│   │   ├── QuatField.tsx     # Quaternion input
│   │   ├── DraggableNumberField.tsx # Number input with drag
│   │   └── Switch.tsx        # Toggle (gravity, shadows)
│   └── pages/
│       ├── Builder.tsx       # Builder: BuilderHeader, EntitySidebar, SceneView, PropertySidebar
│       └── Play.tsx          # Play: load world from ?world=… or sample; SceneView only
```

---

## Data flow

### Builder

1. User works in **Builder** (`/`): **useProjectManagement** holds `world`, `assets`, `projects`, camera state; project CRUD via IndexedDB.
2. Layout: **BuilderHeader** (toolbar + gravity/shadows toggles); **EntitySidebar** (entity list, add-entity dropdown, camera control/target/mode); **SceneView** (main canvas); **PropertySidebar** (tabs: Properties, Scripts, Assets).
3. **SceneView** receives `world` (and optional `assets`). It calls **loadWorld(world)** → scene + entities; then sets up **Rapier** (userData.physics, addScene), **CameraController**, **ScriptRunner**, and the render loop.
4. **useEditorInteractions** (raycast + drag): click entity to select; drag to move. Selection and `onEntityPositionChange` update `world` via `setWorld`.
5. Entity list, **PropertyPanel** (shape, transform, physics, material, delete), **ScriptPanel**, and **AssetPanel** read/write the same `world` (and `assets`). Changing world triggers SceneView to re-run its effect and rebuild the scene.
6. **Export**: ZIP = `world.json` + `assets/{id}.{ext}`; or JSON only when unsaved. **Import**: parse ZIP/JSON, validate world, save as new project (replace UI can be added).

### Play

1. **Play** (`/play`) gets world from `?world=...` (JSON) or uses sample world.
2. **SceneView** runs with that world: physics stepped every frame, scripts (onUpdate, etc.) run, camera follows target, Three.js renders.

### Runtime pipeline (each frame)

1. Step **physics** (fixed dt).
2. Run **script** hooks (e.g. onUpdate).
3. **Camera** controller updates camera from target entity.
4. **Render** scene with Three.js WebGLRenderer.

---

## World document

- **Root**: `version`, `world` (gravity, lighting, camera), `entities[]`, optional `assets`, optional `scripts`.
- **Entity**: `id`, `bodyType` (static/dynamic/kinematic), `shape` (box/sphere/cylinder/capsule/plane/trimesh), `position` (Vec3), `rotation` (Quat), `scale`, `model?`, `material?`, `mass`, `restitution`, `friction`, `scripts?` (hook → script ID).
- **Scripts**: map of script ID → source string. Entity `scripts.onUpdate` etc. reference these IDs. Scripts run with a `game` API (read/write positions, entities, time; no DOM/fetch).

See **world-schema.json** and **src/types/world.ts** for the full shape.

---

## Persistence

- **PersistenceAPI** is implemented first with **IndexedDB** (projects + asset blobs). Same interface can later be backed by a REST API + Postgres + S3.
- **Export**: one ZIP per project (`world.json` + `assets/`); unsaved projects export as JSON. **Import**: validate, then save as new project (replace UI can be added).

---

## Key design choices

- **Play is a separate view** (route), not a toggle on the builder.
- **Edit mode is “alive”**: physics and scripts run in the builder so the scene responds as you edit.
- **Rotation in JSON is quaternion** `[x, y, z, w]` to avoid gimbal lock.
- **Scripts**: main thread, trusted; `game` API only. Sandbox (Worker/iframe) later if scripts are shared.
- **Camera**: config in world (mode, target, distance, height); Builder can override target/mode for preview. Free fly (WASD), follow, top/front/right presets.
- **UI logging**: centralized `uiLogger` for clicks, changes, selects, uploads, deletes; see `UI_LOGGING.md`.
