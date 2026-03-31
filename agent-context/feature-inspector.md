# Inspector (Property panel)

The inspector is the right-side panel that edits the **selection** (one or more entities): name, transform, shape, physics, material, 3D model, transformers, and script attachments. With **multiple** entities selected, fields show a shared value only when all agree; otherwise they appear empty or show a short “mixed” notice. Edits apply to **every** selected entity. It reads from the world document and optional live pose data so displayed poses stay in sync with the running scene.

**Multi-select**: **Shift+click** or **Cmd+click** (Meta on macOS) / **Ctrl+click** (Windows/Linux) on an entity in the viewport or entity list toggles that entity in the selection; a normal click replaces the selection with one entity. **Escape** clears the selection when focus is not in an input. **Clone** is disabled when more than one entity is selected.

### Multiselect user stories

**Selection and navigation**

- As a builder, I extend selection with **Shift+click** or **Cmd/Ctrl+click** on the viewport or entity list so I can build arbitrary sets without losing focus.
- As a builder, I **replace** selection with a normal click on one entity when I want to drill into a single object.
- As a builder, I press **Escape** to clear selection when I am not typing in an input.

**Transform and gizmo**

- As a builder, I **move / rotate / scale** several unlocked entities at once using the **world-space pivot** at the average position; locked entities stay selected but **do not** participate in the gizmo.
- As a builder, I edit **position / rotation / scale** in the inspector when all agree; when values **differ**, I see empty fields and committing one triple applies it to **all** selected (uniform override).
- As a builder, one **gizmo drag** produces **one undo step** for the whole group move.

**Shape and layout**

- As a builder, I select entities with **different primitive types** (e.g. box and sphere) and set shape to **pyramid** so **each** becomes a pyramid sized from **its own** characteristic size (see [`shapeConversion.ts`](../src/utils/shapeConversion.ts) / [`multiSelectShapeChange.ts`](../src/utils/multiSelectShapeChange.ts)).
- As a builder, I select many objects of the **same** primitive type with **different** numeric parameters: the inspector shows the **primary** (first-selected) entity’s numbers; when I commit a change, **all** selected get those same parameters (uniform bulk edit, not a per-row spreadsheet).
- As a builder, when my selection **mixes trimesh, GLTF-on-primitive, and plain primitive**, I see the **yellow warning** and narrow the selection before shape/material editing.

**Mixed shape types (multi-select, different primitives)**

When several entities are selected and **shape types differ** but the shape section is still shown (uniform layout class), shared numeric parameters appear **by semantic role**: values merge only across shapes that actually have that field (`null` / empty when those values disagree). Committing updates **only** entities whose shape supports that parameter; others are unchanged.

- As a builder, I set **Radius** once for any mix of **sphere, cylinder, capsule, and cone** in the selection.
- As a builder, I set **Height** when **any** selected shape has a vertical extent (**box, cylinder, capsule, cone, pyramid, ring**); e.g. **box + sphere** changes the box only.
- As a builder, I set **Width** and **Depth** when **any** selected shape is a **box**; only boxes are updated.
- As a builder, I set **Base size** when **any** selected shape is a **pyramid**; only pyramids are updated.
- As a builder, the **Shape** type dropdown still shows `—` until I pick a new type; type changes use per-entity size preservation ([`multiSelectShapeChange.ts`](../src/utils/multiSelectShapeChange.ts)).
- **Non-goals:** ring **inner/outer** radius are not mapped to cylinder **radius** (avoid surprising coupling). **Plane** and **trimesh** do not gain fake shared rows with primitives beyond the rules above.

**Examples:** **Sphere + cylinder** — align **Radius**, then adjust **Height** for the cylinder only. **Box + pyramid** — match **Height** for a common vertical size; **Base size** affects pyramids only.

See [`mixedShapeDimensions.ts`](../src/utils/mixedShapeDimensions.ts).

**Physics**

- As a builder, I set **body type**, **mass**, **friction**, **restitution**, and **damping** once for every selected entity.
- As a builder, I use **Refresh from physics** with multiple selected to pull poses from the scene into the document for **each** id in one action.

**Material and appearance**

- As a builder, I paint **color / roughness / metalness / opacity** across selected primitives when the material section is available (merged or uniform override paths).
- As a builder, with **model + primitive** selections that qualify, I toggle **Show shape wireframe** or **Override with material** in bulk where the UI allows.

**Entity identity and safety**

- As a builder, I **delete** all unlocked selected entities in one action; delete stays disabled if **any** selection is locked.
- As a builder, I **toggle lock** for the whole selection (mixed lock states are normalized when toggling).
- As a builder, I see **ID** as `—` when multi; **bulk rename** (name blur) sets the **same** name on every selected entity.
- As a builder, **Clone** is unavailable with multi-select to avoid ambiguous copies.

**Models and transformers**

- As a builder, I assign the **same GLTF** to multiple primitive-backed entities when the 3D Model section is visible.
- As a builder, I align **transformer stacks**: when stacks **differ**, I see mixed state; committing applies the **same** stack to **all** selected.

**Copy payload**

- The Entity section’s copy payload is **`entities[]`** when multiple are selected, or a **single entity** when one is selected (`copyPayload` in PropertyPanel).

**Examples**

- **Fleet:** Select many crates → body **dynamic**, high friction, same transformer preset → one undo reverts the batch.
- **Visual pass:** Select a uniform group (same layout class) → adjust **roughness** together.
- **Rescue sim:** Select **dynamic** props → **Refresh from physics** after play to commit settled poses.

### Multiselect + undo / systems (contract)

| System | Rule |
|--------|------|
| **Discrete inspector edits** | One gesture → one `pushBeforeEdit` / commit path; bulk `updateAll` must **not** fire multiple undo snapshots for a single UI action. |
| **Vec3 scrubs** | `notifyScrubStart` / `notifyScrubEnd`: one scrub changing many entities still yields **one** undo step when applicable. |
| **Gizmo** | One undo step per completed group drag (unchanged). |
| **livePoses** | Display-only; never write `world` from the poller. |
| **Trimesh / model** | `shapePatchForEntity` still strips `model` / wireframe when switching to trimesh, etc. |

### Property matrix (multiselect)

| Area | Agree | Differ | Bulk edit |
|------|-------|--------|-----------|
| Title / Name / ID | Shared values | Mixed / `—` for ID | Name → all same on blur |
| Lock | One state | Toggle normalizes all | All |
| Transform | Merged vec3 | Empty (`null`) | All same on commit |
| Shape | Full editor | Type `—` when types differ; shared **Radius / Height / Width / Depth / Base size** when applicable ([`mixedShapeDimensions.ts`](../src/utils/mixedShapeDimensions.ts)) | Type change → per-entity preserve; same-type → uniform; mixed-type numeric → partial per shape |
| Physics | Merged | Empty | All |
| Material | Editor | Messages when mixed | All when path active |
| 3D Model / Model-Transform | Merged / mixed | Mixed messages | All when allowed |
| Transformers | List | Mixed | All same on commit |
| Mixed layout | — | Warning hides shape/material | Narrow selection |

## Role

- **PropertySidebar**: Tabs (Properties | Scripts | Assets). When the Properties tab is active, it renders **PropertyPanel**.
- **PropertyPanel**: Renders sections for the current selection (Entity, Transform, Shape, Physics, Material, 3D Model, Transformers). The header row includes an **Actions** group (`role="group"`, `aria-label="Actions"`) with icon buttons: **Refresh from physics** (optional), **Clone entity** (optional), **Delete** (optional; deletes all selected when any is unlocked). **JSON** textareas (transformer config, Avatar dialog advanced JSON) use a dynamic `<textarea rows>` from line count, capped at 30 ([`jsonTextareaRows.ts`](../src/utils/jsonTextareaRows.ts)), so short JSON is fully visible without a fixed max-height clip. It composes:
  - TransformEditor (position, rotation, scale)
  - ShapeEditor, PhysicsEditor, MaterialEditor, ModelEditor, TransformerEditor
- **EntitySidebar** (left, **Camera** tab when control is Follow): **Avatars** chips pick the follow-camera target; **Edit** opens **AvatarDialog**, which includes the same chip row ([`AvatarDialog`](../src/components/AvatarDialog.tsx) + [`EntitySidebar`](../src/components/EntitySidebar.tsx)) so you can switch the active avatar and which entity the dialog edits without returning to the sidebar. The dialog’s **Scripts** section at the bottom reuses [`EntityScriptEditor`](../src/components/EntityScriptEditor.tsx): script dropdown (attached vs other snippets), event / timer, **Manage scripts** (attach/detach from [`ScriptDialog`](../src/components/ScriptDialog.tsx)), Monaco editor, and **Apply** — same behavior as the Scripts tab for a single entity.
- **Model-Transform** (when trimesh or `entity.model`): edits `modelRotation` / `modelScale`. For **primitive + 3D Model** (not trimesh), **Show shape wireframe** toggles `entity.showShapeWireframe`: the viewport draws edge lines for the **physics primitive** (same geometry as the invisible picker root), not GLTF triangle wireframe. Trimesh-only entities omit this control. Removing the model or switching the shape to trimesh clears the flag. Runtime sync: `RenderItemRegistry.syncAllShapeWireframeOverlays` + `loadWorld` / `updateShape` via [`shapeWireframeOverlay.ts`](../src/loader/shapeWireframeOverlay.ts); does not change [`getSceneDependencyKey`](../src/utils/sceneDependencyKey.ts).

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
├── utils/multiSelectShapeChange.ts  # bulk shape edits; per-entity type conversion when types differ
├── utils/mixedShapeDimensions.ts   # shared Radius/Height/etc. when multi-select shape types differ
```

## Builder header: gizmo mode

Move / Rotate / Scale toolbar buttons sit next to the **Shadows** switch in `BuilderHeader`. They set `gizmoMode` (`translate` | `rotate` | `scale`). **One** unlocked selected entity: gizmo attaches to that mesh with **`space: 'local'`**. **Several** unlocked entities: a scene **pivot** at the average position uses **`space: 'world'`**; dragging applies a group transform so all move/rotate/scale together; scale still bakes per entity on mouse up. Scale commits update `entity.scale` (and shape/model bake when applicable) via `RenderItemRegistry`. **Locked** entities stay in the selection but are excluded from the gizmo target set.

## Scene picking (click → inspector)

Selection in the 3D view uses a **raycaster** on entity meshes. GLTF/model entities have nested meshes; the first hit is often a **child** without `userData.entityId`. **Resolution**: `findEntityRootForPicking` in `src/utils/entityPicking.ts` walks parents until an object with `entityId` is found. **Load time**: `loadWorld.ts` also traverses each entity mesh and copies `entityId` / `entity` onto descendants so any intersected node identifies the entity. Drag plane uses the **root’s world position** so nested local positions do not skew the drag plane.
