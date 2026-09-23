# Improve car — Player Car copy (`entity_1779823253285_brtkx1p`)

Living tracker for self-driving behavior on **Player Car copy** in the **hunt_repair2** example world. Agents use skill [`.cursor/skills/improve-car/SKILL.md`](../.cursor/skills/improve-car/SKILL.md) (`/improve-car`) and **update this file** after each working session.

---

## Scope

| Field | Value |
|--------|--------|
| **Entity id** | `entity_1779823253285_brtkx1p` |
| **Display name** | Player Car copy |
| **Example world** | `hunt_repair2` — [`public/exampleWorlds/hunt_repair2/`](../public/exampleWorlds/hunt_repair2/); box diagnostic: **`self_drive_cube`** — [`public/exampleWorlds/self_drive_cube/`](../public/exampleWorlds/self_drive_cube/) |
| **Goal source** | **Wanderer** only at start of **Pipe3** (`targetPoseInput` removed — duplicate target publisher) |
| **Primary pipe** | `pipe3` (shared registry stages `car_tf*`, entity-local stages `entity_1779823253285_brtkx1p_tf*`) |

**Success (working definition):** Copy drives autonomously toward **wanderer goals** (not follow-`car`), avoids static/dynamic obstacles with stable steering/throttle, no console/runtime errors, human takeover (WASD) still wins when pressed.

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

**Last updated:** 2026-09-23 (Pipe3 headless self-driving tests + uml/direction cooperation)

| Area | State | Notes |
|------|--------|--------|
| **Pipe3 binding** | OK | **No `params.id`** — wanderer owns `input.target`; sync script does not seed follow binding |
| **Umlenker / direction** | Updated | [`umlenker-v3.js`](../tools/renn-mcp/patches/umlenker-v3.js): maneuver sets `_uml_maneuver`; never snaps target to follow entity; [`direction-v3.js`](../tools/renn-mcp/patches/direction-v3.js): per-entity back-off state; defers back-off when Umlenker detouring (`_uml_maneuver` + mid-range front hit); **brake** reverse for car2 |
| **AutoBrake (`car_tf1_copy`)** | Patched | Skips when `params.id` (follow mode) or `_obstacle_escape` — was braking after direction every frame at obstacles |
| **Pipe3 link** | Only **Player Car copy** | Editing Pipe3 layout affects that entity’s flatten; shared registry ids (`car_tf5`, …) still affect every entity listing those ids |
| **Wanderer** | Restored in Pipe3 | `targetPoseInput` (`tf0`) omitted; wanderer sets yellow goal; Umlenker red line tracks maneuver waypoint when avoiding |
| **MCP** | `get_pipe_authoring_summary` `{ pipeId }` | Linked entities + per-stage usage counts (who shares registry stages) |
| **Repo `hunt_repair2/world.json`** | Synced | `node tools/renn-mcp/sync-hunt-car-patches.mjs`; MCP `apply-hunt-car-patches.ts` + save to agent IndexedDB |
| **Integration tests** | Added | Full Pipe3 headless: [`self-driving-car.integration.test.ts`](../src/test/scenarios/self-driving-car.integration.test.ts) + red-check file; [`direction-backoff.integration.test.ts`](../src/test/scenarios/direction-backoff.integration.test.ts); Umlenker [`umlenker-raycast.integration.test.ts`](../src/test/scenarios/umlenker-raycast.integration.test.ts) |
| **Recordings** | Added | [`record-self-driving-car.ts`](../tools/renn-mcp/record-self-driving-car.ts) → `agent-context/recordings/self-driving-car-latest.json`; direction back-off recording unchanged |
| **Browser acceptance** | Pending human | Reload **hunt_repair2** in agent Chrome → Play; copy should steer around obstacles, reverse when boxed in |
| **MCP authoring snapshot** | Stale-host caveat | After attach, `get_world_authoring_snapshot` may show fixture entity count until readopt; patches still apply to live Builder doc |
| **Repo git** | Uncommitted / policy open | Large GLBs — see [`example-worlds.md`](./example-worlds.md) |

### Session log

| Date | Agent / human | Change | Result |
|------|----------------|--------|--------|
| 2026-09-21 | Prior arc | Pipe3 `id: car`; guards on shared `car_tf3/4/5` | On-disk `hunt_repair2/world.json` updated |
| 2026-09-22 | — | Created this tracker + `/improve-car` skill | No logic changes |
| 2026-09-22 | Agent | Obstacle-stop fix: Umlenker/direction v3, AutoBrake guard, wanderer off; sync world + MCP save | Pending human Play on hunt_repair2 |
| 2026-09-22 | Agent | Fix MCP ungrouped stages + `pose` crash: realign Pipe3/entity list, add `car_tf3` Target | Reload hunt_repair2 in agent Chrome |
| 2026-09-23 | Agent | Reverse fix (brake not throttle), Pipe3 sync (wanderer-only, `params.id: car`), Umlenker follow contract, backoff integration test | Vitest green; human Play pending |
| 2026-09-23 | Agent | Removed follow snap + `params.id: car` from Pipe3 binding; Umlenker integration test for no-snap | Red line should diverge from yellow when detouring |
| 2026-09-23 | Agent | Wanderer + Umlenker + direction + AutoBrake fixture; `_uml_maneuver` cooperation; per-entity back-off state; cue-driven tests + recordings | Vitest 255 files / 2088 passed; tsc clean |
| 2026-09-23 | L2 orchestrate | `self_drive_cube` go-around: v3x flank filters, spawn z=3, spawn-matrix + path diagnostic; export + patch sync | Vitest 256 files / 2098 pass; cube pass @175f |

---

## Improvement log (headless runs)

Batch results and spawn/shape matrix: [`self-driving-car-improvement-log.md`](./self-driving-car-improvement-log.md).

## Backlog (priority)

1. **Human Play check** — reload hunt_repair2 in agent Chrome; copy pursues wanderer goals, clears obstacles without permanent stop.
2. **Macro regression** — attach → load hunt_repair2 → `run_timed_macro` with probes on copy (pose, speed).
3. **Tune** — urgency/spread/backOff timing if still hesitates at tight gaps.
4. **Export to repo** when satisfied — `export_saved_project_to_example_world` (world.json already synced via `sync-hunt-car-patches.mjs`).
5. **Fix attach readopt** — optional: `get_entity_authoring_summary` should prefer `getCurrentWorld()` when document epoch > host adopt (friction).

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
