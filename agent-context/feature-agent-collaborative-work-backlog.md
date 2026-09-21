# Collaborative Builder work — friction backlog & improvement plan

Notes from real `/work-on-project` + MCP attach sessions (Sep 2026). Use this when prioritizing agent authoring UX, not as a user-facing guide.

Related: [feature-agent-authoring-setup.md](./feature-agent-authoring-setup.md), [.cursor/skills/work-on-project/SKILL.md](../.cursor/skills/work-on-project/SKILL.md), [ADR 0003](../docs/adr/0003-agent-afk-orchestration-runtime.md).

---

## What went wrong (session log)

| # | Symptom | Likely cause |
|---|---------|----------------|
| 1 | `agent:work-on-project` exit 1: `userDataDir option is not supported in browserType.launch` | Playwright API change; launcher still used `chromium.launch({ userDataDir })`. |
| 2 | Background task “Launch Builder” failed while a later manual retry worked | Stale run before fix; Cursor **Stop** on a shell task kills the Playwright parent → Chrome can look “stuck” or vanish without `browser.close()`. |
| 3 | Agent could not find `hunt_repair` in File → Open | **Separate Chrome profile** (`.renn-agent-browser-profile/`) vs user’s daily Chrome; projects live in IndexedDB for that profile **and** origin only. |
| 4 | User had project on “another port” (5174); agent used 5173 | Vite moved when 5173 busy; **IndexedDB is per origin** (`localhost:5174` ≠ `localhost:5173`). Old 5174 dev died → saves on 5174 unreachable until dev restarts on 5174 or user re-imports. |
| 5 | Second Vite log: `logic verification browser bridge failed … EADDRINUSE 127.0.0.1:9234` | Bridge port is **singleton**; only one dev instance owns attach. Tabs on other ports load Builder but **MCP attach may not work** on those origins. |
| 6 | `attach_browser` OK but agent could not inspect entity transformer pipeline | No MCP/browser RPC to **read** current world or entity pipe stack; observation tools give sim state, not authoring config. Agent fell back to grepping Chrome IndexedDB blob files (fragile, dev-only hack). |
| 7 | Skill/docs say `load_saved_project` | Tool exists on MCP **server** (`logicVerificationMcpServer.ts`) but was **not invokable** from Cursor’s `project-0-renn-renn-logic-verification` tool list in-session — coordinator could not reload by name without `agent:cli` or UI. |
| 8 | `resolveReachableBuilderDevUrl` probes `127.0.0.1` and `localhost` | On some macOS setups Vite listens on **localhost (IPv6)** only; probes against `127.0.0.1` report failure even when Builder is up (misleading for agents). |
| 9 | User: “project already open and visible — just work with this one” | Attach adopts **live scene** for sim/patch, but **inspect pipeline** still needs a read API or export; “visible” ≠ “machine-readable” to the agent. |
| 10 | `/orchestrate` + `/work-on-project` | L1 spawned shell launcher without verifying Playwright fix; long-running browser + Cursor Stop interacts badly with “keep terminal running” skill text. |

---

## Design gaps (underlying)

1. **Three storage surfaces** — user Chrome (5173), agent profile Chrome (5173), smoke (5199), optional stray ports (5174…). Easy to lose track of which `hunt_*` save is authoritative.
2. **Attach bridge vs dev port** — one global WS port (9234) decoupled from Vite’s HTTP port; failure mode is silent on secondary dev servers.
3. **Asymmetric MCP** — strong **write** path (`apply_world_patch`, material color, save); weak **read** path for structure (entities, `transformerPipeStack`, registry defs, custom `code`).
4. **Cursor MCP surface** — not guaranteed 1:1 with `agent:cli list`; docs assume tools that the IDE namespace may omit.
5. **Launcher lifecycle** — Playwright persistent context + profile lock; no CDP reuse of an already-open user tab; duplicate Chrome windows confuse humans and agents.

---

## Improvement plan (prioritized)

### P0 — Unblock collaborative sessions (small, high leverage)

| Item | Action | Owner slice |
|------|--------|-------------|
| P0.1 | **Done:** `launchPersistentContext` + don’t abort when Open list misses project (warn, keep browser). | `tools/renn-mcp/agent-work-on-project.ts` |
| P0.2 | Document **Cursor Stop vs Ctrl+C** in work-on-project skill + authoring setup (Stop kills child Chrome; use Activity Monitor / `pkill -f renn-agent-browser-profile` only for agent profile). | skill + `feature-agent-authoring-setup.md` |
| P0.3 | **Single dev attach policy:** document “run one `npm run dev` for MCP attach; if port ≠ 5173, set `RENN_AGENT_DEV_URL=http://localhost:<port>/renn/` **before** launcher and attach”. | skill + authoring setup |
| P0.4 | Verify Cursor MCP exposes **`load_saved_project`**, **`save_project`**, **`get_saved_*`** or document **`npm run agent:cli call load_saved_project '{"projectName":"…"}'`** after `attach_browser` in same machine session. | `.cursor/mcp.json` / MCP registration audit |

### P1 — Read path for “inspect entity pipeline” (core user ask)

| Item | Action | Notes |
|------|--------|-------|
| P1.1 | Add MCP + browser RPC **`get_entity_authoring_summary`** `{ entityId }` → `{ name, transformerPipeStack, transformers: id[] resolved to { id, type, name, enabled, priority } }` (omit huge `code` by default; `includeCode?: boolean`). | Reuse live doc / adopted host world in attach; headless uses loaded host. |
| P1.2 | Add **`get_world_authoring_snapshot`** `{ maxBytes?, entityIds? }` for bounded JSON (or **`export_open_project_json`** dev-only to stdout/temp file). | Enables agents to review pipes without IndexedDB archaeology. |
| P1.3 | Integration test: attach fixture → load bundle in browser → call summary for known entity. | `logic-verification-browser-attach.integration.test.ts` pattern |

### P2 — Port, bridge, and URL robustness

| Item | Action |
|------|--------|
| P2.1 | Prefer **`localhost`** first in `builderDevUrlCandidates()`; treat `127.0.0.1` as fallback. |
| P2.2 | When bridge fails to bind, log **actionable** line: “MCP attach unavailable on this Vite instance; stop other dev servers or set `VITE_RENN_MCP_BROWSER_PORT` consistently.” |
| P2.3 | (Larger) **Per-origin bridge** or route browser WS through Vite HTTP origin so attach always matches the tab’s dev server. |

### P3 — Launcher UX (optional)

| Item | Action |
|------|--------|
| P3.1 | **`--no-open-project`** flag: only open Builder URL; never fail on missing name. |
| P3.2 | **`--dev-url`** CLI flag mirroring `RENN_AGENT_DEV_URL`. |
| P3.3 | Optional **`--connect-user-chrome`**: attach via CDP to user’s already-open tab (advanced; profile policy TBD). |

### P4 — Orchestrate alignment

| Item | Action |
|------|--------|
| P4.1 | L1 checklist: run `agent:work-on-project` only after `git diff` shows `launchPersistentContext`; verify launcher JSON `{ ok, devUrl, projectOpened }` before MCP attach. |
| P4.2 | For “inspect only” tasks, prefer **P1 read tools** over spawning Playwright if user confirms project is already open. |

---

## Suggested implementation order

1. P0.2–P0.4 (docs + MCP tool visibility) — same day.  
2. P1.1 (entity summary) — unblocks transformer/pipeline reviews without export.  
3. P2.1–P2.2 — reduces port confusion.  
4. P1.2, P2.3, P3 — as needed for AFK and power users.

---

## Success criteria

- Agent can answer “what’s on entity X’s pipe stack?” in **one MCP call** after attach, with project already open.  
- No Playwright launch required when user has Builder open on the **same** origin as the working bridge.  
- Skill + docs explain profile/port/Stop in ≤1 screen; no LevelDB grepping in normal workflows.

---

## Implementation status

| Item | Status |
|------|--------|
| P0.1 Playwright persistent context + soft miss on Open | Done (Sep 2026) |
| P0.2–P0.3 Docs (Stop vs Ctrl+C, dev URL) | Done (Sep 2026) |
| P1.1 `get_entity_authoring_summary` | Done (Sep 2026) |
| P1.2 `get_world_authoring_snapshot` | Done (Sep 2026) |
| P2.1 localhost-first dev URL probe | Done (Sep 2026) |
| P2.2 Bridge EADDRINUSE actionable log | Done (Sep 2026) |
| P3.1 `--no-open-project` | Done (Sep 2026) |
| P3.2 `--dev-url` | Done (Sep 2026) |
| P0.4 Cursor MCP full tool surface | Partial — use `npm run agent:cli list`; restart MCP after pull |
| Live MCP `apply_world_patch` sync | Done — ProjectContext + `syncWorldEntities` + re-adopt; pipe/stack patches (`transformerPipes`, `entityPipeStack`) Sep 2026 |
| P2.3 Per-origin bridge | Not started |
| P3.3 CDP attach to user Chrome | Not started |
