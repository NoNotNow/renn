# Inspector (Property panel)

The inspector is the right-side panel that edits the **selected entity**: name, transform, shape, physics, material, 3D model, and transformers. It reads from the world document and optional live pose data so the displayed position/rotation stay in sync with the running scene.

## Role

- **PropertySidebar**: Tabs (Properties | Scripts | Assets). When the Properties tab is active, it renders **PropertyPanel**.
- **PropertyPanel**: Renders sections for the selected entity (Entity, Transform, Shape, Physics, Material, 3D Model, Transformers, Delete). It composes:
  - TransformEditor (position, rotation, scale)
  - ShapeEditor, PhysicsEditor, MaterialEditor, ModelEditor, TransformerEditor

## Data flow

- **Read**: Inspector gets `world` from ProjectContext (via Builder → PropertySidebar). For the selected entity it also receives optional **livePoses** (position/rotation from the running scene). Position and rotation **display** use `livePoses.get(entity.id)` when present, otherwise `entity.position` / `entity.rotation`.
- **User edits**: Changing a field calls `onWorldChange(newWorld)` (updates document and marks project dirty) or `onEntityPoseChange(id, pose)` (updates scene only; used for transform when SceneView is available).
- **Refresh from physics**: The “Refresh” button calls `getCurrentPose(entityId)` then `syncPosesFromScene(poses)` to write current scene poses back into the world (no dirty from this path in ProjectContext).

See **architecture.md** for ProjectContext, SceneView, and world/version flow.

## No-update-loop rule

Polling (or any programmatic display update) must **not** call `onWorldChange` or `updateEntity`. Live display uses a separate state **livePoses** (held in Builder, passed down). Updating that state only re-renders the inspector; it does not change `world`, so SceneView’s effect (which depends on `world`) does not run and the scene is not reloaded. User edits continue to go through `onWorldChange` / `onEntityPoseChange` only.

## Commit-on-blur

Inspector text and number inputs (entity name, transform, shape, physics, material, etc.) use a **commit-on-blur** pattern: while a field is focused, its value is held in local state and is **not** overwritten by prop updates (e.g. from `livePoses` polling). When the user blurs the field, the value is parsed/validated and applied to the world via `onWorldChange` / `onEntityPoseChange`. This prevents live updates (such as position/rotation from the running scene) from overwriting what the user is typing. Implemented in `DraggableNumberField`, `NumberInput`, and the entity name input in PropertyPanel.

## Key files

```
src/
├── pages/Builder.tsx           # livePoses state, polling (getAllPoses every 100ms), getCurrentPose, handleRefreshFromPhysics
├── components/
│   ├── PropertySidebar.tsx    # Tabs; passes world, livePoses, onWorldChange, etc. to PropertyPanel
│   ├── PropertyPanel.tsx       # Selected-entity editor; displayPosition/displayRotation from livePoses or entity
│   ├── TransformEditor.tsx    # Position, rotation, scale inputs
│   ├── ShapeEditor.tsx
│   ├── PhysicsEditor.tsx
│   ├── MaterialEditor.tsx
│   ├── ModelEditor.tsx
│   └── TransformerEditor.tsx
```
