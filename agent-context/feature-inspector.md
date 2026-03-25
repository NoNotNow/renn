# Inspector (Property panel)

The inspector is the right-side panel that edits the **selection** (one or more entities): name, transform, shape, physics, material, 3D model, transformers, and script attachments. With **multiple** entities selected, fields show a shared value only when all agree; otherwise they appear empty or show a short “mixed” notice. Edits apply to **every** selected entity. It reads from the world document and optional live pose data so displayed poses stay in sync with the running scene.

**Multi-select**: **Shift+click** or **Cmd+click** (Meta) on an entity in the viewport or entity list toggles that entity in the selection; a normal click replaces the selection with one entity. **Escape** clears the selection when focus is not in an input. **Clone** is disabled when more than one entity is selected.

## Role

- **PropertySidebar**: Tabs (Properties | Scripts | Assets). When the Properties tab is active, it renders **PropertyPanel**.
- **PropertyPanel**: Renders sections for the current selection (Entity, Transform, Shape, Physics, Material, 3D Model, Transformers). The header row includes an **Actions** group (`role="group"`, `aria-label="Actions"`) with icon buttons: **Refresh from physics** (optional), **Clone entity** (optional), **Delete** (optional; deletes all selected when any is unlocked). It composes:
  - TransformEditor (position, rotation, scale)
  - ShapeEditor, PhysicsEditor, MaterialEditor, ModelEditor, TransformerEditor
- **Model-Transform** (when trimesh or `entity.model`): edits `modelRotation` / `modelScale`. For **primitive + 3D Model** (not trimesh), **Show shape wireframe** toggles `entity.showShapeWireframe`: the viewport draws edge lines for the **physics primitive** (same geometry as the invisible picker root), not GLTF triangle wireframe. Trimesh-only entities omit this control. Removing the model or switching the shape to trimesh clears the flag. Runtime sync: `RenderItemRegistry.syncAllShapeWireframeOverlays` + `loadWorld` / `updateShape` via [`shapeWireframeOverlay.ts`](src/loader/shapeWireframeOverlay.ts); does not change [`getSceneDependencyKey`](src/utils/sceneDependencyKey.ts).

## Data flow

- **Read**: Inspector gets `world` from ProjectContext (via Builder → PropertySidebar). For each selected id it uses optional **livePoses** for display. Merged values use helpers in [`entityInspectorMerge.ts`](../src/utils/entityInspectorMerge.ts).
- **User edits**: Changing a field calls `onWorldChange(newWorld)` or bulk scene updates (`onEntityPoseChange(ids, pose)`, `onEntityPhysicsChange(ids, patch)`, etc.).
- **Refresh from physics**: Refreshes **all** selected entities via `getCurrentPose` + `syncPosesFromScene` for each id.
- **Clone entity**: The “Clone” button calls `onCloneEntity` → Builder’s `handleCloneEntity`, which uses `cloneEntityFrom` ([`entityDefaults.ts`](src/data/entityDefaults.ts)) with `getCurrentPose` for position/rotation. Placement uses [`clonePlacement.ts`](src/utils/clonePlacement.ts): same **Y** as the source pose, lateral offset in **XZ** from flattened local +X (fallback +Z, then world +X), separation from shape-based half-extent plus a small gap. The clone gets a new id, `name` suffixed with ` copy`, and `locked: false`. Delete stays disabled when the source is locked; clone remains available.

See **architecture.md** for ProjectContext, SceneView, and world/version flow.

## No-update-loop rule

Polling (or any programmatic display update) must **not** call `onWorldChange` or `updateEntity`. Live display uses a separate state **livePoses** (held in Builder, passed down). Updating that state only re-renders the inspector; it does not change `world`, so SceneView’s effect (which depends on `world`) does not run and the scene is not reloaded. User edits continue to go through `onWorldChange` / `onEntityPoseChange` only.

## Undo / redo (Builder)

- **Menu**: Edit → Undo / Redo (shortcuts **Ctrl+Z**, **Ctrl+Shift+Z** or **Ctrl+Y**; **Cmd** on macOS). Disabled while focus is in an input/textarea/select so browser editing keeps normal behavior.
- **Scope**: Snapshots of `RennWorld` plus a shallow copy of the assets `Map` (blobs are not removed from IndexedDB on undo). History clears when the document is replaced (`documentEpoch`: new project, load project, static init, JSON import).
- **Gizmo**: One undo step per completed drag (pointer/mouse up → pose commit in Builder).
- **Draggable numbers** (`DraggableNumberField` / `Vec3Field`): One undo step per horizontal scrub (after dead zone), or per blur commit when the value changed. `NumberInput` / `SelectInput` record a step when the committed value changes.
- **Scene sync**: Applying undo/redo uses `applyEditorSnapshot` in ProjectContext (bumps `version` so SceneView reloads and matches the restored document).

Implementation: [`editorHistory.ts`](../src/editor/editorHistory.ts), [`EditorUndoContext`](../src/contexts/EditorUndoContext.tsx), Builder + panel hooks.

## Commit-on-blur

Inspector text and number inputs (entity name, transform, shape, physics, material, etc.) use a **commit-on-blur** pattern: while a field is focused, its value is held in local state and is **not** overwritten by prop updates (e.g. from `livePoses` polling). When the user blurs the field, the value is parsed/validated and applied to the world via `onWorldChange` / `onEntityPoseChange`. This prevents live updates (such as position/rotation from the running scene) from overwriting what the user is typing. Implemented in `DraggableNumberField`, `NumberInput`, and the entity name input in PropertyPanel.

## Key files

```
src/
├── pages/Builder.tsx           # livePoses state, polling (getAllPoses every 100ms), getCurrentPose, handleRefreshFromPhysics, handleCloneEntity
├── components/
│   ├── PropertySidebar.tsx     # Tabs; passes world, livePoses, onWorldChange, etc. to PropertyPanel
│   ├── PropertyPanel.tsx       # Selected-entity editor; displayPosition/displayRotation from livePoses or entity
│   ├── sharedStyles.ts        # Inspector UI: sidebarTextInputStyle, iconButtonStyle, removeButtonStyle, secondaryButtonStyle, thumbnailButtonStyle
│   ├── TransformEditor.tsx    # Position, rotation, scale inputs
│   ├── ShapeEditor.tsx
│   ├── PhysicsEditor.tsx
│   ├── MaterialEditor.tsx
│   ├── ModelEditor.tsx
│   └── TransformerEditor.tsx
├── utils/assetUpload.ts       # uploadModel, uploadTexture; used by ShapeEditor (trimesh), MaterialEditor, ModelEditor
├── persistence/indexedDb.ts   # defaultPersistence shared by inspector and asset UI
├── utils/clonePlacement.ts    # clone horizontal placement next to source (same Y plane)
├── data/entityDefaults.ts     # cloneEntityFrom(deep clone + id/name/pose)
```

## Builder header: gizmo mode

Move / Rotate / Scale toolbar buttons sit next to the **Shadows** switch in `BuilderHeader`. They set `gizmoMode` (`translate` | `rotate` | `scale`). **One** unlocked selected entity: gizmo attaches to that mesh with **`space: 'local'`**. **Several** unlocked entities: a scene **pivot** at the average position uses **`space: 'world'`**; dragging applies a group transform so all move/rotate/scale together; scale still bakes per entity on mouse up. Scale commits update `entity.scale` (and shape/model bake when applicable) via `RenderItemRegistry`. **Locked** entities stay in the selection but are excluded from the gizmo target set.

## Scene picking (click → inspector)

Selection in the 3D view uses a **raycaster** on entity meshes. GLTF/model entities have nested meshes; the first hit is often a **child** without `userData.entityId`. **Resolution**: `findEntityRootForPicking` in `src/utils/entityPicking.ts` walks parents until an object with `entityId` is found. **Load time**: `loadWorld.ts` also traverses each entity mesh and copies `entityId` / `entity` onto descendants so any intersected node identifies the entity. Drag plane uses the **root’s world position** so nested local positions do not skew the drag plane.
