# Transformer User Stories and UI Paths

This document outlines the user stories and exact UI paths for managing transformer behaviors in the Renn Builder, focusing on shared vs. isolated configurations.

## System Context: Copy & Clone Behavior
When an entity is copied or cloned in the Builder (using the button in the Properties Bar or Ctrl+C/V), the system performs a structured clone.
- **Shared IDs**: The new entity points to the **exact same transformer IDs** in the world registry as the source entity.
- **Initial Shared State**: Immediately after cloning a group of cars, they all share the same `wanderer` definition.
- **Auto-Isolation**: By default, the current UI isolates these IDs as soon as an edit is made while multiple entities are selected, to ensure that per-entity behavior remains the "safe" default.

## 1. Mass Editing (Synchronized Change)
**User Story**: "I have a fleet of autonomous cars that all use the same 'wanderer' logic. I want to change the speed for all of them at once because they are part of the same group."

**UI Path**:
1. **Multi-Select**: In the Builder scene, select all entities you wish to edit (e.g., drag-select the group of cars or Shift+Click them in the Entity Explorer).
2. **Access Behavior**: In the right sidebar, click the **Code Tab** (marked with a `{ }` or code icon).
3. **Open Workspace**: Locate the shared transformer (e.g., `wanderer` or `car_tf3`) in the list and click it. This opens the full-screen **Behavior Workspace**.
4. **Edit Parameters**: In the transformer's parameter panel (middle/left of the Workspace), adjust the `speed` value.
5. **Commit**: Click **Apply** or wait for the auto-save.
   - *Current Behavior*: This will apply the change to all selected entities but will automatically isolate their IDs (e.g., `car1_tf3`, `car2_tf3`, etc.) in the registry to prevent accidental side effects later.
   - *Target Behavior*: The user should have the option to keep them linked to a single registry entry.

## 2. Isolated Editing (Single Entity Change)
**User Story**: "I want one specific car to be much faster than the others to act as a 'lead car', without affecting the rest of the fleet."

**UI Path**:
1. **Single-Select**: Select only the target entity in the scene or Entity Explorer.
2. **Open Workspace**: Click the code icon in the right sidebar or click the specific transformer in the Code tab.
3. **Modify**: Change the `speed` parameter in the Workspace.
4. **Commit**: Apply the change.
   - *Outcome*: Since only one entity is selected, the change is committed only to that entity's unique transformer ID in the registry. Even if it was previously sharing an ID, the system ensures this edit remains isolated to the selection.

## 3. Synchronizing/Linking Entities
**User Story**: "I've created a new car and I want it to use the exact same 'AutoBrake' configuration as my 'PoliceCar' entity, so that updates to the police car's braking logic automatically apply to this one too."

**UI Path**:
1. **Select Target**: Select the new car entity.
2. **Open Workspace**: Navigate to the **Transformers** tab.
3. **Link Existing [Proposed UI]**:
   - In the pipeline view, click the **"+" (Add)** button.
   - Select **"Link Existing..."** instead of "Create New".
   - A searchable list of all transformers currently in the `RennWorld.transformers` registry appears.
   - Type "PoliceCar" or browse to find the `PoliceCar_tf1` (AutoBrake) entry.
4. **Confirm**: The new car's pipeline now includes a reference to the same ID used by the police car.

---

## Missing Functionality and UI Elements

To make the workflows above user-friendly and robust, the following elements should be added to the Builder UI:

### 1. "Apply to Shared" vs "Isolate" Toggle
- **Where**: In the Workspace header or next to the "Apply" button when multiple entities are selected.
- **Function**: Allows the user to decide if they want to update the shared definition (affecting all entities using that ID, even those not currently selected) or "Split" the definition into unique copies for the current selection.

### 2. Transformer Registry Browser
- **Where**: A new sub-tab in the **Organize** section of the Workspace.
- **Function**: A dedicated view of the `RennWorld.transformers` registry. It should show:
  - Transformer Name/Type.
  - Number of entities currently using it (Usage count).
  - A "Rename Global ID" button.
  - A "Cleanup Unused" button to remove orphans.

### 3. Usage Indicator & "Make Unique" Button
- **Where**: On each transformer card in the pipeline view.
- **Function**:
  - **Indicator**: A small badge (e.g., `👤 x5`) showing how many entities share this transformer.
  - **Make Unique**: A button (scissors icon) that clones the shared definition to a new ID and updates only the current entity to use it, effectively "unlinking" it from the group.

### 4. Drag-and-Drop Linking
- **Where**: Entity Explorer and Workspace.
- **Function**: Allow dragging a transformer from the "Organize" registry list directly onto an entity in the Explorer to assign it, or into another entity's pipeline to link it.

### 5. Multi-Entity Status in Workspace
- **Where**: Workspace Header.
- **Function**: Clear visual feedback when the Workspace is in "Multi-Entity" mode (e.g., "Editing 12 Entities"). It should warn the user: *"Edits here will be applied to all 12 selected entities."*
