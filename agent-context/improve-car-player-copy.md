# Improve car — Player Car copy (`entity_1779823253285_brtkx1p`)

Living tracker for self-driving behavior on **Player Car copy** in the **hunt_repair2** example world. Agents use skill [`.cursor/skills/improve-car/SKILL.md`](../.cursor/skills/improve-car/SKILL.md) (`/improve-car`) and **update this file** after each working session.

---

## Scope

| Field | Value |
|--------|--------|
| **Entity id** | `entity_1779823253285_brtkx1p` |
| **Display name** | Player Car copy |
| **Example world** | `hunt_repair2` — [`public/exampleWorlds/hunt_repair2/`](../public/exampleWorlds/hunt_repair2/) |
| **Follow target** | Entity `car` (“Player Car”) — binding `transformerPipeStack[].params.id: "car"` on **Pipe3** |
| **Primary pipe** | `pipe3` (shared registry stages `car_tf*`, entity-local stages `entity_1779823253285_brtkx1p_tf*`) |

**Success (working definition):** Copy drives autonomously toward `car`, avoids static/dynamic obstacles with stable steering/throttle, no console/runtime errors, human takeover (WASD) still wins when pressed.

---

## Approach (architecture)

High-level pipeline on **Pipe3** (priority order — see `get_entity_authoring_summary` after attach for ground truth):

1. **Target motion (optional / legacy)** — `targetPoseInput` + **wanderer** on entity-local stages can move `input.target`; may fight “follow `car`” unless disabled or retuned.
2. **Follow target** — custom **Target** (`car_tf3`): `api.getWorldPosition(params.id)` → `input.target.pose.position`. Requires **`params.id`** on the pipe binding (see status).
3. **Obstacle avoidance** — custom **Umlenker** (`car_tf5`): raycast fan, maneuver lock, retargets `input.target.pose.position` when blocked. Canonical iteration files: [`tools/renn-mcp/patches/umlenker-v3.js`](../tools/renn-mcp/patches/umlenker-v3.js).
4. **Steering / speed** — custom **direction** (`car_tf4`): `steering_angle`, throttle from heading and distance. Patch file: [`tools/renn-mcp/patches/direction-v3.js`](../tools/renn-mcp/patches/direction-v3.js).
5. **Physics** — **car2** (`car_tf1` / entity-local `car_tf9`): applies forces from actions.
6. **Debug** — TargetVisualizer / `Umlenker2` / `api.watch` — trim or disable when tuning is stable.

**Edit surface:** Prefer **MCP pose-safe patches** on attached Builder (`validate_stage_code` → `apply_world_patch`), then `save_project` / `export_saved_project_to_example_world`. Avoid hand-editing the 700KB+ `world.json` except intentional repo export.

**Verification:** [`feature-agent-logic-verification.md`](./feature-agent-logic-verification.md) — probes + `run_timed_macro` on attach; full GLB world is **attach-only** (headless Node lacks DOM for textures).

**Related tooling:** [`tools/renn-mcp/agent-fix-follower-pipeline.ts`](../tools/renn-mcp/agent-fix-follower-pipeline.ts) (follower pipe binding + registry Umlenker/direction); env overrides `RENN_FOLLOW_TARGET_ID`, `RENN_FOLLOWER_PIPE_ID`.

---

## Current status

**Last updated:** 2026-09-22 (document created; baseline from hunt_repair2 export + prior MCP repair arc)

| Area | State | Notes |
|------|--------|--------|
| **Pipe3 binding** | Fixed on disk | `params.id: "car"` on Player Car copy — avoids `getWorldPosition(undefined)` |
| **Shared Target (`car_tf3`)** | Guard only | `if (!params.id) return {}` — other entities using `car_tf3` without binding id stay no-op |
| **Shared Umlenker / direction** | v3 patch files in repo | Not necessarily applied in live IndexedDB until MCP patch + save/export |
| **Wanderer on copy** | Enabled | May randomize target inside 370×370 perimeter — candidate to **disable** for pure follow-`car` behavior |
| **Known code smell** | Open | Several customs use `steer_right' \|\| api.getAction(...)` (missing `)` ) — manual input bypass may be broken |
| **Browser acceptance** | Pending human | Example Worlds → **hunt_repair2** → Play; watch console for Pipe3 / target errors |
| **Live MCP macro** | Blocked until MCP restart | `run_timed_macro` in repo; stale Cursor MCP process may hide tool |
| **Repo git** | Uncommitted / policy open | Large GLBs — see [`example-worlds.md`](./example-worlds.md) |

### Session log

| Date | Agent / human | Change | Result |
|------|----------------|--------|--------|
| 2026-09-21 | Prior arc | Pipe3 `id: car`; guards on shared `car_tf3/4/5` | On-disk `hunt_repair2/world.json` updated |
| 2026-09-22 | — | Created this tracker + `/improve-car` skill | No logic changes |

---

## Backlog (priority)

1. **Confirm runtime clean** — reload hunt_repair2; no `getWorldPosition(undefined)` on Play.
2. **Reconcile pipeline intent** — disable or repurpose wanderer / targetPoseInput on copy if goal is strictly follow `car`.
3. **Apply v3 Umlenker + direction** via MCP; tune with `api.watch` (urgency, distance, steering) and visible attach runs.
4. **Fix getAction guard typos** in Umlenker/direction (parentheses) so human override works.
5. **Propagate `params.id: "car"`** to all Pipe3 stages that read `params.id` (not only binding-level merge).
6. **Macro regression** — after MCP restart: attach → load hunt_repair2 → `run_timed_macro` with probes on copy entity (pose, speed, trace).
7. **Export to repo** when satisfied — `export_saved_project_to_example_world`; align with user on binary commit policy.

---

## Quick commands (parameterized)

```bash
# Visible Builder + example world (see work-on-project skill)
npm run agent:work-on-project -- --example-world hunt_repair2

# Optional: follower registry + pipe binding patch (requires attach)
npx tsx tools/renn-mcp/agent-fix-follower-pipeline.ts
```

MCP (after attach): `get_entity_authoring_summary` `{ "entityId": "entity_1779823253285_brtkx1p", "includeCode": true }`.

---

## Doc maintenance rule

When `/improve-car` completes work:

1. Update **Current status** table and append **Session log** row.
2. Adjust **Backlog** (done items removed or checked).
3. Set **Last updated** date.
4. Do not duplicate long transformer source here — link patch files or MCP export paths instead.
