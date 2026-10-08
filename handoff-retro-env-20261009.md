# Handoff: environment improvements from the maze-evolution retro (2026-10-09)

Start here in a fresh session. Self-contained: you need nothing from the old chat. Reply to the user in German.

## Goal
Make future (orchestrated) agent runs in this repo cheaper and safer. Implement the six items below, each a small,
independent change. Items 1–3 are the priority; 4–6 are quick follow-ups.

## Context (verified facts, don't re-investigate)
- The previous run (`handoff-maze-evo-20261008.md`) used `/orchestrate` (L1 → L2 opus → L3 sonnet/haiku).
  The harness made almost every L2 hand back early (~15×) while its L3 workers were still running. Worker
  completion notices are delivered to the agent that SPAWNED the worker; when that L2 was gone they landed at L1,
  which relayed them by hand. One L2 resumed itself after hand-back while a successor was running → a duplicate
  worker (T2) had to be aborted. The skill line "do NOT hand back while workers run" did not change behaviour.
  The pattern that worked: L1 waits until all workers of a round have returned, then spawns ONE fresh L2 with the
  results in its prompt.
- L3 workers in `isolation: "worktree"` almost never could write into `<RUN_DIR>` (`.orchestrate/…`, gitignored,
  outside their sandbox). Reports were copied from replies / worktree files afterwards.
- Repo has NO CI (`.github/workflows` absent) and NO git hooks. Public repo NoNotNow/renn.
- package.json scripts: `typecheck` (tsc -p tsconfig.app.json), `lint` (eslint .), `test:run`, `test:e2e`
  (playwright), `av:quick` (= sync:global-pipeline + vitest av-evasion-scenarios + av-maze-scenarios, 36 rows),
  `av:pre`, `deploy` (vite build + gh-pages). There is no script for the av-evolution panel e2e
  (a Playwright spec exists under e2e/; find it with `grep -rl "av-evolution" e2e/`).
- Incidents caused by missing gates: a worker reported "av:quick 36/36" after running only the `*.eco.test.ts`
  variants → false claim reached docs, 2 real av:quick failures surfaced later. A stage read two params
  (`cuspCommitCos`, `cuspDot`) without declaring them → only `avStackParams.test` in a full run caught it.
- Hidden coupling: `src/avEvolution/maze/arenaWorld.ts` (~l.26) builds the episode car by COPYING the
  `self_hunt_flexible` AV binding; `av_maze_escape`, every evolution episode and the av:quick scenario arena all
  depend on it. `MAZE_PINNED_CAR_PARAMS` in `src/avEvolution/maze/episodes.ts` pins keys so maze baselines stay
  stable (now incl. `mazeProfile: null`). Twice a change to that binding silently shifted maze results.
  Reference numbers that must stay: `av:evolve:compare --keys holdout-all` → baseline-off 43.6 s / 21 of 24,
  baseline-evolved 18.1 s / median 13.5 / 24 of 24 / 0 contacts.
- macOS has no `timeout` binary; workers used `perl -e 'alarm shift; exec @ARGV' N cmd`. One compare run hung
  3.5 h in an infinite loop. `tools/hunt-maze/harness.ts` already has a `--wall` guard; `tools/av-evolution/compare.ts`,
  the `av:evolve` runner, `tools/hunt-profile-evo/run.ts` and the H0/legs chain tools do not (check each).
- `CLAUDE.md` imports the three `.cursor/rules/*.mdc` files with `@…` AND describes each in a pointer line above →
  the same rules sit in context twice, every session, though they only matter for MCP tooling, example worlds and
  AV headless tests.
- Deploy: `npx gh-pages` failed with a misleading "Failed to get remote.origin.url" because its cache under
  `node_modules/.cache/gh-pages` was corrupt; `npx gh-pages-clean` fixed it.

## Tasks (each: branch, implement, verify, commit; ask the user before pushing to main)

1. **Orchestrate skill** — `.claude/skills/orchestrate/SKILL.md` (Claude-only; no Cursor copy).
   Read `.agents/skills/writing-for-agents/SKILL.md` first and follow it (positive phrasing, leading words, prune).
   - Make **rounds** the normal L2 shape: L2 plans, spawns the round's workers, records them, returns
     `ROUND: <path>`; L1 waits for every worker of the round, then spawns a fresh L2 with the reports. Drop the
     ineffective "don't hand back while workers run" lines.
   - **Worker registry** `<RUN_DIR>/workers.tsv` (id, name, model, worktree, branch, report path, status): whoever
     spawns a worker appends a row immediately; whoever receives its notice updates it. L1 uses it to know when a
     round is complete.
   - **Stand-down**: before spawning a successor L2, L1 tells the old one to stop; never two live L2s.
   - **Reports from worktrees**: workers write `<worktree>/.orch-report/<task-id>.md` (add `.orch-report/` to
     .gitignore); the receiving level copies it into `<RUN_DIR>/l3/`.
   - **Gate command**: point to `npm run gate` (task 2) instead of listing checks.
   Done when: skill reads coherently top-to-bottom, ≤ ~200 lines, no leftover contradictory lines.

2. **One gate + CI**
   - `package.json`: add `test:e2e:av-evolution` (playwright on the av-evolution panel spec) and `gate`, which runs in
     order typecheck, lint, `vitest run`, `av:quick`, `test:e2e:av-evolution`, and prints one PASS/FAIL line per
     step (a small `scripts/gate.mjs` is fine; it must exit non-zero on any failure and must not stop the summary).
   - `.github/workflows/ci.yml`: on push + PR run `npm ci`, typecheck, lint, `npm run test:run` (Playwright optional;
     skip if browsers make CI heavy). Check that `vitest run` passes in a clean checkout first (some tests may read
     local-only files; fix or document).
   - Mention `npm run gate` once in `agent-context/start-here.md` (one line).
   Done when: `npm run gate` passes locally on main; workflow file valid (`act` not required — at least YAML lint and
   a first CI run after push, if the user approves pushing).

3. **Car-provenance guard**
   - One sentence in `agent-context/example-worlds.md` at the `self_hunt_flexible` row: changing its AV binding
     also affects `av_maze_escape`, evolution episodes and av:quick; re-verify the 18.1 s HOLDOUT after such changes.
   - A test (e.g. `src/avEvolution/maze/carProvenance.test.ts`) that loads the self_hunt_flexible AV binding and fails
     when it contains a key that `MAZE_PINNED_CAR_PARAMS` does not pin AND that is not in an explicit allow-list of
     keys known to be harmless for maze episodes — so a new binding key forces a conscious decision.
   Done when: test passes now and fails if you add a dummy key to the binding (verify, then revert).

4. **Timeout guards in long CLIs** — add `--wall <seconds>` (sensible default, e.g. 2 h; 0 = off) to
   `tools/av-evolution/compare.ts`, the `av:evolve` runner, `tools/hunt-profile-evo/run.ts` and the chain tools,
   implemented in-process (timer → clean shutdown, kill worker pool, non-zero exit). Reuse `tools/hunt-maze`'s
   implementation if it is shareable. Done when each tool exits with a clear message under a tiny `--wall`.

5. **Context load** — in `CLAUDE.md` remove the three `@.cursor/rules/*.mdc` import lines; keep the pointer lines
   (sharpen their trigger wording if needed). Done when CLAUDE.md has the pointers only.

6. **Deploy robustness** — make `npm run deploy` run `npx gh-pages-clean` before `gh-pages -d dist`, or add one
   line about it in the doc that describes deploying (grep `deploy` in agent-context). Don't deploy as part of this.

## Suggested order / branching
One branch `env-improvements` from main; commits per task. Tasks are independent; 1, 5 are docs-only. Run
`npm run gate` (from task 2) at the end. Report to the user in German; ask before pushing/merging to main.

## Open questions for the user
- CI: include Playwright e2e in GitHub Actions, or only typecheck/lint/vitest?
- Default `--wall` value for the long tools (proposal: 2 h).
