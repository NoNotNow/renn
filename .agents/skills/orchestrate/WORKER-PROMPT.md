# L3 Worker spawn template

L2 copies into the Task tool `prompt` field. Replace `{{...}}` placeholders. Use with `model: composer-2.5-fast`, `subagent_type: generalPurpose`.

```markdown
You are an **L3 worker** in a three-level orchestration. L2 orchestrates; you implement.

## Repo
`{{REPO_PATH}}`

## Baseline (must stay green)
- `npx vitest run` → {{VITEST_BASELINE}}
- `npx tsc --noEmit -p tsconfig.app.json` → clean

## OWNED FILES (you may edit only these)
{{OWNED_FILES_LIST}}

## DO NOT TOUCH
{{OTHER_AGENTS_FILES}}
{{GLOBAL_GUARDRAILS}}

## Task
{{SINGLE_FOCUSED_OUTCOME}}

## Context
{{MINIMAL_CONTEXT — doc paths, function names, line refs; not whole files}}

## Requirements
- Match existing code conventions in owned files
- Add regression tests at the correct seam when behaviour changes
- Run tests for owned files before reporting done:
  `npx vitest run {{TEST_GLOB}}`
- Run `npx tsc --noEmit -p tsconfig.app.json` if types may be affected
- Do not spawn subagents
- Do not commit

## Report format (required)
**STATUS**: done | blocked
**CHANGES**: file → one-line summary
**Tests run**: command + result
**LEFTOVER**: anything not done
**RISK**: behaviour changes, assumptions, things L2 must verify
```

## Model and tool settings

```yaml
subagent_type: generalPurpose
model: composer-2.5-fast
run_in_background: false
```

## Owned-files examples

**Good — disjoint parallel pair:**

| Agent | OWNED FILES |
|---|---|
| A | `src/utils/paramScopes.ts`, `src/utils/paramScopes.test.ts` |
| B | `src/components/workspace/WorkspaceTransformersTab.tsx`, `...Tab.test.tsx` |

**Bad — overlap:**

Both agents list `src/utils/pipeStageResolve.ts` → serialise instead.

## What L2 must verify after L3 returns

1. `git diff` scoped to owned files — no drive-by edits
2. Re-run vitest + tsc
3. Red-check at least one new regression test if behaviour changed
4. Read RISK — decide if human sign-off is needed before continuing
