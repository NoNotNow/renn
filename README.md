# Renn

Browser-based 3D game world builder with physics (Rapier), JSON-defined worlds, and JavaScript scripting.

## Stack

- **Vite** + **React** + **TypeScript**
- **Three.js** for 3D
- **Rapier** (via Three.js addon) for physics
- **Monaco** for script editing
- **IndexedDB** (idb) + **JSZip** for persistence and export/import

## Setup

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Usage

- **Builder** (`/`): Create and edit worlds. Save to browser storage, download as ZIP, upload to restore. Entity list, property panel, script panel (Monaco), asset upload. Edit mode runs physics so the scene feels alive.
- **Play** (`/play`): Run the current world (physics + scripts). Open from Builder via "Play" (passes world in URL) or load a project first.

## World format

See `world-schema.json` and the plan for the JSON schema. Entities have `id`, `bodyType`, `shape`, `position` (Vec3), `rotation` (Quat), `scale`, `material`, `mass`, `scripts` (hook → script ID). Scripts are stored in `world.scripts` and receive a `game` API.
