# Handoff: AV maze evolution, self_hunt_flexible transfer, maze profile — 2026-10-08

Session 2026-10-07 19:22 → 2026-10-08 night (orchestrated L1/L2/L3 run "maze-evo"; local run dir `.orchestrate/20261007-1922-maze-evo/` is gitignored, so everything a cloud session needs is here).
Standing rules unchanged (see `handoff-av-20261006.md`): answer Manuel in German, `npm run sync:global-pipeline` after av-stack edits, never loosen criteria / oracles / baselines, full suite before deploy, deploy needs Manuel's OK.

## Headline numbers (av_maze_escape, headless, deterministic, 120 s cap)
| set | HOLDOUT-24 mean / median exit | reached | contacts (ev / frames) | reversals per ep | reverseS |
|---|---|---|---|---|---|
| baseline (code defaults, maze module off) | 43.6 / 34.1 s | 21/24 | 1 / 44 | 12.0 | 21.7 |
| c667+s2 (earlier default candidate) | 21.8 / 14.9 s | 24/24 | 3 / 47 | 4.3 | 5.8 |
| **c870 (H2 #3) = shipped av_maze_escape car** | **18.1 / 13.5 s** | **24/24** | **0 / 0** | 4.7 | 4.7 |
TRAIN-24: baseline 52.7 s 20/24 → c870 21.3 s 24/24, 0 contacts. HOLDOUT = 24 episodes on mazes/starts never used for selection (`--keys holdout-all`; `--keys holdout` is only the original 6).
c870 lives in `src/avEvolution/maze/mazeEscapeDefaultCar.json` (143 params) and applies ONLY to `av_maze_escape` (H3 "option B"; global use breaks scenario tests).

## What is on main (b9bf856f) from this run
- AV evolution system: `src/avEvolution/` (gene spec, ES core, IndexedDB store, maze generator `maze/`, evaluator shared node/browser), Builder panel (`AvEvolutionPanel`, Web Workers, resumable), MCP tools `av_evolution_*`, docs `agent-context/feature-av-evolution.md`.
- Example world `av_maze_escape` (exporter `tools/renn-mcp/export-av-maze-escape-example-world.ts`), mazeProfile pinned null.
- 23+ hardcoded maze constants exposed as params (bit-identical defaults); maze module merged from ccr-0849009a; stall fallback + mazeGoalW (MI1); reversal metrics (reversals, reverseS) + fitness weights wReversal / wReverseS (RV1, RV3e); heading-aware K-turn planning (cusp genes, H1; defaults off).
- self_hunt_flexible: opt-in `mazeProfile` binding mechanism (profile params win while `av.maze`, hold s) — mechanism only, NO profile values (the hand-picked 18-key profile broke 2 real av:quick rows and was reverted in b9bf856f).
- hunt-maze harness `tools/hunt-maze/` (real self_hunt_flexible world, mazes A-G, scenarios solo / flee / flee-real / cim).

## Branch to merge now: `wrapup-2026-10-08` (from main b9bf856f)
1. `6801c9de` (branch av-input-first) — `global_av_input` is now the FIRST member of `global_av_autopilot` (input 0, sense 1, plan 2, control 3, safety 4). All `scopeParams` member keys re-indexed +1 (self_hunt_flexible 11 cars x 3 keys; test scope in av-stack-param-layers). New guard test `src/test/scenarios/example-world-scope-members.test.ts` (every example-world member key must resolve; mutation-checked). Behaviour bit-identical: 36 av:quick rows byte-identical before/after; c870 HOLDOUT-24 still 18.1 s / 24/24 / 0 contacts.
2. `9eaf03b9` (branch run-export) — AV-evolution export best-first + compact (top-50, no per-episode records / vecs / engine state; 5.4 MB → 0.3 MB): panel "Export" (compact) + "Export full", `run.ts --compact`, MCP `av_evolution_export`; all readers (compare.ts, MCP, disk) accept full / compact / unsorted, dedupe full+compact twins; panel shows the run's fitness weights after New run. Tests `exportFormats.test.ts`, `controller.test.ts`, e2e assertion.
Gates on the combined head 99ef4afa: tsc clean; full vitest 345 files / 2722 tests passed (20 skipped, 0 failed); real `npm run av:quick` 36/36 passed, rows byte-identical to the pre-move reference, sync left the tree clean; eslint on changed files clean; e2e av-evolution-panel 1 passed.
Note: av:quick prints `FAIL maze-b-rev-door goal never` as a metric row, but that vitest test passes (its hard rule is minStaticGap); it is the same on main and on every head of this run — not a regression.

## User browser run run-muzy5k75 (548 candidates, 136 gens) — verdict: keep c870
HOLDOUT-24 mean / median / reached / contact events: c870 18.1 / 13.5 / 24 / 0; c487 23.1 / 15.0 / 24 / 2; c579 25.5 / 16.5 / 24 / 6; c608 26.3 / 14.4 / 24 / 0; c484 27.0 / 23.7 / 24 / 6; c548 28.0 / 16.0 / 24 / 2. TRAIN-24: c870 21.3 vs 31.1–35.0 for the five. All five worse beyond noise.
Why: the run had wReversal 0 and wReverseS 0 and only n=6-episode browser fitness.
**wReversal = 0 finding:** the run was CREATED with 0 (gen-0 candidate, run.weights and engine state all 0; not a resume / import). Code defaults are correct (wReversal 0.5, wReverseS 0 by design) and a fresh panel shows 0.5. Only explanations: the panel weight input was cleared (Number('') === 0) or a long-lived tab with an old bundle (the local Vite had been up since Oct 7). Not reproducible → no code fix; hardening: panel prints the weights after New run + tests. Ask Manuel to check the weights line before starting a long run.

## Part B: maze profile evolution for self_hunt_flexible (open, resumable)
Goal: evolve the `mazeProfile` values (33 keys = LMnoC 29 + 4 cusp genes, + hold) on the hunt-maze harness with real chasers, under the constraint that every real av:quick / suite row stays green.
- Key fact (B0, verified): a run is bit-identical to base until `av.maze` first turns on, so only rows/tests that activate av.maze in base can be affected (15 of 22 av-maze-scenarios rows, listed in tools/hunt-profile-evo/probe). In-loop proxy = those rows (sentinel tier of 9 tasks first, full proxy for elite candidates).
- Runner: `tools/hunt-profile-evo/` (genome, fitness, worker pool <=5, sentinel/proxy gating, checkpoint + task cache, SIGTERM-safe, held-out start set, compare). Branch `hunt-profile-evo` (9cd0b333: B0 probes fbbdc7b4 + runner 9b635f01/7e19cd77). Tests: `npx vitest run tools/hunt-profile-evo` (10 pass, 1 skip).
- B2 long run was started then stopped in gen 0 on wrap-up: 8 candidates in 589 s, 7 sentinel-fail (87.5 %), best feasible = base (fitness 183.5). Checkpoint committed on branch `hunt-profile-evo-b2` (6e73bb19) under `tools/hunt-profile-evo/checkpoints/run1-gen0/`.
- **Resume** (on hunt-profile-evo-b2):
  ```
  mkdir -p test-results/hunt-profile-evo && cp -r tools/hunt-profile-evo/checkpoints/run1-gen0 test-results/hunt-profile-evo/run1
  perl -e 'alarm shift; exec @ARGV' 18000 npx tsx tools/hunt-profile-evo/run.ts --out test-results/hunt-profile-evo/run1 --gens 20 --pop 12 --elite 3 --workers 4 > test-results/hunt-profile-evo/run1.log 2>&1
  ```
  Then: top-K (<=3) full REAL gate (temporary world edit, revert), `tools/hunt-profile-evo/compare.ts` on the held-out start set (base / P1 / S8 / best). Rebase onto main AFTER wrapup is merged (input-first changes the member indices; the profile code uses no member keys, checked).
- **Recommendation before resuming:** 87.5 % sentinel failure = search space too wide. Narrow the ranges (e.g. +-25 % around base) or seed only near base / S8, raise the key-off probability; otherwise most of the 5 h budget is wasted. Changing ranges/config changes the run's config signature, so resume is refused: start a fresh `--out` dir then (the `tasks.jsonl` cache only helps the unchanged config).
- B3 (not started): apply the best fully passing profile to the self_hunt_flexible AV binding, sync:global-pipeline, re-export av_fleet_eco / av_maze_escape (keep null pin; re-verify c870 18.1 s / 24/24 / 0), docs, full gates incl. real av:quick 36/36. Never ship a profile that changes a real av:quick row.

## Transfer to self_hunt_flexible (measured, hunt-maze harness, n=21 per scenario, mean incl. timeouts as 120 s)
base: solo 13.1 s 21/21, flee 62.1 s 14/21, flee-real 55.4 s 17/21. c870 full on the AV: solo 10.1, flee 41.0 (19/21), flee-real 27.0 (19/21) — big gain but breaks scenario tests (shared params: speeds, AEB, margins). Profile-only subsets (LMnoC, P1 18 keys) gave mixed, chaotic results (+-10 s swings from single keys) and P1 broke maze-gate-exit (shuttle 3 > 2) and mazemod-one-exit (fleeCross) → reverted.

## Refuted / no-gain (do not retry without a new idea)
- Forcing the maze module on (mazeForce): TRAIN 98.1 s 7/24 vs off 52.7 s 20/24; evolution never selected it (5/604). Module stays default-on in self_hunt_flexible but inert in maze episodes.
- MI2 goal-side exit filter / MI3 stable maze region: not merged (no TRAIN gain).
- Reversal fixes RV3a (commit in-manoeuvre plans), RV3b (no gear flips in reverse-cruise), RV3c (forward-biased launch), RV3d (S-curve swing-out / apex term): all no gain or negative; RV2: swing-out explains only ~7-13 % of reversals and wider lines do not reduce them.
- Reversal penalty 0.5 / 0.25 in evolution (EV): no reversal reduction on HOLDOUT (EV #2 24.7 s, safe but not fewer reversals).
- Global c870 transfer to self_hunt_flexible: breaks tests (see above). Perf port d4d9ebdb: no speed gain.
- H1b: further K-turn cost changes regress the evolved sets.

## Tools and commands
- Evolution: `npm run av:evolve -- --gens 60 --pop 16 --workers 9 --w-reversal 0.5 --w-reverse-s 0.25 [--seed-params a.json,b.json] [--compact] --out test-results/av-evolution/x.json` (resumable).
- Compare: `npm run av:evolve:compare -- --run x.json --top 3 --params a.json,b.json --keys holdout-all|train|holdout --out <prefix>` (writes .md/.json; `--top 0` = only --params sets).
- Manoeuvre chains / legs (H0 tool): `tools/av-evolution/legs.ts`. Sensitivity: `tools/av-evolution/sensitivity.ts`.
- hunt-maze harness: `npx tsx tools/hunt-maze/harness.ts --set base={} --set name@av=file.json --scenarios solo,flee,flee-real,cim --seconds 120 --workers 5 --wall 1500 --out DIR` (<=5 workers; 9 died). Set builders / av:quick runners: `tools/hunt-maze/*.mjs`.
- Profile evolution: `tools/hunt-profile-evo/run.ts` (see Part B); probes `tools/hunt-profile-evo/probe/`.
- Gates: `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run`, `npm run av:quick` (36 rows; runs sync first), eslint on changed files, `npx playwright test e2e/av-evolution-panel.spec.ts` (use a private vite port if 5173 is busy).

## Caveats
- All evolution results are single-seed; HOLDOUT differences below ~3 s are near noise (one episode moves the mean ~4 s / 24). The 3-chaser hunt-maze scenarios are chaotic (+-10 s from tiny changes).
- Evolution ran saver OFF and without chasers; the shipped self_hunt_flexible car runs eco + saver with tickEvery scopes.

## Next steps (recommended order)
1. Push + fast-forward main to `wrapup-2026-10-08`, deploy (Manuel's OK).
2. Part B: narrow the profile ranges, rebase hunt-profile-evo-b2 on main, resume the run (5 h cap), then B3 only if a profile passes every real row.
3. If Manuel runs another browser evolution: check the printed weights (wReversal 0.5), use the compact export, compare on HOLDOUT-24 vs c870 before adopting.
4. Optional: evolution under the real eco + saver budget with chasers (T3 idea) if Part B stays flat.
