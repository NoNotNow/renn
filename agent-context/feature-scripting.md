# Scripting – Current State & Roadmap

Scripting lets users run JavaScript in the play runtime. Scripts are **event-bound at the data model level**: each script declares its event type (`onSpawn`, `onUpdate`, `onCollision`, or `onTimer`). They receive a single **`ctx`** argument whose shape varies by event; world, entity, and runtime APIs are on `ctx`.

---

## Current state

### Script editor (Builder)

- **ScriptPanel** (`src/components/ScriptPanel.tsx`): Scripts tab in the right sidebar. Dropdown to select script, **event type picker** (onSpawn / onUpdate / onCollision / onTimer), **interval (seconds)** when event is `onTimer`.
- **Monaco** (`@monaco-editor/react`): JavaScript editor with **event-specific intellisense**: `addExtraLib` injects a `.d.ts` so `ctx` has the correct type for the selected script’s event (`OnSpawnCtx`, `OnUpdateCtx`, `OnCollisionCtx`, `OnTimerCtx`). See `src/scripts/scriptCtxDecl.ts` for `ctxDeclFor(event)`.
- **World-level script registry**: `RennWorld.scripts` is `Record<string, ScriptDef>` (script ID → `{ event, source }` or `{ event: 'onTimer', interval, source }`).
- **Entity–script wiring**: `entity.scripts` is `string[]` (script IDs). The runtime routes by each script’s `event`; no per-entity event map. PropertyPanel does not yet expose UI to assign script IDs to entities (edit world JSON or add scripts in ScriptPanel and attach via future UI).

### Data model

- **`ScriptEvent`**: `'onSpawn' | 'onUpdate' | 'onCollision' | 'onTimer'`.
- **`ScriptDef`** (discriminated union in `src/types/world.ts`):
  - `{ event: 'onSpawn' | 'onUpdate' | 'onCollision'; source: string }`
  - `{ event: 'onTimer'; interval: number; source: string }`
- **`RennWorld.scripts`**: `Record<string, ScriptDef>`.
- **`Entity.scripts`**: optional `string[]` — script IDs. Each script’s `event` is declared on the script def.

### Runtime (Play)

- **ScriptRunner** (`src/scripts/scriptRunner.ts`): Compiles each script **once** (via `Function` constructor with validation). Wraps user source as `(function(ctx) { ... })`. Pre-builds **one ctx per (entity, event)** at construction; hot paths only mutate `ctx.dt` / `ctx.other` / timer `elapsed` — **no per-frame allocation**. Uses pre-built lists/maps and `entityMap` for O(1) lookups.
- **Script context** (`src/scripts/scriptCtx.ts`): `ScriptCtxBase` (time, entity, entities, getPosition, setPosition, applyForce, applyImpulse, setTransformerEnabled, setTransformerParam, log). Event-specific: `OnUpdateCtx.dt`, `OnCollisionCtx.other`, `OnTimerCtx.interval`. Factories: `allocOnSpawnCtx`, `allocOnUpdateCtx`, `allocOnCollisionCtx`, `allocOnTimerCtx`.
- **Game API** (`src/scripts/gameApi.ts`): Backing for ctx methods; ScriptRunner receives `GameAPI` and builds ctx from it.
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
   Expose dropdowns (or list) so users can assign script IDs to an entity’s `scripts` array without editing JSON.

2. **World-level hooks**  
   Optional `RennWorld.onStart?: string` (script ID) and/or world-level “every frame” script.

3. **Optional later**  
   Script sandbox (Worker / iframe); more events (e.g. onTriggerEnter, onClick).

---

## Summary

- **Current**: Event-bound scripts with `ScriptDef` (event + source, plus `interval` for onTimer). Entity has `scripts: string[]`. Runtime passes a single **`ctx`** (event-specific shape); pre-allocated ctx, zero alloc on hot path. Monaco intellisense for `ctx` via `ctxDeclFor(event)`. Migration from legacy format in loadWorld.
- **Roadmap**: PropertyPanel UI to attach scripts to entities; world-level onStart; later sandbox and more events.
