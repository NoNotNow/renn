---
name: codebase-cleanup
description: Incrementally cleans the Renn codebase — dead code, loose ends from recent commits, detoured implementations, duplication, and obvious bugs. Fixes safe issues inline; flags larger refactors. Use when the user asks for cleanup, stabilization, tech debt pass, dead-code sweep, or invokes /codebase-cleanup.
---

# Renn Codebase Cleanup

Long-running stabilization skill. Each pass should leave the codebase slightly cleaner and update the living audit log.

## Before you start

1. Read `agent-context/start-here.md` (task → file map).
2. Read `agent-context/codebase-cleanup-audit.md` — completed phases, deferred items, god-file backlog, test gaps. **Do not redo completed work.**
3. For dialogs, floating panels, popovers, or resize handles: read `agent-context/feature-ui-infrastructure.md` and update its audit backlog when you find duplication.

## Scope per pass

Work in small, reviewable slices. Prefer one theme per session (e.g. "dead exports in workspace", "hex migration in SoundPanel").

### 1. Recent commits (loose ends)

```bash
git log --oneline -15
git log -5 --stat
git diff HEAD~5..HEAD --name-only
```

For each recent commit, ask:

- Partial implementations left behind? (unused props, stub handlers, commented blocks)
- Tests added but not wired? Or behavior changed without test updates?
- Docs (`agent-context/`) out of sync with the code?
- Refactors that duplicated logic instead of extracting shared helpers?

Fix obvious loose ends in the same area; note non-obvious ones in the audit doc.

### 1b. AI documentation consolidation (`agent-context/`)

Each pass should shrink or dedupe agent docs, not only code.

- **Canonical home:** terms → `nomenclature.md`; structure → `architecture.md`; feature behaviour → one `feature-*.md`. Link instead of copying tables or long explanations.
- **Audit file:** append **short** phases to `codebase-cleanup-audit.md` (bullets, paths). Do not grow verbose essays; full history lives in `codebase-cleanup-history.md` (archive).
- **When editing feature docs:** remove paragraphs that repeat nomenclature; fix stale API names; one-line “superseded by …” beats keeping two versions.
- **README.md § Doc rules** is the style reference.

### 2. Dead code

Search systematically:

```bash
# Unused files (no importers outside tests)
# Grep for exports, then check importers

# Unused exports in a touched file
# TODO/FIXME/HACK/@deprecated
rg 'TODO|FIXME|HACK|@deprecated' src/
```

Remove when **zero production consumers**. If only tests import a module, flag it in the audit (see "test-only modules" pattern in the audit doc) — do not delete without confirming.

Safe removals: unused files, unused exports, unreachable branches, obsolete migration shims (only after confirming migration is complete).

### 3. Detours and simplification

Features often take historical detours. When reading code in an area you are cleaning:

- Is there a simpler path that preserves behavior?
- Can nested conditionals become early returns?
- Can inline IIFEs become plain if/return trees?
- Are there two ways to do the same thing (old + new API)? Prefer the canonical path; migrate call sites or document why both remain.

**Rule:** simplify locally without changing observable behavior. Run tests after each change.

### 4. Duplication

Before extracting:

| Size | Action |
|------|--------|
| Small (≤15 lines, 2 call sites) | Extract helper in nearest `utils/` or colocated module |
| Medium (component pattern repeated) | Check `sharedStyles`, `theme.ts`, existing hooks in `feature-ui-infrastructure.md` |
| Large (whole subsystem duplicated) | **Do not restructure in this pass.** Log in audit with suggested extraction and file targets |

Follow existing project patterns: hooks in `src/hooks/`, panel sections in subfolders (`propertyPanel/`, `world/`, `textureDialog/`), pure helpers with unit tests.

### 5. Obvious bugs

Fix when confidence is high and fix is localized:

- Wrong null checks, stale closures, inverted conditions
- Type errors (`npx tsc --noEmit` must stay clean)
- Tests that assert outdated behavior after a deliberate fix

If the bug touches hot paths (per-frame loop, Rapier step, `sceneFrameLoop`, `renderItemRegistry` sync), run relevant tests and warn before performance-sensitive changes.

## What to fix vs defer

### Fix inline (default)

- Dead code and unused exports
- Console.log on success paths → gate behind `import.meta.env.DEV`
- Raw hex → `theme.ts` tokens when touching a file (opportunistic migration)
- Small DRY extractions with tests
- Obvious bugs with clear repro or failing test
- Doc drift in `agent-context/` for code you changed; consolidate redundant agent docs (see §1b)

### Defer but document

- God-file splits (`Builder.tsx`, `SceneView` main effect, `rapierPhysics.ts`, `TextureMaker.tsx`, `renderItemRegistry.ts`) — see audit "Remaining larger tasks"
- Cross-cutting API redesigns
- Duplication spanning 3+ subsystems
- Removing `@deprecated` types until migration is verified complete

### Restructure now (rare)

Only when **urgent**: broken build, clear bug requiring structural fix, or duplication causing active bugs. When restructuring:

1. State clearly in your response: **what**, **why urgent**, **scope**, **risk**
2. Keep the diff focused; add tests for extracted pieces
3. Record the phase in `codebase-cleanup-audit.md`

## Performance guardrails

- **Do not** change per-frame simulation, physics stepping, or Rapier hot paths without explicit user approval and `npm run test:perf` when relevant.
- UI-only refactors are safe if they preserve the same React subtree shape and effect deps.
- Warn before changes that add per-frame allocations.

## Verification (required)

After every fix batch:

```bash
npm run test:run          # full unit/integration suite
npx tsc --noEmit          # or npm run build for release check
```

If you touched workspace/pipe/transformer areas, also run targeted tests:

```bash
npx vitest run src/components/Workspace src/hooks/usePipeNavController src/utils/pipeNavMutations
```

## Update the living audit

At end of each pass, append to `agent-context/codebase-cleanup-audit.md`:

```markdown
## Phase N — [short title] (completed, YYYY-MM-DD)

**Performance:** [none / note if hot path touched]

### Changes
- ...

### Deferred
- ...

### Tests
- ...
```

Also update checklist items and line counts in "Remaining larger tasks" when god files shrink.

## Output format

Summarize for the user:

1. **Investigated** — commits/areas scanned
2. **Fixed** — bullet list with file paths
3. **Deferred** — what and why
4. **Audit updated** — yes/no, phase number
5. **Tests** — pass/fail

Keep fixes minimal. One good small pass beats a sprawling refactor.
