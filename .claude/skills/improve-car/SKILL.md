---
name: improve-car
description: >-
  Iterates on self-driving car transformer logic for a scoped entity in hunt_repair2
  (default Player Car copy). Maintains agent-context/improve-car-player-copy.md status.
  Use when the user invokes /improve-car, asks to improve the self-driving car, Player Car copy,
  entity_1779823253285_brtkx1p, or Pipe3 follow/avoidance behavior.
disable-model-invocation: true
---

# Improve car (Player Car copy)

Program–run–fix loop for **Player Car copy** autonomous driving using the **current agent workflow** (visible Builder + logic-verification MCP). The **single source of truth for scope, status, and backlog** is:

[`agent-context/improve-car-player-copy.md`](../../../agent-context/improve-car-player-copy.md)

Read that file **first** every session. **Update it before you finish** (status table, session log, backlog, last-updated date).

## Default scope (override only if user says so)

| Key | Default |
|-----|---------|
| Entity id | `entity_1779823253285_brtkx1p` |
| Entity name | Player Car copy |
| Example world id | `hunt_repair2` |
| Follow target entity id | `car` |
| Pipe | `pipe3` |

## Session workflow

### 1. Orient

1. Read [`improve-car-player-copy.md`](../../../agent-context/improve-car-player-copy.md) — approach + **Current status** + backlog.
2. Skim [`feature-agent-logic-verification.md`](../../../agent-context/feature-agent-logic-verification.md) (apply + observation) and [`feature-transformers.md`](../../../agent-context/feature-transformers.md) if changing customs.
3. Follow [`.cursor/rules/agent-mcp-no-project-names.mdc`](../../../.cursor/rules/agent-mcp-no-project-names.mdc) (also in [CLAUDE.md](../../../CLAUDE.md)): entity/world ids only in tool args and docs, not new literals in `src/`.

### 2. Open Builder (human-visible)

Use [work-on-project](../work-on-project/SKILL.md):

```bash
npm run agent:work-on-project -- --example-world "<exampleWorldId>"
```

Tell the user to keep that terminal on **Ctrl+C** (not Cursor Stop). Close extra Builder tabs on `:5173` before attach so MCP adopts the agent Chrome window.

### 3. MCP attach + inspect

1. Restart **renn-logic-verification** MCP if tools like `run_timed_macro` or `export_saved_project_to_example_world` are missing after a pull.
2. `attach_browser` `{ "waitForBrowserMs": 45000 }`.
3. If needed: `load_example_world` `{ "exampleWorldId": "<id>" }` — confirm snapshot entity count matches hunt_repair2 (~660), not a small default scene.
4. `get_entity_authoring_summary` `{ "entityId": "<entityId>", "includeCode": true }` — pipe stack, stage order, bindings.

### 4. Diagnose → patch → verify

| Step | Tool / action |
|------|----------------|
| Hypothesis | User report, console, `get_observation` runtime errors, `api.watch` labels |
| Compile check | `validate_stage_code` on changed custom source |
| Apply | `apply_world_patch` — registry stage ids (`car_tf3`, `car_tf5`, `car_tf4`, …) and/or `transformerPipes` / `entityPipeStack` binding params |
| Sim | `register_probes` → `run_timed_macro` or `start_verification_run` → `run_for_sim_time` → `get_observation` |
| Persist | `save_project`; when repo should match, `export_saved_project_to_example_world` |

**Prefer patch files for large customs** (copy into patch, validate, apply):

- [`tools/renn-mcp/patches/umlenker-v3.js`](../../../tools/renn-mcp/patches/umlenker-v3.js)
- [`tools/renn-mcp/patches/direction-v3.js`](../../../tools/renn-mcp/patches/direction-v3.js)

**Bulk follower binding + registry sync:** [`tools/renn-mcp/agent-fix-follower-pipeline.ts`](../../../tools/renn-mcp/agent-fix-follower-pipeline.ts) (env: `RENN_FOLLOW_TARGET_ID`, `RENN_FOLLOWER_PIPE_ID`).

For behavior regressions, read [diagnosing-bugs](../../../.agents/skills/diagnosing-bugs/SKILL.md) before large rewrites; for new probe/macro behavior, [tdd](../../../.agents/skills/tdd/SKILL.md).

### 5. Human checkpoint

After visible changes: pause for user to **Play** and watch the copy follow `car`, avoid obstacles, and confirm console is clean. Human WASD should override when input stages honor `getAction`.

### 6. Maintain the living doc (required)

Edit [`agent-context/improve-car-player-copy.md`](../../../agent-context/improve-car-player-copy.md):

- **Current status** — what changed, what is verified vs pending.
- **Session log** — one row per session (date, summary, result).
- **Backlog** — reorder or remove completed items.
- **Last updated** — today’s date.

Do **not** paste full transformer code into that doc; reference stage ids, patch paths, or export commits.

## Do not

- Commit `world.json` / GLBs unless the user explicitly asks (binary policy is open).
- Hand-edit megabyte `world.json` for routine logic tweaks — use MCP on attached doc.
- Rely on headless `load_example_world` for full hunt_repair2 (textured GLBs need browser DOM).

## Related docs

- [`example-worlds.md`](../../../agent-context/example-worlds.md) — hunt_repair2 layout, export paths
- [`feature-agent-authoring-setup.md`](../../../agent-context/feature-agent-authoring-setup.md) — MCP dev token, attach
- [`transformer-paradigm-input-and-car2.md`](../../../agent-context/transformer-paradigm-input-and-car2.md) — car2 tuning
