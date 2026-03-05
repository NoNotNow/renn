# Scripting – Current State & Roadmap

Scripting lets users run JavaScript in the play runtime. Scripts are **event-bound at the data model level**: each script declares its event type (`onSpawn`, `onUpdate`, `onCollision`, or `onTimer`). They receive a single **`ctx`** argument whose shape varies by event; world, entity, and runtime APIs are on `ctx`.

---

## Current state

### Script editor (Builder)

- **ScriptPanel** (`src/components/ScriptPanel.tsx`): Scripts tab in the right sidebar. When an entity is selected, shows **"Scripts for [Entity name]"** and a dropdown of scripts attached to that entity (with "Other scripts" for the rest). **Manage scripts** opens **ScriptDialog** to attach/detach scripts for the entity. **Detach from entity** removes the selected script only from the current entity’s `scripts` array; it does **not** delete the script from the world. When the script being edited is used by more than one entity, a **shared-script banner** appears: "This script is shared. Used by: … Changes affect all of them."
- **ScriptDialog** (`src/components/ScriptDialog.tsx`): Modal to manage which scripts are attached to the selected entity. Lists all world scripts (with search), "Attached to this entity", Attach selected / Detach / Create new script. Similar UX to TextureDialog for texture selection.
- **Monaco** (`@monaco-editor/react`): JavaScript editor with **event-specific intellisense**: `addExtraLib` injects a `.d.ts` so `ctx` has the correct type for the selected script’s event (`OnSpawnCtx`, `OnUpdateCtx`, `OnCollisionCtx`, `OnTimerCtx`). See `src/scripts/scriptCtxDecl.ts` for `ctxDeclFor(event)`.
- **World-level script registry**: `RennWorld.scripts` is `Record<string, ScriptDef>` (script ID → `{ event, source }` or `{ event: 'onTimer', interval, source }`). Scripts exist independently; entities reference them by ID.
- **Entity–script wiring**: `entity.scripts` is `string[]` (script IDs). The runtime routes by each script’s `event`; no per-entity event map. Assign or remove scripts via ScriptPanel ("Manage scripts") or ScriptDialog.

### Data model

- **`ScriptEvent`**: `'onSpawn' | 'onUpdate' | 'onCollision' | 'onTimer'`.
- **`ScriptDef`** (discriminated union in `src/types/world.ts`):
  - `{ event: 'onSpawn' | 'onUpdate' | 'onCollision'; source: string }`
  - `{ event: 'onTimer'; interval: number; source: string }`
- **`RennWorld.scripts`**: `Record<string, ScriptDef>`.
- **`Entity.scripts`**: optional `string[]` — script IDs. Each script’s `event` is declared on the script def.

### Runtime (Play)

- **ScriptRunner** (`src/scripts/scriptRunner.ts`): Compiles each script **once** (via `Function` constructor with validation). Wraps user source as `(function(ctx) { ... })`. Pre-builds **one ctx per (entity, event)** at construction; hot paths only mutate `ctx.dt` / `ctx.other` / timer `elapsed` — **no per-frame allocation**. Uses pre-built lists/maps and `entityMap` for O(1) lookups.
- **Script context** (`src/scripts/scriptCtx.ts`): `ScriptCtxBase` (time, entity, entities, getPosition, setPosition, getRotation, setRotation, applyForce, applyImpulse, setTransformerEnabled, setTransformerParam, log). Event-specific: `OnUpdateCtx.dt`, `OnCollisionCtx.other`, `OnTimerCtx.interval`. Factories: `allocOnSpawnCtx`, `allocOnUpdateCtx`, `allocOnCollisionCtx`, `allocOnTimerCtx`. The script-facing `ctx.entity` is a wrapper that includes runtime pose getters (see below).
- **Game API** (`src/scripts/gameApi.ts`): Backing for ctx methods; ScriptRunner receives `GameAPI` and builds ctx from it.

**Pose APIs and current entity**

- **`getPosition(id?)`, `setPosition(id?, x, y, z)`, `getRotation(id?)`, `setRotation(id?, x, y, z)`**: When `id` is omitted, the **current entity** (the entity this script is attached to) is used. Example: `ctx.getPosition()` is equivalent to `ctx.getPosition(ctx.entity.id)`.
- **`ctx.entity`**: In addition to `id`, `name`, `position`, `rotation`, etc. (from the world data), the script-facing entity exposes **`getPosition()`** and **`getRotation()`** that return the **runtime** position and rotation (Euler `[x, y, z]` in radians) of the current entity from the physics/registry layer. Use these when you want the live pose without passing an id (e.g. `ctx.entity.getPosition()`, `ctx.entity.getRotation()`).
- **Execution** (in `SceneView.tsx`):
  - **onSpawn**: Once per entity after load; pre-built list per entity.
  - **onUpdate**: Every frame; iterates `onUpdateEntries`, sets `ctx.dt`, calls hook.
  - **onTimer**: Same loop; `elapsed += dt`, fire when `elapsed >= interval`, then `elapsed -= interval`.
  - **onCollision**: O(1) lookup; set `ctx.other`, call hook.

### Migration

- **`migrateWorldScripts`** (`src/scripts/migrateWorld.ts`): Converts legacy world JSON (scripts as `Record<string, string>`, entity.scripts as event→id map) to ScriptDef + `entity.scripts: string[]`. Duplicates a script when the same id was used for multiple events. Called in `loadWorld` **before** `validateWorldDocument`.

### Security

- ScriptRunner validates source for dangerous patterns and runs user code in a strict IIFE with only `ctx` in scope. Main-thread; see project-status “Script sandbox” for future hardening.

---

## Key files

| Concern              | File |
|----------------------|------|
| Script editor UI     | `src/components/ScriptPanel.tsx` |
| Script selector (entity) | `src/components/ScriptDialog.tsx` |
| Ctx intellisense     | `src/scripts/scriptCtxDecl.ts` |
| Script types         | `src/types/world.ts` (`ScriptEvent`, `ScriptDef`, `Entity.scripts`) |
| Ctx types & alloc    | `src/scripts/scriptCtx.ts` |
| Game API             | `src/scripts/gameApi.ts` |
| Compile & run        | `src/scripts/scriptRunner.ts` |
| Migration            | `src/scripts/migrateWorld.ts` |
| Wiring in Play       | `src/components/SceneView.tsx` |

---

## Roadmap

1. **PropertyPanel UI for entity scripts**  
   ScriptPanel and ScriptDialog already let users assign/detach script IDs per entity. Optional: show a compact script list or link in PropertyPanel that opens the Scripts tab or ScriptDialog.

2. **World-level hooks**  
   Optional `RennWorld.onStart?: string` (script ID) and/or world-level “every frame” script.

3. **Optional later**  
   Script sandbox (Worker / iframe); more events (e.g. onTriggerEnter, onClick).

---

## Summary

- **Current**: Event-bound scripts with `ScriptDef` (event + source, plus `interval` for onTimer). Entity has `scripts: string[]`. Runtime passes a single **`ctx`** (event-specific shape); pre-allocated ctx, zero alloc on hot path. Monaco intellisense for `ctx` via `ctxDeclFor(event)`. Migration from legacy format in loadWorld.
- **Roadmap**: PropertyPanel UI to attach scripts to entities; world-level onStart; later sandbox and more events.
