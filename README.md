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

## Deploy to GitHub Pages

```bash
npm run deploy
```

Builds the app, copies `index.html` to `404.html` for SPA routing, and pushes the `dist` contents to the `gh-pages` branch. Configure the repo’s Pages source to deploy from the `gh-pages` branch; the site will be at `https://<user>.github.io/renn/`.

## Static default world (gh-pages)

The default world loads from static files in `public/world/` (world.json + assets). On startup, the app tries `loadWorldFromStatic()`; if it succeeds (e.g. on GitHub Pages), that world is used. Otherwise it falls back to IndexedDB and the sample world. Replace the contents of `public/world/` to change the default.

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
- **Entities**: `id`, `bodyType` (static/dynamic/kinematic), `shape` (box/sphere/cylinder/capsule/plane), `position` (Vec3), `rotation` (Euler [x,y,z] in radians; see `agent-context/direction-rotation-coordinates.md`), `scale`, `material`, physics properties (`mass`, `restitution`, `friction`)
- **Scripts**: stored in `world.scripts` by ID; entities reference scripts via hooks (`onSpawn`, `onUpdate`, `onCollision`)
- **Assets**: optional textures and 3D models referenced by ID
- **World settings**: gravity, lighting, camera configuration

Scripts receive a `game` API with methods to interact with entities, physics, and game state.

## Architecture

See `agent-context/` for agent-facing docs (`architecture.md`, `feature-transformers.md`, `example-worlds.md`, `script-examples.md`). Key patterns:
- **ProjectContext**: centralized state management for projects, world data, and assets
- **RenderItemRegistry**: manages entity render items and physics-mesh synchronization
- **Cached transforms**: physics transforms cached as plain numbers to avoid WASM aliasing errors
- **Component composition**: reusable form components and layouts for consistent UI
