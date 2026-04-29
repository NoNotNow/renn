# Renn AI Agent Guidelines

## Architecture Overview
Renn is a browser-based 3D game world builder using React + TypeScript + Three.js + Rapier physics. Key components:
- **Builder mode** (`/`): Edit worlds with live physics/scripts; uses `ProjectContext` for state, `RenderItemRegistry` for entity management, `CameraController` for navigation.
- **Play mode** (`/play`): Run worlds with physics + scripts; separate route to avoid edit interference.
- **World format**: JSON with `world-schema.json` validation; entities have `bodyType` (static/dynamic/kinematic), `shape`, `position`/`rotation` (Euler radians [x,y,z]), `material`, physics props.
- **Transformers**: Chain intent (e.g., `targetPoseInput` waypoints) to physics via `TransformOutput` (forces, `setPose`); see `src/transformers/`.
- **Scripting**: Event-based JS (`onSpawn`/`onUpdate`/`onCollision`/`onTimer`) with `ctx` API for entity control; Monaco editor in Builder.

## Key Workflows
- **Development**: `npm run dev` starts Vite dev server; edit in Builder, test in Play.
- **Testing**: `npm run test` (Vitest unit/component), `npm run test:e2e` (Playwright E2E), `npm run test:perf` (benchmarks with `RUN_PERF_BENCHMARKS=1`).
- **Build/Deploy**: `npm run build` (TypeScript + Vite), `npm run deploy` (GitHub Pages with `dist/index.html` → `404.html`).
- **Persistence**: IndexedDB via `src/persistence/indexedDb.ts`; export ZIP (`world.json` + `assets/`), import validates + rehydrates blobs.
- **Debugging**: UI logs via `src/utils/uiLogger.ts` (`window.uiLogger`); physics cached transforms avoid WASM aliasing; scripts run in main thread with validation.

## Project Conventions
- **Rotation**: Euler [x,y,z] radians; use `src/utils/visualBaseQuaternion.ts` for shape offsets (e.g., plane lay-flat via `applyVisualBase`).
- **Transforms**: Cached physics transforms in `RenderItemRegistry.syncFromPhysics` to prevent WASM errors; kinematic bodies use `setNextKinematicTranslation/Rotation`.
- **UI Patterns**: Reusable components (`NumberInput`, `VectorField`); multi-select merges fields in `PropertyPanel`; undo via `useEditorHistory` with coalescing.
- **Entity Defaults**: `src/data/entityDefaults.ts` for new entities; shapes normalized to unit cube in `createPrimitive.ts`.
- **Validation**: Ajv with `world-schema.json`; `validateWorldDocument` tolerates extra keys iteratively; migrations in `src/scripts/migrateWorld.ts`.

## Integration Points
- **Physics**: Rapier via `src/physics/rapierPhysics.ts`; `resetAllForces()` per frame; `addForce/Impulse/TorqueFromTransformer`.
- **Rendering**: Three.js meshes in `SceneView`; `loadWorld` awaits meshoptimizer; shadows via `updateMeshCastShadowFromWorldAabb`.
- **Assets**: IndexedDB global store; `assetResolver` for URLs/blobs; video textures via `@ffmpeg/ffmpeg`.
- **Scripts**: `ScriptRunner` compiles once; `ctx` from `createGameAPI`; event-specific IntelliSense via `scriptCtxDecl.ts`.
- **Camera**: Modes (free/follow/third-person); edit-navigation orbits selected entities; FOV clamps in first-person.

## Examples
- Add kinematic mover: Attach `targetPoseInput` (waypoints) + `kinematicMovement` transformers to entity with `bodyType: "kinematic"`.
- Script collision: `onCollision` script uses `ctx.other.getPosition()` to react to impacts; see `src/scripts/gameApi.ts`.
- UI edit: Multi-select entities, edit `position` in `TransformEditor.tsx`; applies to all via `updateWorld` in `ProjectContext`.
- Test physics: Use `src/test/helpers/physics.ts` for Rapier mocks; assert cached transforms in integration tests.

Reference: `agent-context/architecture.md`, `src/types/world.ts`, `src/components/SceneView.tsx`.</content>
<parameter name="filePath">/Users/manuelgilbertriviere/Documents/dev/renn/AGENTS.md
