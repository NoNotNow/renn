# Scripting – Current State & Roadmap

Scripting lets users run JavaScript in the play runtime. Scripts are **event-bound at the data model level**: each script declares its event type (`onSpawn`, `onUpdate`, `onCollision`, or `onTimer`). They receive a single **`ctx`** argument whose shape varies by event; world, entity, and runtime APIs are on `ctx`.

---

## Current state

### Script editor (Builder)

- **CodingTabPanel** (`src/components/CodingTabPanel.tsx`): Right sidebar Code drawer — **name-list only**. Shows script IDs assigned to the selected entity. Clicking a name opens the **Workspace** anchored to that script. No editing in the sidebar.
- **Workspace** (`src/components/Workspace.tsx`): Full-screen overlay for all behavior authoring. The **Scripts** tab shows assigned scripts as chip selectors, event type/interval controls, Apply, and Monaco editor. **Manage** opens Organize > Entity scope pre-filtered to scripts. **Shift+Escape** opens the Workspace; **Escape** closes it.
- **Shared-script banner**: Appears in the Workspace Scripts tab when the selected script is used by more than one entity: "This script is shared. Used by: … Changes affect all of them."
- **Monaco** (`@monaco-editor/react`): JavaScript editor with **event-specific intellisense**: `addExtraLib` injects a `.d.ts` so `ctx` has the correct type for the selected script’s event (`OnSpawnCtx`, `OnUpdateCtx`, `OnCollisionCtx`, `OnTimerCtx`). See `src/scripts/scriptCtxDecl.ts` for `ctxDeclFor(event)`. For `onCollision` scripts, `ctx.other` (the other entity) and `ctx.impact` (CollisionImpact: `totalForce`, `totalForceMagnitude`, `maxForceMagnitude`, `maxForceDirection`) are discoverable in autocomplete.
- **World-level script registry**: `RennWorld.scripts` is `Record<string, ScriptDef>` (script ID → `{ event, source }` or `{ event: ‘onTimer’, interval, source }`). Scripts exist independently; entities reference them by ID.
- **Entity–script wiring**: `entity.scripts` is `string[]` (script IDs). The runtime routes by each script’s `event`; no per-entity event map. Assign or remove scripts via the **Organize** tab in Workspace (Entity scope) or the **Manage** button in the Scripts tab.

### Data model

- **`ScriptEvent`**: `'onSpawn' | 'onUpdate' | 'onCollision' | 'onTimer'`.
- **`ScriptDef`** (discriminated union in `src/types/world.ts`):
  - `{ event: 'onSpawn' | 'onUpdate' | 'onCollision'; source: string }`
  - `{ event: 'onTimer'; interval: number; source: string }`
- **`RennWorld.scripts`**: `Record<string, ScriptDef>`.
- **`Entity.scripts`**: optional `string[]` — script IDs. Each script’s `event` is declared on the script def.

### Runtime (Play)

- **ScriptRunner** (`src/scripts/scriptRunner.ts`): Compiles each script **once** (via `Function` constructor with validation). Wraps user source as `(function(ctx) { ... })`. Pre-builds **one ctx per (entity, event)** at construction; hot paths only mutate `ctx.dt` / `ctx.other` / `ctx.impact` / timer `elapsed` — **no per-frame allocation**. Uses pre-built lists/maps and `entityMap` for O(1) lookups.
- **Script context** (`src/scripts/scriptCtx.ts`): `ScriptCtxBase` (time, entity, entities, getPosition, setPosition, getRotation, setRotation, getUpVector, getForwardVector, resetRotation, addVectorToPosition, applyForce, applyImpulse, setTransformerEnabled, setTransformerParam, log, snackbar, setScore, getScore, setDamage, getDamage). Entity-scoped methods are driven by **`ENTITY_VIEW_METHODS`** (single source of truth); `buildEntityView` and `buildBaseCtxDelegations` build the runtime from that list (no duplication). `ctx.entity.touching` (and `ctx.other.touching` on collision) exposes **`list`** (world `Entity` objects in narrow-phase contact, from the last physics step) and **`empty`** (true when touching nothing). Event-specific: `OnUpdateCtx.dt`, `OnCollisionCtx.other` (ScriptEntity view, same API as `ctx.entity`) and `OnCollisionCtx.impact`, `OnTimerCtx.interval`. Factories: `allocOnSpawnCtx`, `allocOnUpdateCtx`, `allocOnCollisionCtx`, `allocOnTimerCtx`. Detect helpers use **`createDetectForId(game, getId)`** (one implementation for ctx.detect and entity/other.detect).
- **Game API** (`src/scripts/gameApi.ts`): Backing for ctx methods; ScriptRunner receives `GameAPI` and builds ctx from it.

**Pose APIs and current entity**

- **`getPosition(id?)`, `setPosition(id?, x, y, z)`, `getRotation(id?)`, `setRotation(id?, x, y, z)`**: When `id` is omitted, the **current entity** (the entity this script is attached to) is used. Example: `ctx.getPosition()` is equivalent to `ctx.getPosition(ctx.entity.id)`.
- **`ctx.entity`**: In addition to `id`, `name`, `position`, `rotation`, etc. (from the world data), the script-facing entity exposes **`getPosition()`**, **`getRotation()`**, **`getUpVector()`**, **`getForwardVector()`**, **`resetRotation()`**, **`addVectorToPosition(x, y, z, resetVelocity?)`**, **`setColor(r, g, b)`**, **`getColor()`**, **`applyForce(x, y, z)`**, **`applyImpulse(x, y, z)`**, **`detect`** (e.g. `ctx.entity.detect.isUpright()`), and **`touching`** — all bound to the current entity (no id param). Use these when you want the live pose or orientation without passing an id.

- **`ctx.entity.touching`** (and **`ctx.other.touching`**): **`list`** is an array of distinct world entities currently in **narrow-phase contact** with that entity (same rules as physics “touching”: at least one contact point, excludes self; reflects the **last** physics step). Reading **`list`** returns a new array each time. **`empty`** is `true` when there are no such neighbors (`ctx.entity.touching.empty` is cheaper than checking `list.length` when you only need a boolean). Example: `if (!ctx.entity.touching.empty) { ctx.log(ctx.entity.touching.list.map((e) => e.id)) }`.

- **`ctx.other`** (onCollision only): The other entity in the collision. Has the **same API as `ctx.entity`**: `getPosition()`, `getRotation()`, `getUpVector()`, `getForwardVector()`, `resetRotation()`, `addVectorToPosition(x, y, z, resetVelocity?)`, `setColor(r, g, b)`, `getColor()`, `applyForce(x, y, z)`, `applyImpulse(x, y, z)`, `detect.isUpright()` / `isUpsideDown()` / etc., and `touching.list` / `touching.empty`. Example: `ctx.other.getPosition()`, `ctx.other.detect.isUpright()`, `ctx.other.setColor(1, 0, 0)`. The runtime uses a pre-allocated view and only updates an internal ref (no allocation on the hot path).

- **`ctx` root**: Same methods with optional **`id?`** (default: current entity): `getPosition(id?)`, `getRotation(id?)`, `getUpVector(id?)`, `getForwardVector(id?)`, **`resetRotation(id?)`**, **`addVectorToPosition(id?, x, y, z, resetVelocity?)`**, **`setColor(id?, r, g, b)`**, **`getColor(id?)`**, `setPosition(id?, x, y, z)`, `setRotation(id?, x, y, z)`, `applyForce(id, x, y, z)`, `applyImpulse(id, x, y, z)`.

- **`addVectorToPosition(..., resetVelocity?)`**: When **`resetVelocity`** is `true`, the entity's linear velocity is set to zero after the position change. Use this so the displacement persists (e.g. a dynamic body under gravity won't immediately fall back). Example: `ctx.other.addVectorToPosition(50, 50, 50, true)`.

- **`setColor(id?, r, g, b)`**: Set the entity's mesh color (RGB in 0–1). Sync; only updates existing material color. Example: `ctx.entity.setColor(1, 0, 0)` for red, `ctx.setColor(ctx.other.id, 0, 1, 0)` for green on the other entity.

- **`getColor(id?)`**: Get the entity's mesh color (RGB in 0–1). Returns `[r, g, b]` or `null` if no material color. Example: `const c = ctx.entity.getColor()`; `ctx.getColor(ctx.other.id)` for the other entity's color.

- **`ctx.snackbar(message, durationSeconds?)`**: Shows a short-lived overlay at the bottom of the scene view (`SceneView`). Default duration is **10** seconds; pass a second number to customize. Invalid or negative durations fall back to **10**; the message is coerced with `String(message)`.

- **`ctx.setScore(value)`** / **`ctx.setDamage(value)`**: Update the score/damage HUD (green score, red damage). Only rendered when `SceneView` is mounted with **`showGameHud`** (Play always; Builder enables it via **View → Game HUD**, persisted in `localStorage` under `builderShowGameHud`). Non-finite numbers and negative values are ignored; displayed values are non-negative integers (`Math.floor` for finite `value ≥ 0`). **`ctx.getScore()`** / **`ctx.getDamage()`** return the last successfully applied HUD integers for this `GameAPI` instance (both start at **0**; ignored writes do not change the returned values). With the HUD enabled, drive telemetry appears: tach-style **speed** (km/h from the camera **`target`** forward speed) **bottom-left** at **15%** scene width (padded), chrome bezel; **steering wheel** PNG **bottom-center** at **35%** width with only the **upper ~60%** visible (lower **40%** cropped flush with the scene bottom). `SceneView` uses `overflow: hidden` so HUD can align to the edge. Constants in `GameHud.tsx` (`TACH_WIDTH_FRAC`, `WHEEL_WIDTH_FRAC`, `WHEEL_CLIP_BOTTOM_FRAC`). Not script-driven.

- **`ctx.raycast(dir, maxDistance?)`**: Cast a ray from the current entity's position in direction `dir` (`[x, y, z]` or `null`). The calling entity is automatically excluded from results. Returns `{ hit: boolean, distance: number, entityId: string }` — `distance` and `entityId` are 0/`''` when there is no hit. `maxDistance` defaults to 100. Returns no-hit immediately when `dir` is null (e.g. the result of `getForwardVector()` before physics is ready). Example: `const r = ctx.raycast(ctx.entity.getForwardVector(), 20); if (r.hit) ctx.log('Hit', r.entityId, 'at', r.distance)`.

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
- **`migrateWorldSimplificationFields`**: Clamps `shape.simplification` (trimesh) and `modelSimplification` so `maxError` ≥ 0.0001 and `maxTriangles` ≥ 500 (matches JSON schema). Runs after script migration and before validation on load, static load, zip import, and Play URL worlds; can append a warning when values were adjusted.

### Security

- ScriptRunner validates source for dangerous patterns and runs user code in a strict IIFE with only `ctx` in scope. Main-thread; see project-status “Script sandbox” for future hardening.

---

## Key files

| Concern              | File |
|----------------------|------|
| Script editor UI     | `src/components/Workspace.tsx`, `src/components/workspace/WorkspaceScriptsTab.tsx` |
| Script names (inspector) | `src/components/CodingTabPanel.tsx` |
| Script assign/detach | `src/components/workspace/WorkspaceOrganizeTab.tsx` |
| Ctx intellisense     | `src/scripts/scriptCtxDecl.ts` |
| Script types         | `src/types/world.ts` (`ScriptEvent`, `ScriptDef`, `Entity.scripts`) |
| Ctx types & alloc    | `src/scripts/scriptCtx.ts` |
| Game API             | `src/scripts/gameApi.ts` |
| Script snackbar UI   | `src/components/ScriptSnackbar.tsx` (wired from `SceneView` into `createGameAPI`) |
| Compile & run        | `src/scripts/scriptRunner.ts` |
| Migration            | `src/scripts/migrateWorld.ts` |
| Wiring in Play       | `src/components/SceneView.tsx` |

---

## Play avatars (camera + input)

Entities may include optional **`avatar`** (`enabled`, `preferredCamera`) in the world JSON; see PropertyPanel **Avatar (play)**. When `runScripts` and `runPhysics` are both on, the runtime builds an **`AvatarSession`** (`src/runtime/avatarSession.ts`): one entity receives keyboard-driven **`input`** transformer actions, and follow-camera **`target`** is updated when switching.

**Session memory:** Orbit yaw/pitch, zoom distance, and first-person FOV are remembered per avatar for the current session only (not saved in the world file).

**Hotkeys** (window `keydown`, ignored while typing in inputs / contenteditable): In **Builder**, **`1`** / **numpad 1** cycles to the next active play avatar when at least two playable avatars exist (same guard as camera mode **`0`**; not gated on Game HUD). With **Game HUD** on, **`=`** / **`+`** (numpad) = next avatar and **`-`** = previous (also requires at least two playable avatars).

**Script context** (all events, on `ctx`):

- `getCurrentAvatar(): string | null`
- `setCurrentAvatar(entityId: string): boolean` — `false` if the id is not a roster member
- `cycleAvatar(direction: 1 | -1): void`

---

## Roadmap

1. **PropertyPanel shortcut for entity scripts**
   Workspace Organize > Entity scope already manages script assignment. Optional: show a compact script list or direct link in PropertyPanel that opens the Workspace Scripts tab (shortcut past CodingTabPanel).

2. **World-level hooks**  
   Optional `RennWorld.onStart?: string` (script ID) and/or world-level “every frame” script.

3. **Optional later**  
   Script sandbox (Worker / iframe); more events (e.g. onTriggerEnter, onClick).

---

## Script examples

### Make collision partners red

On collision, turn the other entity red. Skips entities named "Ground".

**Event:** `onCollision`

```javascript
ctx.log("MAKE RED: " + ctx.other.name);

if (ctx.other.name === "Ground") return;
ctx.other.setColor(1, 0, 0);  // RGB 0–1
```

### Read current entity color

**Event:** any

```javascript
const color = ctx.entity.getColor();  // current entity
if (color) ctx.log("My color:", color[0], color[1], color[2]);

// With id (e.g. on collision):
const otherColor = ctx.getColor(ctx.other.id);
```

---

## Summary

- **Current**: Event-bound scripts with `ScriptDef` (event + source, plus `interval` for onTimer). Entity has `scripts: string[]`. Runtime passes a single **`ctx`** (event-specific shape); pre-allocated ctx, zero alloc on hot path. Monaco intellisense for `ctx` via `ctxDeclFor(event)`. Migration from legacy format in loadWorld. Script authoring via **Workspace** (Scripts tab + Organize tab); CodingTabPanel shows names only.
- **Roadmap**: PropertyPanel UI to attach scripts to entities; world-level onStart; later sandbox and more events.
