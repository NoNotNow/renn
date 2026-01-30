# Renn – Architecture

High-level architecture of the 3D game world builder and runtime.

---

## Tech stack

| Layer        | Choice                     |
| ------------ | -------------------------- |
| 3D           | Three.js                   |
| Physics      | Rapier (Three.js addon)    |
| UI           | React                      |
| Script editor| Monaco (@monaco-editor/react) |
| Bundler      | Vite                       |
| Validation   | Ajv (2020 dialect)         |
| Persistence  | IndexedDB (idb), JSZip     |
| Routing      | react-router-dom           |

---

## Repository layout

```
renn/
├── world-schema.json       # JSON Schema for world documents (draft 2020-12)
├── src/
│   ├── main.tsx            # React entry
│   ├── App.tsx              # Router: / (Builder), /play (Play)
│   ├── index.css            # Global styles
│   ├── types/
│   │   └── world.ts         # RennWorld, Entity, Shape, Vec3, Quat, etc.
│   ├── schema/
│   │   └── validate.ts      # validateWorldDocument(), Ajv + world-schema
│   ├── loader/
│   │   ├── loadWorld.ts     # loadWorld(data) → scene, entities, world
│   │   ├── createPrimitive.ts # Mesh from shape + material; plane/box/sphere/…
│   │   ├── assetResolver.ts # (assetId) => URL | Blob | null
│   │   └── assetResolverImpl.ts # Blob → object URL
│   ├── physics/
│   │   └── rapierPhysics.ts # initRapier, applyPhysicsToLoadedEntities, addScene, step
│   ├── camera/
│   │   └── cameraController.ts # CameraController: follow / third / first person
│   ├── scripts/
│   │   ├── gameApi.ts       # createGameAPI(): game.time, getEntity, setPosition, …
│   │   └── scriptRunner.ts  # ScriptRunner: compile hooks, runOnSpawn/Update/Collision
│   ├── persistence/
│   │   ├── types.ts         # PersistenceAPI, ProjectMeta, LoadedProject
│   │   └── indexedDb.ts     # createIndexedDbPersistence(): list/load/save/delete/export/import
│   ├── data/
│   │   └── sampleWorld.ts   # Default world (ground + ball + script)
│   ├── components/
│   │   ├── SceneView.tsx    # 3D canvas: load world, physics, scripts, camera, render loop
│   │   ├── PropertyPanel.tsx # Edit selected entity (position, rotation, bodyType, …)
│   │   ├── ScriptPanel.tsx  # Monaco + script list (add/remove)
│   │   └── AssetPanel.tsx   # Upload assets, list by ID
│   └── pages/
│       ├── Builder.tsx      # Builder: toolbar, entity list, camera, SceneView, Properties/Scripts/Assets
│       └── Play.tsx         # Play: load world from ?world=… or sample; SceneView only
```

---

## Data flow

### Builder

1. User works in **Builder** (`/`): project list and open/save from **IndexedDB**; world and assets live in React state.
2. **SceneView** receives `world` (and optional `assets`). It calls **loadWorld(world)** → scene + entities; then sets up **Rapier** (userData.physics, addScene), **CameraController**, **ScriptRunner**, and the render loop.
3. Entity list, **PropertyPanel**, **ScriptPanel**, and **AssetPanel** read/write the same `world` (and `assets`) via `setWorld` / `setAssets`. Changing world triggers SceneView to re-run its effect and rebuild the scene.
4. **Export**: ZIP = `world.json` + `assets/{id}.{ext}`. **Import**: parse ZIP, validate world, save to IndexedDB (new or replace).

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
- **Export**: one ZIP per project (`world.json` + `assets/`). **Import**: validate, then save as new project or replace an existing one (UI for “replace” can be added).

---

## Key design choices

- **Play is a separate view** (route), not a toggle on the builder.
- **Edit mode is “alive”**: physics and scripts run in the builder so the scene responds as you edit.
- **Rotation in JSON is quaternion** `[x, y, z, w]` to avoid gimbal lock.
- **Scripts**: main thread, trusted; `game` API only. Sandbox (Worker/iframe) later if scripts are shared.
- **Camera**: config in world (mode, target, distance, height); Builder can override target/mode for preview.
