# Renn – Start Here

**Renn** is a browser-based 3D game world builder and runtime. Users build worlds with entities, physics, and scripts; then play them in a separate view.

## Key concepts

- **Entity**: a 3D object with shape, physics body, material, optional scripts, and optional transformers.
- **World**: JSON document (`world-schema.json`) containing entities, gravity, lighting, and camera config.
- **Transformer**: converts user input or AI intent into physics impulses (see `feature-transformers.md`).
- **Script**: JavaScript receiving a single `ctx` (event-specific shape); events: `onSpawn`, `onUpdate`, `onCollision`, `onTimer`. See `feature-scripting.md`.
- **Physics**: Rapier WASM. Forces must be reset each frame (see `bugfix-spinning.md`).

## Task → file map

| I'm working on… | Read… |
|---|---|
| Overall structure / data flow | `architecture.md` |
| Entity movement, input, physics behavior | `feature-transformers.md` |
| Input + car2 paradigms (layering, presets, transferability) | `transformer-paradigm-input-and-car2.md` |
| Scripts, game API, events, intellisense | `feature-scripting.md` |
| Property panel, inspector, live poses, picking (incl. 3D model meshes), no-update-loop | `feature-inspector.md` |
| World update path, rebuild triggers, minimal reload strategy | `feature-world-update-reload.md` |
| What is done / what is left to build | `project-status.md` |
| Example worlds and JSON configs | `example-worlds.md` |
| Rotation/direction coordinates (Euler, radians, caveats) | `direction-rotation-coordinates.md` |
| Physics force accumulation quirk | `bugfix-spinning.md` |

## Tech stack (quick ref)

| Concern | Library |
|---|---|
| 3D rendering | Three.js |
| Physics | Rapier (`@dimforge/rapier3d-compat`) |
| UI | React + Vite |
| Script editor | Monaco |
| Persistence | IndexedDB (idb) + JSZip |
| Validation | Ajv (JSON Schema 2020-12) |
| Tests | Vitest + Playwright |

## Key source paths

```
src/
├── types/world.ts          # Entity, Shape, Vec3, Rotation types
├── loader/loadWorld.ts     # World JSON → Three.js scene
├── physics/rapierPhysics.ts
├── runtime/renderItemRegistry.ts
├── scripts/scriptCtx.ts    # ctx types and alloc
├── scripts/gameApi.ts      # backing for ctx
├── transformers/           # Transformer system
├── contexts/ProjectContext.tsx
└── components/SceneView.tsx  # Main render + game loop
```
