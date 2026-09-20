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
| Save | Headless: write `world.json` to bundle path (`export_project_bundle`); Browser attach: **`save_project` / `save_project_as`** → IndexedDB |
| Reasoning input | **Platform probes** + **author telemetry** on observation timeline—not pixels |
| Example worlds | **`load_example_world`** with `exampleWorldId` (ids discovered under `public/exampleWorlds/`) — no hardcoded product names in agent code |

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

1. `load_project_bundle` { `bundleId`: `agent-starter` } or `load_fixture` / `load_world_json` / `load_example_world`
2. `validate_stage_code` → `apply_world_patch` (transformer `code` / `params`) or `patch_entity_material_color`
3. `register_probes` → `start_verification_run` → `run_for_sim_time` → `get_observation` → `stop_run`

### B″ — Work on a saved project with the user (visible Builder + MCP)

1. Agent or user: `npm run agent:work-on-project -- "<projectName>"` (see `.cursor/skills/work-on-project/SKILL.md`).
2. MCP: `attach_browser` → `load_saved_project` if reload needed → authoring tools → `save_project`.
3. Step-by-step: agent proposes MCP steps; user confirms and watches the same Chrome window.

Uses **5173** + **persistent agent profile** (not authoring-smoke 5199).

### B — In-game reasoning (human sees canvas)

1. Human opens Builder (`npm run dev`), imports the same project zip or edits live.
2. Agent: `attach_browser` → **patch, probe, run, observe** on the **live** host (human must load the project in Builder first unless using authoring tools below; `load_project_bundle` / `load_fixture` / `load_world_json` are headless-only).
3. Exclusive stepping pauses rAF while MCP advances sim time.

### B′ — Automated in-game attach (dev-only, no human import)

1. `npm run agent:dev-attach` — starts or reuses Vite, opens Builder with `?rennAgentBundle=agent-starter` (or `--bundle` / `--fixture` / `--example-world <id>`), waits for the logic-verification WebSocket bridge + scene adopt, runs the same minimal verify loop as headless, prints `{ ok: true }`, tears down Playwright and Vite if this command started the dev server.
2. **Env:** `RENN_MCP_DEV_TOKEN` (same as MCP / optional `VITE_RENN_MCP_DEV_TOKEN`); Playwright **Chrome** channel (see `playwright.config.ts`). Optional `RENN_AGENT_DEV_URL` (default `http://127.0.0.1:5173/renn/`).
3. Allowlisted bundle ids match `loadAgentProjectBundle`; fixtures match MCP `load_fixture`; example worlds match **File → Example Worlds** (ids under `public/exampleWorlds/`). Dev middleware serves `GET /__renn-agent/dev/project-bundle/:id`, `/__renn-agent/dev/fixture/:id`, and `/__renn-agent/dev/example-world/:id` (optional bootstrap via `?rennAgentExampleWorld=<id>`). Vite `serve` only — not in production builds.
4. **CI cost:** full attach launches Chrome + dev server; keep default `vitest run` fast — use `npm run agent:dev-attach` locally or an env-gated job, not every unit test run.

### C — Create entities (headless)

`apply_world_patch` accepts `entities.add` / `entities.update` / `entities.remove`. Entity add/remove and physics-affecting updates require `allowSceneRebuild: true` (existing poses preserved where entities survive). Save with `export_project_bundle` after `load_project_bundle`.

### D — Five-step authoring scenario (MCP + attach, illustration only)

Illustration: duplicate an example world, tint the ground green, save, verify IndexedDB. **Use parameterized tool args** — names below are doc-only examples.

Prerequisites: `npm run dev`, Builder open, `RENN_MCP_DEV_TOKEN` set, **renn-logic-verification** MCP enabled.

| Step | MCP tool | Example arguments (illustration) |
|------|----------|----------------------------------|
| 1 | `attach_browser` | `{ "waitForBrowserMs": 45000 }` |
| 2 | `load_example_world` | `{ "exampleWorldId": "hunt" }` — loads File → Example Worlds entry into live Builder |
| 3 | `save_project_as` | `{ "projectName": "hunt2" }` — new IndexedDB project name |
| 4 | `patch_entity_material_color` | `{ "entityId": "ground", "color": "#00ff00" }` — also syncs verification host; equivalent low-level: `apply_world_patch` with `entities.update.ground.material.color` |
| 5 | `save_project` then `get_saved_entity_material_color` | `{ "projectName": "hunt2", "entityId": "ground" }` — confirm saved RGB ≈ green |

Optional: `register_probes` → `start_verification_run` → `step` → `get_observation` between steps 4–5 to reason about sim state (not required for save verification).

Rule: do not add npm scripts or tests named after this illustration — keep flows in MCP tool calls only (see `.cursor/rules/agent-mcp-no-project-names.mdc`).

---

## MCP authoring tools (Builder attach)

| Tool | Mode | Purpose |
|------|------|---------|
| `load_example_world` | Headless + attach | Load `public/exampleWorlds/<exampleWorldId>/world.json` |
| `load_saved_project` | Attach only | Open IndexedDB project by **display name** (File → Open list) |
| `save_project_as` | Attach only | IndexedDB duplicate / Save As |
| `save_project` | Attach only | IndexedDB save current doc |
| `patch_entity_material_color` | Both | `{ entityId, color }` hex or 0–1 RGB(A); attach updates live doc + host |
| `get_saved_entity_material_color` | Attach only | Read back from IndexedDB by `projectName` |

Headless **`export_project_bundle`** remains the on-disk save path for allowlisted agent bundles.

---

## Smoke commands

| Command | Purpose |
|---------|---------|
| `npm run agent:setup-check` | Verify token env + bundle loader + one headless host step |
| `npm run agent:cli -- list` | Tool names (in-process; no Cursor MCP panel) |
| `npm run agent:cli -- call load_project_bundle '{"bundleId":"agent-starter","warmupSteps":2}'` | Single MCP-equivalent call; JSON to stdout |
| `npm run agent:recipe-headless` | Full headless loop on `agent-starter` (load → probe → run → observe → stop) |
| `npm run agent:mcp-attach-smoke` | `attach_browser` against running dev server (manual prerequisite) |
| `npm run agent:dev-attach` | Full dev attach loop (auto Vite + bundle bootstrap + verify); `--bundle` / `--fixture` / `--example-world` |
| `npm run agent:authoring-smoke` | Env-gated MCP attach smoke: `load_example_world` → `save_project_as` → `patch_entity_material_color` → `save_project` → `get_saved_entity_material_color` (isolated dev port **5199** / bridge **9235**; Chrome). Default: headless, tears down browser + Vite when done. |
| `npm run agent:authoring-smoke-headed` | Same flow with `RENN_AGENT_SMOKE_HEADED=1` — **visible** Chrome, leaves browser open and keeps Vite on **5199** until **Ctrl+C** in the smoke terminal. |
| `npm run agent:work-on-project -- "<name>"` | **Collaborative workflow:** visible Chrome on **5173**, persistent profile `.renn-agent-browser-profile/`, opens project by name; then use MCP `attach_browser`. Skill: `.cursor/skills/work-on-project/SKILL.md`. |

**Illustration (five-step hunt copy — env only, not hardcoded in repo):**

```bash
RENN_AGENT_SMOKE_EXAMPLE_WORLD_ID=hunt \
RENN_AGENT_SMOKE_PROJECT_NAME=hunt2 \
RENN_AGENT_SMOKE_ENTITY_ID=ground \
RENN_AGENT_SMOKE_COLOR='#00ff00' \
npm run agent:authoring-smoke
```

**Headed MCP browser (find saved project in UI):**

```bash
RENN_AGENT_SMOKE_EXAMPLE_WORLD_ID=hunt \
RENN_AGENT_SMOKE_PROJECT_NAME=hunt2 \
npm run agent:authoring-smoke-headed
```

Or add `--headed` / `RENN_AGENT_SMOKE_HEADED=1` to the headless command. After JSON `{ "ok": true }`, use the **same Chrome window** Playwright opened (already on the **5199** origin): **File → Open** → pick `RENN_AGENT_SMOKE_PROJECT_NAME`. Leave the smoke process running until you are done; **Ctrl+C** stops port **5199** and closes that browser.

### Browser and IndexedDB isolation (why MCP Chrome feels “encapsulated”)

Authoring smoke and dev-attach scripts use **Playwright** to launch Chrome (`channel: 'chrome'` in `tools/renn-mcp/agent-authoring-smoke.ts`). That is **real Chrome**, but **not your everyday browser profile**:

| Isolation | What it means |
|-----------|----------------|
| **Playwright profile** | Each launch uses a **temporary automation user-data directory** (no `userDataDir` → your daily Chrome). Extensions, logins, and IndexedDB from your normal Chrome **do not** appear here, and smoke saves **do not** appear in your normal Chrome. |
| **Origin (port)** | IndexedDB is keyed by origin. Authoring-smoke uses **`http://localhost:5199/renn/`**; default dev is **`http://localhost:5173/renn/`**. Same machine, **different storage** — a project saved on 5199 is invisible on 5173 until you export/import or save again on 5173. |
| **Cursor `attach_browser`** | Attaches to a **Builder tab you already opened** (usually 5173 in **your** browser). MCP `save_project*` writes to **that** tab’s origin and profile. |

**Three ways to work with saved projects:**

| You want… | Do this |
|-----------|---------|
| Inspect smoke output (e.g. green floor after `agent:authoring-smoke-headed`) | Use the **Chrome window Playwright opened** on **5199**; **File → Open** → your `RENN_AGENT_SMOKE_PROJECT_NAME`. Keep the smoke terminal running until done; **Ctrl+C** stops Vite and that session. |
| Projects in your normal dev workflow | Run **`npm run dev`**, open Builder in **your** Chrome on **5173**, MCP **`attach_browser`**, then `load_example_world` / `save_project_as` / etc. — or **File → Export** from the 5199 window and **File → Import** on 5173. |
| Files in the repo | Headless **`export_project_bundle`** to allowlisted `src/agent/projects/<bundleId>/`. |

Do **not** expect `open -a "Google Chrome" 'http://localhost:5199/renn/'` to show smoke saves: that opens **your** profile, while saves live in **Playwright’s** profile for that run. Prefer **`agent:authoring-smoke-headed`** (or the headed window from the same command).

**Disk:** MCP attach **`save_project`** / **`save_project_as`** never write repo files by themselves — only IndexedDB for that origin + profile. Use **File → Export** in Builder for a zip on disk.

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
| MCP `load_example_world` + IndexedDB save/color tools (attach) | Done |
| `npm run agent:dev-attach` (auto Vite + bundle bootstrap + attach verify) | Done — dev-only; restart `npm run dev` after pull if reusing an old server |
| `npm run agent:authoring-smoke` (MCP attach save/color readback) | Done — not in default `vitest run`; requires env vars above |
