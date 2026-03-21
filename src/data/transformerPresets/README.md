# Transformer preset templates

Each subfolder corresponds to a transformer type (`car2`, `input`, `person`, `targetPoseInput`, `kinematicMovement`). Add JSON files here to make them available in the Builder’s transformer template dialog.

- **Format:** One file per template; file name (without `.json`) is the preset name. Content must be a single `TransformerConfig` object (same shape as in world JSON).
- **Example:** `car2/sport.json` with `{ "type": "car2", "priority": 10, "enabled": true, "params": { "power": 1200, "lateralGrip": 140 } }`.
- **Person:** Use `person/default.json` for the person transformer; use `input/keyboard-person.json` for WASD input mapping (forward, backward, turn_left, turn_right, run).
- **Kinematic path:** `targetPoseInput` publishes **`TransformInput.target`** (waypoints + linear `speed` in m/s only). `kinematicMovement` reads `target` and outputs **`setPose`**. Prefer **`bodyType: kinematic`** on the entity. See `agent-context/feature-transformers.md` for intent vs execution.

You can edit these files in the project; they are loaded at runtime when opening the template dialog.
