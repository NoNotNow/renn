# Renn AI Agent Guidelines

## Important: check agent-context/ folder for basic instructions. start at start-here.md

For dialogs, floating panels, popovers, or resize handles, also read `agent-context/feature-ui-infrastructure.md` and update its audit backlog when you find duplication.

**After every finished, user-visible step: commit, push and `npm run deploy`, then tell the user what to look at on the live site** — see `.cursor/rules/deploy-after-each-step.mdc`.

For agent MCP / dev attach tooling, follow `.cursor/rules/agent-mcp-no-project-names.mdc` (generic parameterized tools; no product project names in code).

When MCP/agent edits a verification world, sync it to **`public/exampleWorlds/`** so **File → Example Worlds** and `load_example_world` stay in sync — see `.cursor/rules/agent-mcp-example-world-sync.mdc`.

For self-driving / headless sim vs browser parity: default to headless tests + disk export, and **reload the world (reset all entities to document poses) before every run** — see `.cursor/rules/agent-headless-defined-start.mdc`.

## Skills

Skills in this repo are SKILL.md files on disk. Harnesses differ: Claude Code auto-loads `.claude/skills/`, Cursor auto-loads `.cursor/skills/`, and other harnesses (e.g. Mistral Vibe) load neither. Treat them as invocable regardless of harness: **before starting a task, check whether it matches a skill below; if it does, read that SKILL.md first and follow it.**

- `.agents/skills/<name>/SKILL.md` — engineering skills from `mattpocock/skills`, managed by `npx skills` and pinned in `skills-lock.json`: ask-matt, code-review, codebase-design, diagnosing-bugs, domain-modeling, grill-with-docs, grilling, handoff, implement, improve-codebase-architecture, prototype, research, resolving-merge-conflicts, retro, setup-matt-pocock-skills, tdd, to-spec, to-tickets, triage, wayfinder, wizard, writing-for-agents.
- Project skills in `.claude/skills/` (Cursor copies in `.cursor/skills/`; keep both in sync when editing either): codebase-cleanup, improve-car, orchestrate, work-on-project.

For interactive Builder work on a named IndexedDB project (visible browser + MCP), use skill `.cursor/skills/work-on-project/SKILL.md` (`/work-on-project`).
