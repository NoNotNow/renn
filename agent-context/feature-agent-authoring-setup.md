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

### B′ — Automated in-game attach (dev-only, no human import)

1. `npm run agent:dev-attach` — starts or reuses Vite, opens Builder with `?rennAgentBundle=agent-starter` (or `--bundle` / `--fixture`), waits for the logic-verification WebSocket bridge + scene adopt, runs the same minimal verify loop as headless, prints `{ ok: true }`, tears down Playwright and Vite if this command started the dev server.
2. **Env:** `RENN_MCP_DEV_TOKEN` (same as MCP / optional `VITE_RENN_MCP_DEV_TOKEN`); Playwright **Chrome** channel (see `playwright.config.ts`). Optional `RENN_AGENT_DEV_URL` (default `http://127.0.0.1:5173/renn/`).
3. Allowlisted bundle ids match `loadAgentProjectBundle`; fixtures match MCP `load_fixture`. Dev middleware serves `GET /__renn-agent/dev/project-bundle/:id` and `/__renn-agent/dev/fixture/:id` (Vite `serve` only — not in production builds).
4. **CI cost:** full attach launches Chrome + dev server; keep default `vitest run` fast — use `npm run agent:dev-attach` locally or an env-gated job, not every unit test run.

### C — Create entities (headless)

`apply_world_patch` accepts `entities.add` / `entities.update` / `entities.remove`. Entity add/remove and physics-affecting updates require `allowSceneRebuild: true` (existing poses preserved where entities survive). Save with `export_project_bundle` after `load_project_bundle`.

---

## Smoke commands

| Command | Purpose |
|---------|---------|
| `npm run agent:setup-check` | Verify token env + bundle loader + one headless host step |
| `npm run agent:cli -- list` | Tool names (in-process; no Cursor MCP panel) |
| `npm run agent:cli -- call load_project_bundle '{"bundleId":"agent-starter","warmupSteps":2}'` | Single MCP-equivalent call; JSON to stdout |
| `npm run agent:recipe-headless` | Full headless loop on `agent-starter` (load → probe → run → observe → stop) |
| `npm run agent:mcp-attach-smoke` | `attach_browser` against running dev server (manual prerequisite) |
| `npm run agent:dev-attach` | Full dev attach loop (auto Vite + bundle bootstrap + verify); `--bundle` / `--fixture` |

### AFK agents (`/orchestrate`)

L3 workers should use **`agent:cli` / `agent:recipe-headless`** in shell after edits—not assume Cursor MCP is available in Task subagents. L1 may still use the **renn-logic-verification** MCP namespace when enabled; that session is **singleton** (detach with `stop_run` before headless loads). ADR: [docs/adr/0003-agent-afk-orchestration-runtime.md](../docs/adr/0003-agent-afk-orchestration-runtime.md).

---

## Implementation status

| Item | Status |
|------|--------|
| Logic verification host + MCP (slices 1–6) | Done — see feature-agent-logic-verification |
| On-disk project bundles + loader | Done |
| MCP `load_project_bundle` | Done |
| Entity/scene patches via MCP | Done — `entities` on `apply_world_patch` |
| MCP `export_project_bundle` / save | Done — allowlisted bundle `world.json` |
| `npm run agent:dev-attach` (auto Vite + bundle bootstrap + attach verify) | Done — dev-only; restart `npm run dev` after pull if reusing an old server |
