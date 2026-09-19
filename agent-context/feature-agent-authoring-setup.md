# Agent authoring setup — load/save, entities, pipeline, in-game reasoning

End-to-end goal: an agent **loads a project**, **creates or edits entities and pipeline code**, **runs verification**, and **reasons from structured observations**—headless for speed, **browser attach** when the human (or agent) needs the live game view.

Canonical terms: root [CONTEXT.md](../CONTEXT.md). Host/MCP detail: [feature-agent-logic-verification.md](./feature-agent-logic-verification.md). ADR: [docs/adr/0002-agent-project-bundle-on-disk.md](../docs/adr/0002-agent-project-bundle-on-disk.md).

---

## Design decisions (grill defaults — Sep 2026)

| Decision | Choice |
|----------|--------|
| Project source of truth for agents | Repo **agent project bundle** (export-shaped folder or zip), not IndexedDB |
| Fast loop vs in-game | **Headless** MCP host default; **`attach_browser`** for same API on visible Builder |
| Pipeline code first | **Transformer registry** patches (existing `apply_world_patch`); entity add/bindings next slice |
| Save | Headless: write `world.json` to bundle path (planned); Browser: live doc + human Save |
| Reasoning input | **Platform probes** + **author telemetry** on observation timeline—not pixels |

---

## Repo layout (setup slice)

```
src/agent/projects/          # Pinned agent projects (world.json [+ assets/])
src/agent/loadAgentProjectBundle.ts   # Node: load bundle → { world, assets }
tools/renn-mcp/              # stdio MCP + smoke scripts
.cursor/mcp.json.example       # Cursor MCP config template
```

Starter template: `src/agent/projects/agent-starter/` — minimal world with one entity and an empty custom transformer slot for pipeline authoring exercises.

---

## One-time developer setup

1. Copy `.cursor/mcp.json.example` → `.cursor/mcp.json`; set `cwd` to repo root; keep `RENN_MCP_DEV_TOKEN`.
2. Optional `.env.local`: `VITE_RENN_MCP_DEV_TOKEN` (same token), `VITE_RENN_MCP_BROWSER_PORT=9234`.
3. Enable **renn-logic-verification** in Cursor MCP panel.
4. Run `npm run dev` when using **`attach_browser`** (Vite serves the WebSocket bridge).

---

## Agent workflows

### A — Headless program–run–fix (CI / tight loop)

1. `load_project_bundle` { `bundleId`: `agent-starter` } or `load_fixture` / `load_world_json`
2. `validate_stage_code` → `apply_world_patch` (transformer `code` / `params`)
3. `register_probes` → `start_verification_run` → `run_for_sim_time` → `get_observation` → `stop_run`

### B — In-game reasoning (human sees canvas)

1. Human opens Builder (`npm run dev`), imports the same project zip or edits live.
2. Agent: `attach_browser` → **patch, probe, run, observe** on the **live** host (human must load the project in Builder first; `load_project_bundle` / `load_fixture` / `load_world_json` are headless-only).
3. Exclusive stepping pauses rAF while MCP advances sim time.

### C — Create entities (planned)

Extend `apply_world_patch` with `entities` add/update and `allowSceneRebuild` when structural. Until then: edit bundle `world.json` in repo or use Builder UI, re-export, reload bundle.

---

## Smoke commands

| Command | Purpose |
|---------|---------|
| `npm run agent:setup-check` | Verify token env + bundle loader + one headless host step |
| `npm run agent:mcp-attach-smoke` | `attach_browser` against running dev server (manual prerequisite) |

---

## Implementation status

| Item | Status |
|------|--------|
| Logic verification host + MCP (slices 1–6) | Done — see feature-agent-logic-verification |
| On-disk project bundles + loader | Done |
| MCP `load_project_bundle` | Done |
| Entity/scene patches via MCP | Planned |
| MCP `export_project_bundle` / save | Planned |
