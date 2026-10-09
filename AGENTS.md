# Renn AI Agent Guidelines

## Important: check agent-context/ folder for basic instructions. start at start-here.md

For dialogs, floating panels, popovers, or resize handles, also read `agent-context/feature-ui-infrastructure.md` and update its audit backlog when you find duplication.

**After every finished, user-visible step: commit, push and `npm run deploy`, then tell the user what to look at on the live site** — see `.cursor/rules/deploy-after-each-step.mdc`.

For agent MCP / dev attach tooling, follow `.cursor/rules/agent-mcp-no-project-names.mdc` (generic parameterized tools; no product project names in code).

When MCP/agent edits a verification world, sync it to **`public/exampleWorlds/`** so **File → Example Worlds** and `load_example_world` stay in sync — see `.cursor/rules/agent-mcp-example-world-sync.mdc`.

For self-driving / headless sim vs browser parity: default to headless tests + disk export, and **reload the world (reset all entities to document poses) before every run** — see `.cursor/rules/agent-headless-defined-start.mdc`.

For interactive Builder work on a named IndexedDB project (visible browser + MCP), use skill `.cursor/skills/work-on-project/SKILL.md` (`/work-on-project`).
