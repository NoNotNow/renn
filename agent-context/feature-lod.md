# Multi-Resolution LOD (Level of Detail)

Separate project from the current performance backlog. The existing `meshSimplifier.ts` can generate reduced geometries, but full LOD requires swap-distance logic, `THREE.LOD` integration, and asset pipeline changes for multi-resolution storage.

**Prerequisite:** Distance culling (hide small objects beyond a radius) is already implemented as a simpler alternative. LOD is the next step for scenes where distant objects should still be visible but at lower detail.

## What exists today (reusable)

- **`src/utils/meshSimplifier.ts`** -- meshoptimizer (multi-flag fallback) + `SimplifyModifier`, UV/color preservation, vertex compaction. Used at **load time** for trimesh colliders and visual decimation.
- **`ensureMeshoptSimplifierReady()`** already called early in `loadWorld`.
- **`computeTargetTriangleCount`** accepts `TrimeshSimplificationConfig` (maxTriangles / targetReduction / maxError).
- **`PerformanceBoosterDialog`** offers user-triggered simplification.
- **Frame Stats overlay** shows `geometries` count -- useful for identifying LOD candidates.

## What LOD requires (new work)

### a) Multi-resolution geometry generation

For each model (`entity.model` / trimesh), generate 2-3 resolution levels (e.g. 100%, 50%, 25% triangle count) using existing `simplifyGeometry`.

Decision: generate at **build/publish time** (asset pipeline, stored alongside the GLB) vs **load time** (in `buildEntityMesh` -- adds load latency but needs no pipeline changes). If load-time: cache reduced geometries per `modelId` so multiple entities sharing a model don't re-simplify.

### b) `THREE.LOD` integration

- Replace single-mesh entity root with a `THREE.LOD` object (or wrap existing root).
- `THREE.LOD.addLevel(mesh, distance)` for each resolution.
- `RenderItem` holds `readonly mesh: THREE.Mesh` -- would need to hold the LOD root or reference the active child.
- `userData` conventions (`usesModel`, `modelId`, `trimeshScene`) need to propagate to each LOD level.

### c) Swap-distance configuration

- Per-entity or global distance thresholds for LOD transitions.
- Could be driven by bounding sphere radius (larger objects stay high-res longer).
- Type extension: `Entity.lodConfig?: { distances?: number[]; reductions?: number[] }` or a global `WorldSettings` field.
- `THREE.LOD.update(camera)` must be called each frame -- hook into `runSceneFrame` after camera update, before `renderer.render`.

### d) Physics interaction

Physics colliders are separate from visual meshes -- LOD only affects rendering. Trimesh colliders already use simplified geometry; no physics change needed.

### e) Asset pipeline (if build-time generation)

- World save/export generates and stores reduced GLBs per model.
- Asset resolver loads the appropriate resolution.
- Storage/bandwidth cost: 2-3x model data per unique model.

## Suggested phased approach

1. **Phase 1 -- Load-time LOD (prototype)**: Generate 2 levels in `buildEntityMesh` using `simplifyGeometry` with 50% reduction. Wrap in `THREE.LOD` with a fixed swap distance (e.g. 20 units). Call `lod.update(camera)` in `sceneFrameLoop`. No type/pipeline changes.
2. **Phase 2 -- Configurable distances**: Add `lodConfig` to entity types. Derive swap distances from bounding sphere radius. Expose in inspector.
3. **Phase 3 -- Build-time generation + caching**: Pre-generate reduced meshes on publish. Cache per `modelId` in asset resolver. Remove load-time simplification overhead.

## Key files that would change

| File | Change |
|------|--------|
| `src/loader/createPrimitive.ts` | Wrap mesh in `THREE.LOD`, generate levels |
| `src/runtime/renderItem.ts` | Handle LOD root vs mesh child |
| `src/runtime/sceneFrameLoop.ts` | Call `lod.update(camera)` per frame |
| `src/types/world.ts` | LOD config on entity (Phase 2) |
| `src/utils/meshSimplifier.ts` | Convenience wrapper for multi-level generation |
| `src/runtime/renderItemRegistry.ts` | LOD-aware shape/material updates |

## Signals to start

- Frame Stats `geometries` count shows many unique geometries with high triangle counts at varying distances from camera.
- GPU `DispatchCommands` time remains above budget after distance culling and instancing (if applicable).
- User scenes with large environments where distant objects need to be visible but don't need full detail.
