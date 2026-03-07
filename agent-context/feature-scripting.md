# Scripting – Current State & Roadmap

Scripting lets users run JavaScript in the play runtime. Scripts are **event-bound at the data model level**: each script declares its event type (`onSpawn`, `onUpdate`, `onCollision`, or `onTimer`). They receive a single **`ctx`** argument whose shape varies by event; world, entity, and runtime APIs are on `ctx`.

---

## Current state

### Script editor (Builder)

- **ScriptPanel** (`src/components/ScriptPanel.tsx`): Scripts tab in the right sidebar. When an entity is selected, shows **"Scripts for [Entity name]"** and a dropdown of scripts attached to that entity (with "Other scripts" for the rest). **Manage scripts** opens **ScriptDialog** to attach/detach scripts for the entity. **Detach from entity** removes the selected script only from the current entity’s `scripts` array; it does **not** delete the script from the world. When the script being edited is used by more than one entity, a **shared-script banner** appears: "This script is shared. Used by: … Changes affect all of them."
- **ScriptDialog** (`src/components/ScriptDialog.tsx`): Modal to manage which scripts are attached to the selected entity. Lists all world scripts (with search), "Attached to this entity", Attach selected / Detach / Create new script. Similar UX to TextureDialog for texture selection.
- **Monaco** (`@monaco-editor/react`): JavaScript editor with **event-specific intellisense**: `addExtraLib` injects a `.d.ts` so `ctx` has the correct type for the selected script’s event (`OnSpawnCtx`, `OnUpdateCtx`, `OnCollisionCtx`, `OnTimerCtx`). See `src/scripts/scriptCtxDecl.ts` for `ctxDeclFor(event)`. For `onCollision` scripts, `ctx.other` (the other entity) and `ctx.impact` (CollisionImpact: `totalForce`, `totalForceMagnitude`, `maxForceMagnitude`, `maxForceDirection`) are discoverable in autocomplete.
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

- **ScriptRunner** (`src/scripts/scriptRunner.ts`): Compiles each script **once** (via `Function` constructor with validation). Wraps user source as `(function(ctx) { ... })`. Pre-builds **one ctx per (entity, event)** at construction; hot paths only mutate `ctx.dt` / `ctx.other` / `ctx.impact` / timer `elapsed` — **no per-frame allocation**. Uses pre-built lists/maps and `entityMap` for O(1) lookups.
- **Script context** (`src/scripts/scriptCtx.ts`): `ScriptCtxBase` (time, entity, entities, getPosition, setPosition, getRotation, setRotation, getUpVector, getForwardVector, resetRotation, addVectorToPosition, applyForce, applyImpulse, setTransformerEnabled, setTransformerParam, log). Entity-scoped methods are driven by **`ENTITY_VIEW_METHODS`** (single source of truth); `buildEntityView` and `buildBaseCtxDelegations` build the runtime from that list (no duplication). Event-specific: `OnUpdateCtx.dt`, `OnCollisionCtx.other` (ScriptEntity view, same API as `ctx.entity`) and `OnCollisionCtx.impact`, `OnTimerCtx.interval`. Factories: `allocOnSpawnCtx`, `allocOnUpdateCtx`, `allocOnCollisionCtx`, `allocOnTimerCtx`. Detect helpers use **`createDetectForId(game, getId)`** (one implementation for ctx.detect and entity/other.detect).
- **Game API** (`src/scripts/gameApi.ts`): Backing for ctx methods; ScriptRunner receives `GameAPI` and builds ctx from it.

**Pose APIs and current entity**

- **`getPosition(id?)`, `setPosition(id?, x, y, z)`, `getRotation(id?)`, `setRotation(id?, x, y, z)`**: When `id` is omitted, the **current entity** (the entity this script is attached to) is used. Example: `ctx.getPosition()` is equivalent to `ctx.getPosition(ctx.entity.id)`.
- **`ctx.entity`**: In addition to `id`, `name`, `position`, `rotation`, etc. (from the world data), the script-facing entity exposes **`getPosition()`**, **`getRotation()`**, **`getUpVector()`**, **`getForwardVector()`**, **`resetRotation()`**, **`addVectorToPosition(x, y, z, resetVelocity?)`**, **`setColor(r, g, b)`**, **`applyForce(x, y, z)`**, **`applyImpulse(x, y, z)`**, and **`detect`** (e.g. `ctx.entity.detect.isUpright()`) — all bound to the current entity (no id param). Use these when you want the live pose or orientation without passing an id.

- **`ctx.other`** (onCollision only): The other entity in the collision. Has the **same API as `ctx.entity`**: `getPosition()`, `getRotation()`, `getUpVector()`, `getForwardVector()`, `resetRotation()`, `addVectorToPosition(x, y, z, resetVelocity?)`, `setColor(r, g, b)`, `applyForce(x, y, z)`, `applyImpulse(x, y, z)`, and `detect.isUpright()` / `isUpsideDown()` / etc. Example: `ctx.other.getPosition()`, `ctx.other.detect.isUpright()`, `ctx.other.setColor(1, 0, 0)`. The runtime uses a pre-allocated view and only updates an internal ref (no allocation on the hot path).

- **`ctx` root**: Same methods with optional **`id?`** (default: current entity): `getPosition(id?)`, `getRotation(id?)`, `getUpVector(id?)`, `getForwardVector(id?)`, **`resetRotation(id?)`**, **`addVectorToPosition(id?, x, y, z, resetVelocity?)`**, **`setColor(id?, r, g, b)`**, `setPosition(id?, x, y, z)`, `setRotation(id?, x, y, z)`, `applyForce(id, x, y, z)`, `applyImpulse(id, x, y, z)`.

- **`addVectorToPosition(..., resetVelocity?)`**: When **`resetVelocity`** is `true`, the entity's linear velocity is set to zero after the position change. Use this so the displacement persists (e.g. a dynamic body under gravity won't immediately fall back). Example: `ctx.other.addVectorToPosition(50, 50, 50, true)`.

- **`setColor(id?, r, g, b)`**: Set the entity's mesh color (RGB in 0–1). Sync; only updates existing material color. Example: `ctx.entity.setColor(1, 0, 0)` for red, `ctx.setColor(ctx.other.id, 0, 1, 0)` for green on the other entity.

**Orientation detection (`ctx.detect`):** Use **`ctx.detect`** for reliable orientation checks (world +Y up, -Z forward). All methods take optional **`id?`** (default: current entity) and return **`boolean`**. Threshold 0.5 (0.9 for `isTilted`). Do not compare raw Euler components.

| Method | Meaning |
|--------|--------|
| `ctx.detect.isUpsideDown(id?)` | Entity's up points roughly down (up.y < -0.5). |
| `ctx.detect.isUpright(id?)` | Up roughly aligns with world +Y (up.y > 0.5). |
| `ctx.detect.isLyingOnSide(id?)` | Up roughly horizontal (|up.y| < 0.5) — tipped on one side. |
| `ctx.detect.isLyingOnBack(id?)` | Local back (+Z) points down (lying supine). |
| `ctx.detect.isLyingOnFront(id?)` | Local front (-Z) points down (lying prone). |
| `ctx.detect.isTilted(id?)` | Not upright (up.y < 0.9). |

Example: `if (ctx.detect.isUpsideDown()) { ctx.log('Flipped!') }`. See `direction-rotation-coordinates.md` for coordinate conventions.

- **Execution** (in `SceneView.tsx`):
  - **onSpawn**: Once per entity after load; pre-built list per entity.
  - **onUpdate**: Every frame; iterates `onUpdateEntries`, sets `ctx.dt`, calls hook.
  - **onTimer**: Same loop; `elapsed += dt`, fire when `elapsed >= interval`, then `elapsed -= interval`.
  - **onCollision**: O(1) lookup; set the internal ref for `ctx.other` (pre-allocated ScriptEntity view) to the other entity and `ctx.impact` (contact forces from Rapier); then call hook. No allocation on hot path. Impact is zeroed when no contact force event for that pair in the same step.

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
