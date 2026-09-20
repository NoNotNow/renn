# Handoff — MCP authoring smoke (hunt → hunt2 illustration)

**Written:** 2026-09-20

## STATUS

**Done** — repeatable env-gated smoke via MCP attach (aligns with `.cursor/rules/agent-mcp-no-project-names.mdc`).

## Tests

| Check | Before | After |
|-------|--------|-------|
| `npx vitest run` | 243 files, **2060** passed, 3 skipped | 244 files, **2065** passed, 3 skipped |
| `npx tsc --noEmit -p tsconfig.app.json` | clean | clean |
| Hunt illustration smoke | — | `RENN_AGENT_SMOKE_EXAMPLE_WORLD_ID=hunt RENN_AGENT_SMOKE_PROJECT_NAME=hunt2 npm run agent:authoring-smoke` → `{ ok: true }` (~9s local) |

## Changes summary

- **`npm run agent:authoring-smoke`** — Playwright opens Builder; **MCP session** runs attach + `load_example_world` → `save_project_as` → `patch_entity_material_color` → `save_project` → `get_saved_entity_material_color`.
- **`tools/renn-mcp/agentDevServer.ts`** — shared Vite ensure/stop; optional isolated `--strictPort` spawn; dev token + bridge port env for child process.
- **`tools/renn-mcp/agentDevAttachEnv.ts`** — `localhost` dev URL probing when port shifts; `resolveReachableBuilderDevUrl`.
- **Example world bootstrap** — `rennAgentExampleWorld`, middleware `/__renn-agent/dev/example-world/:id`, disk discovery via `listAgentDevExampleWorldIds`.
- **`LogicVerificationMcpSession.attachBrowser`** — EADDRINUSE bridge retry; configurable `rpcTimeoutMs` (smoke uses 120s for large worlds).
- **Docs** — `agent-context/feature-agent-authoring-setup.md` (smoke table + hunt/hunt2 env example in prose only).

## Five-step mapping

| Step | Automation |
|------|------------|
| 1 Open + connect | Isolated Vite **5199** + bridge **9235**; Playwright tab; `attach_browser` |
| 2 Open hunt example | `load_example_world` { `exampleWorldId`: from env } |
| 3 Save as hunt2 | `save_project_as` { `projectName`: from env } |
| 4 Green floor | `patch_entity_material_color` { `entityId`: `ground`, `color`: `#00ff00` } |
| 5 Save + verify | `save_project` + `get_saved_entity_material_color` |

## LEFTOVER

- Optional Playwright **File → Example Worlds** UI path (MCP load is equivalent data path).
- CI job gated on `agent:authoring-smoke` + Chrome (not default vitest).
- First-run save on very large worlds may need `RENN_MCP_BROWSER_RPC_TIMEOUT_MS` > 30s if machine is slow.

## RISK

- Isolated smoke ports (**5199** / **9235**) avoid colliding with developer `npm run dev`; reusing an ad-hoc server without matching token still breaks attach.
- Singleton MCP session in Cursor unchanged — smoke uses in-process `LogicVerificationMcpSession`, not the panel.
