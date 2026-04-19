# Renn – Project Status

Last updated: 2026-04-12

## Completed

### Tooling (2026-04-08)
- `npm run build` (`tsc -b` + Vite): resolved project-wide strict TS issues (tests, Monaco typings, Rapier `init`, script migration `ScriptDef`, validation import, geometry/trimesh extraction typing, mocks). Dev dependency: `@types/node` + `tsconfig` `types` includes `node` for `Buffer` / `node:fs` in tests.

### Core runtime
- JSON schema (`world-schema.json`, draft 2020-12) + Ajv validation
- World loader: JSON → Three.js scene + entity meshes
- Rapier physics: collider shapes, physics→mesh sync, collision events, cached transforms (WASM aliasing fix)
- Camera controller: free fly (W/S along view or Alt+W/S vertical, A/D strafe, translation boost ramps up unbounded while keys held, arrow look with capped max turn rate after ramp, Shift = translation sprint only, quaternion look), follow, top/front/right presets; first/third person; **tracking** (follows target position only—no entity rotation on the offset; world-space orbit/zoom like follow, 3× follow standoff for default distance); optional **`editorFreePose`** on saved world for Builder viewport restore
- Follow/third-person camera now rotates offset using target entity orientation (quaternion-driven follow behavior)
- **First person**: no target-position lerp; look uses entity quaternion plus vehicle-local orbit yaw/pitch (shared with SceneView drag/trackpad) and ~**5°** pitch up; mouse wheel / pinch adjusts **FOV** in first person; **FOV returns to 50°** when switching to another mode; entering first person resets orbit yaw/pitch/distance
- Follow / third-person / tracking orbit: middle-mouse drag, trackpad scroll, pinch, and mouse wheel orbit or zoom around the target; **orbit pitch is not angle-clamped**; orbit resets when switching camera control mode
- Script runner: main-thread, `game` API, hooks `onSpawn` / `onUpdate` / `onCollision`
- Asset resolver: textures, **video map assets** (`VideoTexture`), + 3D models (GLB only) via blob URLs

### Persistence
- IndexedDB: projects (id, name, world, updatedAt) + asset blobs
- ZIP export/import: `world.json` + `assets/`

### Builder UI
- BuilderHeader: New, Save, Save as, Download, Upload, Play, gravity/shadows toggles
- EntitySidebar: entity list (search + collapsible filters by 3D model, shape, transformers, approximate size), add entity dropdown, camera control/target/mode; **0** / **Numpad 0** in Builder cycles camera mode (when focus is not in an editable field)
- **Explorer Groups (Phase A)**: Blender-style folder tree in EntitySidebar — Group / Ungroup / Add to group / Remove from group toolbar buttons, **Cmd/Ctrl+G** and **Cmd/Ctrl+Shift+G** shortcuts, single-parent invariant, sub-group nesting, collapse/rename, persisted via `RennWorld.groups`. Purely organizational — no runtime/Play-mode effect. See `feature-groups.md`. Phase B (rigging via Rapier joints) is documented in `feature-rigging-roadmap.md`.
- PropertyPanel: TransformEditor, ShapeEditor, PhysicsEditor, MaterialEditor, entity name, delete
- ScriptPanel: Monaco editor, add/remove scripts
- AssetPanel: upload textures / **videos** / models, list/remove; per-asset download; bulk download all as `assets.zip`
- Sound tab: select/upload background audio (`world.sound.assetId`), set `volume`, `loop`, `autoplay`; manual play/stop in Builder; playback runs in Builder and Play
- Play view: separate route `/play`, loads world from URL query or sample
- In-scene interactions: click to select, drag to move
- ProjectContext: single source of truth, dirty tracking, memoized values

### Transformer system (Phases 1–4)
- Types, BaseTransformer, TransformerChain
- Input capture: keyboard + trackpad; input mapping + presets
- Preset transformers: **input**, **car2**, **person**, **targetPoseInput**, **kinematicMovement**, **wanderer**, **follow**
- Transformer template dialog: load default or file-based presets from `src/data/transformerPresets/<type>/*.json`; save current config as JSON (download/copy)
- Physics integration: `applyForce/Impulse/TorqueFromTransformer`, `resetAllForces()`
- Script API: `setTransformerEnabled`, `setTransformerParam`

### Assets & models
- Texture workflow: TextureManager, TextureDialog, TextureThumbnail
- **Video material maps:** `VideoManager`, ffmpeg.wasm transcode (`@ffmpeg/ffmpeg`, max 720p MP4), `VideoConversionDialog`, `VideoThumbnail` / `MapMediaThumbnail`, `AssetRef.type: 'video'`, `THREE.VideoTexture` in `materialFromRef`; sky dome picker still images-only (`allowVideo={false}`). See `agent-context/feature-video-texture.md`.
- **Texture Maker Apply** bakes the layered document to a **new** flat image asset named `{stem}_editedN.{ext}` (extension matches baked MIME, typically `.png`); entity `material.map` switches to that asset; prior `composite_*` / `texdoc_*` / layer blobs are removed when unreferenced. `TextureDocument` may carry `editFamilyStem` / `editFamilyFileExt` for naming (set when opening the studio from a texture). Opening Texture maker with **no** map creates a 500×500 blank layered doc with stem `custom_texture` (`TEXTURE_NEW_DOCUMENT_*` in `textureCompositor.ts`). The **paint** toolbar control stays enabled for a single selection with no map; the first viewport stroke runs `prepareWorldPaintStroke` to provision the blank composite and apply it before painting.
- **Texture Maker undo/redo** — while the panel is open, menu/keyboard undo first walks a **draft-only** stack (`textureMakerHistory.ts`: document JSON + layer blobs + selected layer) so the Builder scene is not reloaded; when that stack is empty, global editor undo applies. See `agent-context/feature-texture-compositor.md`.
- **Select Texture** dialog hides internal compositor keys (`composite_*`, `texdoc_*`, `texlayer_*`, `tex_paint_*`) and **groups** `*_editedN.*` variants under a collapsible family row (newest first inside the group).
- 3D model workflow: ModelManager, ModelDialog, ModelThumbnail, ModelEditor
- Two physics modes: `entity.model` (visual only) or `trimesh` shape (visual + physics)
- Trimesh physics: vertices/indices extracted, concave geometry supported, warnings for >10K triangles
- Trimesh and entity.model: normalized to 1×1×1 unit cube at import (center + scale baked into geometry via `normalizeSceneToUnitCube`)
- Mesh simplification: **meshoptimizer** (default) or legacy Three.js `SimplifyModifier` via `shape.simplification` for **trimesh** (render + physics) or `entity.modelSimplification` for **3D model on a primitive** (visual only). `maxError` is meshoptimizer’s relative tolerance (default **0.01** ≈ 1% of extent); schema enforces minimum **0.0001** only—no upper cap (Performance booster and saved worlds can use larger values for aggressive decimation). The meshoptimizer path in [`src/utils/meshSimplifier.ts`](../src/utils/meshSimplifier.ts) tries **`Prune` → no flags → `Permissive` → `Prune`+`Permissive`**, then **`simplifySloppy`**, because some large GLBs return **unchanged** topology when only `Prune` is used (Performance booster preview would show `X → X` and Apply stayed disabled). **Tools → Performance booster** lists entities with **trimesh** or **`entity.model`** when **visual** GLTF triangle count exceeds the filter; plain primitives without a model are omitted. Triangle counts use the **rendered GLTF** (not the invisible physics wrapper for `entity.model`). The filter only affects **who appears** in the grid; the simplification target comes from the **ratio** slider. **Viewport pick** uses the **nearest** raycast hit. Large `material.map` textures: same dialog, texture downscale. **Persistence:** mesh **Apply** bakes the simplified GLB into the global asset map at the same model asset id (replacing the blob), then removes simplification fields from the entity so save/load does not re-decimate; implementation in [`src/utils/bakeSimplifiedModelAsset.ts`](../src/utils/bakeSimplifiedModelAsset.ts); Vitest integration in [`src/utils/bakeSimplifiedModelAsset.test.ts`](../src/utils/bakeSimplifiedModelAsset.test.ts).

### Quality
- Reusable form components: NumberInput, SelectInput, VectorField
- Centralized config constants, UI logger, shared styles
- Test helpers: entity, physics, React, Three.js, world utilities
- E2E tests: Playwright (`e2e/add-entity.spec.ts`, `e2e/performance-booster.spec.ts`, `e2e/script-panel-layout.spec.ts`, `e2e/multi-select.spec.ts`)

---

## To do

### Medium priority
- [ ] **Replace on import** – after import, let user choose "New project" or "Replace existing"
- [ ] **First-person controls** – pointer lock + mouse driving camera rotation
- [x] **Third-person orbit** – orbit camera around target with pitch/yaw via middle-mouse drag (follow + thirdPerson modes)

### Lower priority / later
- [ ] **TransformerPanel UI** – visual editor for transformer configs in the Builder
- [ ] **3D model thumbnails** – render actual previews instead of 📦 icon
- [ ] **Separate collision meshes** – specify distinct visual and collision models
- [ ] **Backend** – Node.js, PostgreSQL, S3; defer until needed
- [ ] **Script sandbox** – Worker/cross-origin iframe if scripts become shared/untrusted
- [ ] **World schema versioning** – migration path when `version` changes
