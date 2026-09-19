# Agent AFK runtime: headless CLI + optional browser attach

Status: accepted

Orchestrated agents (L2/L3 via `/orchestrate`) must **program and verify** without a human starting sims or clicking Builder. Cursor’s MCP namespace is available to the **coordinator** when the dev panel enables `renn-logic-verification`, but it holds **one in-process session** (browser attach and headless load are mutually exclusive; `stop_run` disposes the host). Subagents in shell cannot rely on that namespace.

**Decision:** Treat **in-process MCP parity** via `npm run agent:cli` as the default verification runtime for AFK workers. Use Cursor MCP when convenient for the L1 coordinator only. Use **`attach_browser`** / `npm run dev` only for in-game verification slices that need the live canvas or human-visible state.

**Considered:** Require Cursor MCP for all agents; Playwright-driven Builder UI; duplicate host APIs in a second CLI surface.

**Why not those:** Task subagents often lack project MCP; UI automation fights pose-safe host design; a second API duplicates `LogicVerificationMcpSession` already wired through stdio MCP.

**Orchestrate implications:**

| Layer | Verification |
|--------|----------------|
| L3 worker | After code change: `npx vitest run` (+ targeted file); for behaviour: `npm run agent:recipe-headless` or `agent:cli call …` |
| L2 | Same baseline as L1; never trust worker claims without re-run |
| L1 | Baseline vitest/tsc; spot-check `agent:recipe-headless`; optional MCP for interactive attach |

**Out of scope for this ADR (next orchestrate queue):** entity/scene patches, `export_project_bundle`, auto-start Vite for attach, bundle assets in headless host.
