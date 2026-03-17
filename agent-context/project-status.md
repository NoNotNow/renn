# Renn – Project Status

Last updated: 2026-03-02

## Completed

### Core runtime
- JSON schema (`world-schema.json`, draft 2020-12) + Ajv validation
- World loader: JSON → Three.js scene + entity meshes
- Rapier physics: collider shapes, physics→mesh sync, collision events, cached transforms (WASM aliasing fix)
- Camera controller: free fly, follow, top/front/right presets; first/third person; **tracking** (position-only, fixed angle, larger distance)
- Follow/third-person camera now rotates offset using target entity orientation (quaternion-driven follow behavior)
- Follow/third-person orbit: hold middle mouse button and drag to freely orbit the camera around the target (yaw + clamped pitch); orbit resets when switching camera control mode
- Script runner: main-thread, `game` API, hooks `onSpawn` / `onUpdate` / `onCollision`
- Asset resolver: textures + 3D models (GLB only) via blob URLs

### Persistence
- IndexedDB: projects (id, name, world, updatedAt) + asset blobs
- ZIP export/import: `world.json` + `assets/`

### Builder UI
- BuilderHeader: New, Save, Save as, Download, Upload, Play, gravity/shadows toggles
- EntitySidebar: entity list, add entity dropdown, camera control/target/mode
- PropertyPanel: TransformEditor, ShapeEditor, PhysicsEditor, MaterialEditor, entity name, delete
- ScriptPanel: Monaco editor, add/remove scripts
- AssetPanel: upload textures/models, list/remove
- Play view: separate route `/play`, loads world from URL query or sample
- In-scene interactions: click to select, drag to move
- ProjectContext: single source of truth, dirty tracking, memoized values

### Transformer system (Phases 1–4)
- Types, BaseTransformer, TransformerChain
- Input capture: keyboard + trackpad; input mapping + presets
- Preset transformers: **input**, **car2** (others removed)
- Transformer template dialog: load default or file-based presets from `src/data/transformerPresets/<type>/*.json`; save current config as JSON (download/copy)
- Physics integration: `applyForce/Impulse/TorqueFromTransformer`, `resetAllForces()`
- Script API: `setTransformerEnabled`, `setTransformerParam`

### Assets & models
- Texture workflow: TextureManager, TextureDialog, TextureThumbnail, TextureSelector
- 3D model workflow: ModelManager, ModelDialog, ModelThumbnail, ModelEditor
- Two physics modes: `entity.model` (visual only) or `trimesh` shape (visual + physics)
- Trimesh physics: vertices/indices extracted, concave geometry supported, warnings for >10K triangles
- Trimesh and entity.model: normalized to 1×1×1 unit cube at import (center + scale baked into geometry via `normalizeSceneToUnitCube`)
- Mesh simplification: SimplifyModifier, configurable via `shape.simplification`

### Quality
- Reusable form components: NumberInput, SelectInput, VectorField
- Centralized config constants, UI logger, shared styles
- Test helpers: entity, physics, React, Three.js, world utilities
- E2E tests: Playwright (`e2e/add-entity.spec.ts`)

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
