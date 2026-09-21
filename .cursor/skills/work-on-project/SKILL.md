---
name: work-on-project
description: >-
  Opens visible Builder on dev (5173) with a persistent agent Chrome profile, loads an IndexedDB
  project by name, then collaborates via MCP attach. Use when the user invokes /work-on-project,
  names a Renn project to edit interactively, or wants step-by-step agent + human work in Builder.
disable-model-invocation: true
---

# Work on project (visible Builder + MCP)

**Parameter:** `projectName` — the IndexedDB project display name (from File → Open). Pass it from the user message; do not hardcode product names in code.

## 1. Open Builder for the user

Run (repo root):

```bash
npm run agent:work-on-project -- "<projectName>"
```

Or: `RENN_AGENT_PROJECT_NAME="<projectName>" npm run agent:work-on-project`

- Uses **default dev** (`http://localhost:5173/renn/`), not authoring-smoke port 5199.
- Uses **persistent** Chrome profile `.renn-agent-browser-profile/` (IndexedDB survives across runs; not the user’s everyday Chrome — see `agent-context/feature-agent-authoring-setup.md` § *Browser and IndexedDB isolation*).
- Leaves **visible Chrome** open until the user **Ctrl+C** in that terminal.
- If `npm run dev` is not running, the script starts it.
- If Vite uses another port, set `RENN_AGENT_DEV_URL=http://localhost:<port>/renn/` before the command (IndexedDB is per origin). Only one dev instance should own the logic-verification bridge (default **9234**).
- **Do not use Cursor Stop** on the launcher terminal if you want to keep Chrome open — Stop kills the process without a clean shutdown; prefer **Ctrl+C** in that terminal. Stuck agent Chrome: `pkill -f renn-agent-browser-profile` (not your daily Chrome profile).

Tell the user: *“Builder is open with your project; keep that terminal running while we work.”*

Friction backlog: `agent-context/feature-agent-collaborative-work-backlog.md`.

## 2. Connect MCP

Prerequisites (once per machine): `.cursor/mcp.json`, **renn-logic-verification** enabled, `RENN_MCP_DEV_TOKEN` matches Vite.

1. `attach_browser` with `{ "waitForBrowserMs": 45000 }` (or longer on slow loads).
2. If the tab was opened by the launcher, the bridge should adopt the live scene after load.

If attach fails: confirm the **same** Chrome window from step 1 is still open and dev is on **5173**.

## 3. How to work (task or step-by-step)

**Default:** collaborate with the user — confirm intent before destructive edits, describe what each MCP step will do, pause after visual changes so they can inspect the canvas.

| Intent | MCP tools (generic args only) |
|--------|-------------------------------|
| Inspect entity pipeline | `get_entity_authoring_summary` `{ "entityId", "includeCode"?: true }` (live doc after attach) |
| Reload project | `load_saved_project` `{ "projectName": "<from user>" }` (or `npm run agent:cli call …` if Cursor MCP omits attach-only tools — restart MCP after pull) |
| Load example | `load_example_world` `{ "exampleWorldId": "<id>" }` |
| Duplicate / rename save | `save_project_as` `{ "projectName": "<name>" }` |
| Persist | `save_project` |
| Tint / material | `patch_entity_material_color` `{ "entityId", "color" }` |
| Logic / sim check | `register_probes` → `start_verification_run` → `step` / `run_for_sim_time` → `get_observation` |
| Transformer code | `validate_stage_code` → `apply_world_patch` |

Follow `.cursor/rules/agent-mcp-no-project-names.mdc`: tool arguments come from the user or session context, never from literals in source.

## 4. When finished

- `save_project` if there are unsaved doc changes.
- User **Ctrl+C** the work-on-project terminal (stops dev only if this script started it).
- Optional: `stop_run` if you attached and want to release the MCP host.

## 5. Do not

- Do not use `agent:authoring-smoke` (5199 + ephemeral profile) for this workflow unless the user explicitly asks for an isolated smoke run.
- Do not add npm scripts or tests named after a specific user project.
- Do not drive the whole flow via Playwright in the agent — use MCP after the launcher opens the browser.
