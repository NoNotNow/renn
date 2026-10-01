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
- [`.cursor/rules/agent-mcp-no-project-names.mdc`](.cursor/rules/agent-mcp-no-project-names.mdc) —
  keep agent MCP/dev tooling generic: no hardcoded product/example project names in
  `src/` or `tools/renn-mcp/`; example-world ids come from `public/exampleWorlds/`
  discovery, not static lists. Applies to `src/agent/**`, `tools/renn-mcp/**`, and any
  `*agent*` source file.

@.cursor/rules/agent-headless-defined-start.mdc
@.cursor/rules/agent-mcp-example-world-sync.mdc
@.cursor/rules/agent-mcp-no-project-names.mdc

## Cursor skills (imported)

Mirrored into `.claude/skills/` so they're invocable the same way here:

- `.claude/skills/codebase-cleanup/SKILL.md` — incremental dead-code/tech-debt cleanup pass.
- `.claude/skills/improve-car/SKILL.md` — `/improve-car` program-run-fix loop for the Player Car copy.
- `.claude/skills/work-on-project/SKILL.md` — `/work-on-project` opens visible Builder + MCP attach.

The originals under `.cursor/skills/` remain the Cursor-side copies; keep both in sync
when editing either (or replace the Cursor one with a pointer if that drifts).
