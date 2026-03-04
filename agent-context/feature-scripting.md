# Scripting – Current State & Roadmap

Scripting lets users run JavaScript in the play runtime. Scripts have access to a `game` API and can be triggered by events.

---

## Current state

### Script editor (Builder)

- **ScriptPanel** (`src/components/ScriptPanel.tsx`): Scripts tab in the right sidebar.
- **Monaco** (`@monaco-editor/react`): Full editor with JavaScript syntax highlighting, basic JS intellisense, dark theme, no minimap.
- **World-level script registry**: `RennWorld.scripts` is `Record<string, string>` (script ID → source). Users add/remove scripts and pick one to edit in the dropdown.
- **No entity–script wiring in UI**: Which script runs for which event is stored on the entity (`entity.scripts`), but the PropertyPanel does not yet expose dropdowns to assign script IDs to `onSpawn` / `onUpdate` / `onCollision`. Assignment is only possible by editing the world JSON (or code).

### Data model

- **`RennWorld.scripts`**: `Record<string, string>` — script ID → source code.
- **`Entity.scripts`** (`EntityScripts` in `src/types/world.ts`): optional `onSpawn`, `onUpdate`, `onCollision` — each value is a **script ID** referring to `world.scripts`. The event is thus already associated with the script via this map.

### Runtime (Play)

- **ScriptRunner** (`src/scripts/scriptRunner.ts`): Compiles each script once (via `Function` constructor with validation), stores hooks by script ID, and resolves entity → script IDs from `entity.scripts`.
- **Game API** (`src/scripts/gameApi.ts`): Scripts receive `game` with `time`, `entities`, `getEntity(id)`, `getPosition` / `setPosition`, `applyForce` / `applyImpulse`, `setTransformerEnabled` / `setTransformerParam`, `log(...)`.
- **Execution** (in `SceneView.tsx`):
  - **onSpawn**: Once per entity when the world is loaded (after ScriptRunner is created), in entity order.
  - **onUpdate**: Every frame, for each entity that has `scripts.onUpdate` set; receives `(dt, entity)`.
  - **onCollision**: When physics reports a collision; both entities get `runOnCollision` with `(entityId, otherId)`; script receives `(dt, entity, other)`.

Scripts are **entity-scoped**: they are tied to an entity via `entity.scripts` and receive that entity (and optionally `other` for collision). There is no world-level “on start” or “every frame for the whole world” hook yet.

### Security

- ScriptRunner validates source for dangerous patterns (`eval`, `Function(`, `import(`, `require(`, etc.) and runs user code in a strict IIFE with only `game`, `dt`, `entity`, `other` in scope. Still main-thread and not fully sandboxed; see project-status “Script sandbox” for future hardening.

---

## Key files

| Concern              | File |
|----------------------|------|
| Script editor UI     | `src/components/ScriptPanel.tsx` |
| Script types         | `src/types/world.ts` (`EntityScripts`, `RennWorld.scripts`) |
| Game API             | `src/scripts/gameApi.ts` |
| Compile & run hooks  | `src/scripts/scriptRunner.ts` |
| Wiring in Play       | `src/components/SceneView.tsx` (ScriptRunner creation, runOnSpawn after load, runOnCollision in physics step, runOnUpdate each frame) |

---

## Roadmap

1. **Event-driven execution (align UI with model)**  
   Scripts are already triggered on:
   - **Start (per-entity)**: `onSpawn` when the program/world loads.  
   - **Every frame (per-entity)**: `onUpdate`.  
   - **Collision (per-entity)**: `onCollision`.  
   The **event is already associated with the script** via `entity.scripts` (e.g. `onUpdate: "myScriptId"`). Remaining work: expose this in the Builder so users can assign a script to each event per entity (e.g. in PropertyPanel: dropdowns for “On spawn”, “On update”, “On collision” that list `world.scripts` keys).

2. **World-level / program start**  
   Add a single **world-level** hook that runs once when play starts (e.g. `RennWorld.onStart?: string` — script ID). ScriptRunner would need a way to run this once after load (no entity; script could use `game.*` only). Optional: world-level “every frame” script for global logic.

3. **Intellisense for `game`**  
   Monaco currently gives generic JavaScript intellisense. To get autocomplete for `game.*`, add Monaco’s `extraLib` (or `javascriptDefaults.addExtraLib`) with a `.d.ts` declaration file for the `GameAPI` interface so editors see `game.log`, `game.getPosition`, etc.

4. **Optional later**  
   - Script sandbox (Worker / iframe) for untrusted or shared scripts.  
   - More events (e.g. “onTriggerEnter”, “onClick”) as the runtime gains those features.

---

## Summary

- **Current**: Scripting window with Monaco (and basic intellisense), world-level script registry, entity-scoped hooks (`onSpawn`, `onUpdate`, `onCollision`) with event–script association stored on the entity; runtime runs them correctly in Play. Builder does not yet let users assign scripts to events per entity.
- **Roadmap**: (1) PropertyPanel UI to associate script IDs with onSpawn/onUpdate/onCollision per entity; (2) world-level “on start” (and optionally “every frame”); (3) Monaco extraLib for `game` API intellisense; (4) later sandbox and more events.
