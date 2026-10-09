# Renn — Claude Code project instructions

@AGENTS.md

## Cursor rules (imported)

In Cursor these auto-attach by file glob (`.mdc` frontmatter). Claude Code has no
glob-based rule loading, so treat these as always-relevant when touching the paths
each one lists in its own frontmatter, and read the full file before editing there:

- [`.cursor/rules/agent-headless-defined-start.mdc`](.cursor/rules/agent-headless-defined-start.mdc) —
  headless-first car/sim verification: sync world.json to disk, reset entities to a
  defined start every run, don't treat browser-only Play as the primary signal.
  Applies to `tools/renn-mcp/**`, self-driving-car test scenarios/fixtures, and the
  `self_drive_*` / `hunt_repair2` example worlds.
- [`.cursor/rules/agent-mcp-example-world-sync.mdc`](.cursor/rules/agent-mcp-example-world-sync.mdc) —
  MCP/agent world edits must be exported into `public/exampleWorlds/<id>/` (not left
  only in IndexedDB) and documented in `agent-context/example-worlds.md`. Applies to
  `tools/renn-mcp/**`, `src/agent/**`, and `public/exampleWorlds/**`.
- [`.cursor/rules/deploy-after-each-step.mdc`](.cursor/rules/deploy-after-each-step.mdc) —
  **always on**: after every finished, user-visible step run tests, commit + push and `npm run deploy`
  (the live GitHub Pages site is how the user verifies work), then say what to look at.
- [`.cursor/rules/agent-mcp-no-project-names.mdc`](.cursor/rules/agent-mcp-no-project-names.mdc) —
  keep agent MCP/dev tooling generic: no hardcoded product/example project names in
  `src/` or `tools/renn-mcp/`; example-world ids come from `public/exampleWorlds/`
  discovery, not static lists. Applies to `src/agent/**`, `tools/renn-mcp/**`, and any
  `*agent*` source file.

@.cursor/rules/agent-headless-defined-start.mdc
@.cursor/rules/agent-mcp-example-world-sync.mdc
@.cursor/rules/agent-mcp-no-project-names.mdc
@.cursor/rules/deploy-after-each-step.mdc

## Cursor skills (imported)

Mirrored into `.claude/skills/` so they're invocable the same way here:

- `.claude/skills/codebase-cleanup/SKILL.md` — incremental dead-code/tech-debt cleanup pass.
- `.claude/skills/improve-car/SKILL.md` — `/improve-car` program-run-fix loop for the Player Car copy.
- `.claude/skills/work-on-project/SKILL.md` — `/work-on-project` opens visible Builder + MCP attach.

Claude-only (no Cursor copy; relies on the Agent tool with per-agent models):

- `.claude/skills/orchestrate/SKILL.md` — `/orchestrate` three-level agents (L1 dispatcher → one opus L2 → N parallel sonnet/haiku L3), small contexts, handoff docs.

The originals under `.cursor/skills/` remain the Cursor-side copies; keep both in sync
when editing either (or replace the Cursor one with a pointer if that drifts).

## Agent skills

Matt Pocock's engineering skills live in `.agents/skills/`, managed by `npx skills` (`skills-lock.json`).

### Issue tracker

GitHub Issues on `NoNotNow/renn`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
