# Renn

Browser-based 3D game world builder with physics (Rapier), JSON-defined worlds, and JavaScript scripting.

## Stack

- **Vite** + **React** + **TypeScript**
- **Three.js** for 3D rendering
- **Rapier** (@dimforge/rapier3d-compat) for physics
- **Monaco** for script editing
- **IndexedDB** (idb) + **JSZip** for persistence and export/import
- **Ajv** for JSON schema validation
- **Vitest** + **Playwright** for testing

## Setup

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Tests

- **Unit + component:** `npm run test` (watch) or `npm run test:run`
- **E2E (Playwright):** `npm run test:e2e` — uses system Chrome; start dev server first or let Playwright start it (`reuseExistingServer: true`)

## Usage

- **Builder** (`/`): Create and edit worlds. Save to browser storage, download as ZIP, upload to restore. Features:
  - Entity list with add/delete operations
  - Property panel for editing entity properties (transform, physics, material, shape)
  - Script panel with Monaco editor
  - Asset upload and management
  - Camera controls (free-fly, follow, presets)
  - Live preview with physics and scripts running
  - Unsaved changes tracking and warnings
- **Play** (`/play`): Run the current world (physics + scripts). Open from Builder via "Play" button (passes world in URL) or load a project first.

## World format

Worlds are defined in JSON following `world-schema.json` (JSON Schema draft 2020-12). Key features:
- **Entities**: `id`, `bodyType` (static/dynamic/kinematic), `shape` (box/sphere/cylinder/capsule/plane), `position` (Vec3), `rotation` (Quaternion), `scale`, `material`, physics properties (`mass`, `restitution`, `friction`)
- **Scripts**: stored in `world.scripts` by ID; entities reference scripts via hooks (`onSpawn`, `onUpdate`, `onCollision`)
- **Assets**: optional textures and 3D models referenced by ID
- **World settings**: gravity, lighting, camera configuration

Scripts receive a `game` API with methods to interact with entities, physics, and game state.

## Architecture

See `architecture.md` for detailed architecture documentation. Key patterns:
- **ProjectContext**: centralized state management for projects, world data, and assets
- **RenderItemRegistry**: manages entity render items and physics-mesh synchronization
- **Cached transforms**: physics transforms cached as plain numbers to avoid WASM aliasing errors
- **Component composition**: reusable form components and layouts for consistent UI
