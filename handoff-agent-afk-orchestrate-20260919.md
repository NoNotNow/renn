# Handoff — AFK agent runtime + orchestrate queue

**Written:** 2026-09-19

## Baseline (L1 verified)

- `npx vitest run` → **236** files, **2044** passed, **3** skipped
- `npx tsc --noEmit -p tsconfig.app.json` → **clean**
- `npm run agent:setup-check` → ok
- `npm run agent:recipe-headless` → ok
- Post-L2: **240** files, **2050** passed, **3** skipped; tsc clean
- Post dev-attach: **243** files, **2060** passed, **3** skipped; `npm run agent:dev-attach` → ok (L1 verified)

## Goal

Agents program and test **without the user** running sims or MCP. `/grill-with-docs` + ADR **0003** lock the runtime split: **headless CLI for L3**, optional **Cursor MCP for L1**, **browser attach only when canvas/human workflow required**.

## Can the coordinator run the app via MCP?

| Mode | Without user? | Notes |
|------|----------------|-------|
| Headless (`load_*`, patch, run, observe) | **Yes** | Cursor MCP **or** `npm run agent:cli` / `agent:recipe-headless` |
| Full Builder UI | **Partial** | Needs `npm run dev` + human import **or** future automation |
| `attach_browser` | **Yes** (dev) | `npm run agent:dev-attach` — auto Vite + `?rennAgentBundle=` bootstrap + attach verify |

MCP session is **one at a time**: after `attach_browser`, headless loads fail until `stop_run`; calling `stop_run` disposes the host (`Not connected` until MCP server restarts in Cursor).

## Delivered this session

- `tools/renn-mcp/agent-cli.ts` + npm scripts `agent:cli`, `agent:recipe-headless`
- ADR `docs/adr/0003-agent-afk-orchestration-runtime.md`
- Glossary + setup doc updates

## `/orchestrate` priority queue

| # | Item | Status |
|---|------|--------|
| 1 | Entity/scene patches on `apply_world_patch` | **Done** (L2 [496e77d8-719f-4eb1-9693-c2c71816dbc8](496e77d8-719f-4eb1-9693-c2c71816dbc8)) |
| 2 | `export_project_bundle` | **Done** |
| 3 | Bundle assets in headless host | **Already wired** (slice 8) |
| 4 | In-process recipe vitest gate | **Done** — `agent-recipe-headless.integration.test.ts` |
| 5 | `agent:dev-attach` auto Vite | **Done** ([74a70eb3-7992-4a99-9293-68a5b7fa10a6](74a70eb3-7992-4a99-9293-68a5b7fa10a6)) |

Detail: `/var/folders/cg/87j3kd8s3dqctsflnp71st2w0000gn/T/handoff-agent-afk-implement-20260919-1832.md`

## Guardrails

- No MCP in production builds; dev token only
- Pose-safe apply semantics; allowlisted bundle ids
- Do not commit unless user asks

## LEFTOVER

- Optional `agent:cli recipe attach` alias; env-gated CI job for `agent:dev-attach`
- Bundle **assets** in browser bootstrap (middleware serves world JSON only today)
- Playwright e2e remains separate from logic verification host

## RISK

- Singleton Cursor MCP session can confuse parallel coordinator experiments
- Stale `npm run dev` must be restarted once after pull so bundle middleware registers
- Playwright + Chrome cost — not in default vitest
