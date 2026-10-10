# Handoff: flee-improvement + v3cap training, state 2026-10-10 ~19:30 local (Mac)

For the next agent. Branch `claude/autonomous-car-evolution-9p6zt2` (far ahead of `main`).
**Workflow:** testing happens on LOCALHOST (`npm run dev`); deploy to gh-pages after every finished user-visible change (`npm run deploy`). The user is the acceptance gate.
**Subagents ARE available here** (`tools.subagent.*`: spawn / sendMessage / wait / interrupt / close, called from run_typescript) — useful for parallel diagnosis; spawn only, never block on them during tests.
Read in: this file -> [plan-flee-improvements.md](./plan-flee-improvements.md) (diagnosis, measured results, step-3 results, fix plan) -> [handoff-policy-evolution.md](./handoff-policy-evolution.md) (v1->v2->v3 policy background, ship gate, workflow).

## Round-3 user feedback (live localhost testing of self_hunt_flexible) + what it means

1. **"No big improvement in the labyrinth"** — matches the measured residuals: bad goals 29 % at escapeSwitch 18, maze-waypoint churn (seed-3 maze goal hold median 0.3 s), and the goal-quality numbers did NOT improve with any sweep (see plan step-3). The labyrinth behavior is the maze module's route waypoints (by design partly) — next lever: `mazeStep` waypoint stability (route rebuild churn) + the goalOpen scoring of maze-corridor headings.
2. **"Red flee goal although no chaser nearby"** — plausible cause (trace, not yet verified): the goalWatchdog flags the REAL goal unreachable (labyrinth) -> `bad = true` -> the flee/maze goal stays committed (`fleeRelease` explicitly does NOT release while flagged bad; `danger()`/`mzNear` can also latch `state.mzT` from a stalled chaser within half `mazeThreatRange`, or `mazeStall`). Next agent: trace `state.wd.bad`, `av.goalBad`, `state.mzT` triggers + the red goal's source (maze module vs fleeSim gap goal) in the diagnostic (`AV_FLEE_TRACE=1`) or a headless watch dump, then decide whether a bad-goal release (give-up / re-pick) should also fire when NO chaser is within e.g. 60 m.
3. **"Policy never switches on" (no violet tint) in self_hunt_flexible — EXPECTED**: that world does NOT set `neuralMode`; the neural stage defaults to `off` there (bit-identical classic stack). The tint (see "Policy indicator" below) only shows in worlds with `neuralMode: 'auto' | 'always'` = `av_neural_crowd`, `av_neural_v3` (and any world that opts in). Enabling the policy in self_hunt_flexible IS the pending "smart integration" step (plan-policy-in-av-car.md §8) and waits for a good v3 ship. Check the tint there: `av_neural_v3` world, car goes violet while the net drives.

## Where things stand

Two work streams:

1. **v3cap training** (speed-capped fork, `--speed-cap 15`, target gen 3000): RUNNING (gen ~2386 and climbing, ~710 % CPU = the load you see). **Control: `npm run train` / `train:stop` / `train:start` / `train:ship`** (see README top; the CLI waits for a gen boundary before stopping and resumes cleanly). Last ship check at gen 1515: KEEP (holdout `free` 88 % vs 100 %); **the next ship check is DUE NOW** — run `npm run train:ship`; if WROTE (finish-count gate): re-export worlds (`npx tsx tools/renn-mcp/export-policy-drive-example-world.ts`), `npx vitest run src/policyEvolution`, commit, push, deploy. Commit `training-data/policy-evolution/v3cap.json` regularly.

2. **Flee improvement in `self_hunt_flexible`** — round 1 (world params) + round 2 (stage fixes A/B + escapeSwitch 18) shipped and deployed; the user has now tested twice live (round 2 = "same/worse" on open ground, round 3 = labyrinth not better, stray red goals; see above). Everything measured is in plan-flee-improvements.md step 3.
   - Diagnostic harness ACTIVE: `src/test/scenarios/av-flee.diagnostic.test.ts` (env-gated: `AV_FLEE_DIAG=1 AV_FLEE_SEEDS=1,2,3,4 AV_FLEE_FRAMES=3600 AV_FLEE_NAME=<name> [AV_FLEE_PARAMS='{"k":v}' | AV_FLEE_TRACE=1]`; per-run json in `test-results/avflee/`) + paired compare `node tools/av-flee-compare.mjs base <variant> --dir test-results/avflee`. Baseline = `base`, post-fix = `world-fix` (already includes the new world params; identical numbers to `v-combo`).
   - Root causes (all four weaknesses measured + traced in plan-flee-improvements.md): comfort-style manoeuvre shuffle 3 m/s (no `style: escape`), AEB braking to standstill on moving chasers AND before the speed planner (`chasedDecel` 9 > `aebDecel` 7), stopped -> `wantManeuver` -> shuffle cascade, gap-goal churn via `curBlocked` bypassing the `escapeSwitch` hysteresis + clamp into the inflated wall.
   - Fix SHIPPED (world params only, commit ac7d745e, deployed): `style: escape`, `runTotal: true`, `mazeManeuverSpeed: 4.5`, `chasedDecel: 7`, `escapeEvalEvery: 0.6`, `gapWallMin: 40` in the focus binding of `public/exampleWorlds/self_hunt_flexible/world.json`. Measured (paired, 4 seeds): mean speed 10.1 -> 20.8 m/s, chaser<30 m time 47 -> 10.5 %, manoeuvre time 43 -> 12.7 %, slow episodes 31 -> 8 %, bad goals 39 -> 25 %, catches 1.0 -> 0.25/run. World tests green (hunt-game, hunt-game-score, av-maze-profile: 11/11).

## Next steps (in order)

1. **v3cap ship check is DUE NOW** (gen ~2386 >= the 1800-2000 window; last check at 1515 = KEEP): `npm run train:ship`. If WROTE: re-export policy worlds, `npx vitest run src/policyEvolution`, commit, push, deploy — then the smart integration (step 4) is unblocked.
2. **Flee: the labyrinth residuals (user round-3 feedback)** — in order of expected value:
   a. Trace the "red flee goal with no chaser near": watch `state.wd.bad` / `av.goalBad` / `state.mzT` (goalWatchdog flags the real goal unreachable in the labyrinth; `fleeRelease` refuses to release while flagged bad). Candidate fix: release / give up the flee goal when no chaser is within ~60 m, or re-tune `goalGiveUp` (0 = off in this world).
   b. Maze-waypoint churn: `mazeStep` route rebuild churn (seed-3 maze goal hold median 0.3 s); stabilize the committed route / waypoint (`mazeReach`, off-route rebuild) and re-run the paired diagnostic before touching stage code.
   c. If the user prefers fewer bad goals over fewer switches: re-sweep `escapeSwitch` 12 (bad goals 18 %) vs 18 (churn 10/min, hold 7.3 s) — both tables in plan step-3.
3. **Then the smart integration** (per plan-policy-in-av-car.md §8): AV logic sets target-direction vectors for the neural v3 net (forward + reverse) in mazes / dense chaser packs / instead of the slow manoeuvre mode; hand-over, fallback, training changes (chasers / moving obstacles), A/B gate (`AV_NEURAL_V3_WEIGHTS` + `av-neural-ab` / `av-neural-maze-ab` diagnostics) before enabling in self_hunt_flexible (`neuralMode` is NOT set there today — that is why the user never sees the policy/violet tint in this world). This waits for a good v3 ship (see 1).

## Shipped this session (round 2, all paired vs `world-fix`, 4 seeds x 60 s)

- `av-aeb.js`: AEB closing-speed awareness for tracked threats (`aebThreatRel`, default on) — only ever RELAXES (need/dec clamped to static semantics; receding threats need no strip; settle to threat speed, not standstill). First attempt that could brake harder for head-on threats FAILED the gate (see plan step-3 notes).
- `av-ego.js` fleeSim: `gapBlockHold` (0.5 s) blocked-persistence + `gapClampBack` (3.5 m) clamp setback — inert in this world (gapWalls off) but fixes the diagnosed bypass for gapWalls worlds.
- `self_hunt_flexible` focus binding: `escapeSwitch: 18` (was default 6) — the churn path here is the score-margin switch, NOT curBlocked. `gapWalls: true` tested and rejected (sig. worse near-time).
- `av-maze-scenarios.test.ts`: 3 PRE-EXISTING failures (turnaround-corridor, flee-wall-ahead, flee-aim-wall) — identical at HEAD, not caused by these changes; `u-mouth-enter` is FIXED by the AEB change. All other suites green (107 passed). `av-maze-params-exposed.test.ts > maneuverRunDecel changes a maze run` is ALSO pre-existing-failing (verified at HEAD). 

## Shipped 2026-10-10 late (round 3)

- **In-play visual indicator for the neural policy** (`av-neural.js`, param `neuralTint`, default on, generated from `src/policyEvolution/policyStage.ts`): while the policy drives (neuralMode auto/always and the net is ON), the car mesh is tinted violet `#aa44ff` (same color as the Builder aim line); on every switch-off / early exit the stage returns `color: null`, which the runtime now RESTORES to the original material color (new generic transformer output: `color: null` = reset; base color stashed on first override in `setMeshColor`). Touched: `src/types/transformer.ts`, `src/transformers/customCodeTransformer.ts`, `src/runtime/renderItemRegistry(.MeshSync).ts`, API docs. Gates: policy.test (stage disk == generator), av-neural.integration + av-neural-v3-world (30 passed after `export-av-neural-example-world.ts`), av-aeb-reverse, exampleWorld.test green; maneuverRunDecel maze test pre-existing-failing.
- **train-ctl CLI** (see handoff-policy-evolution.md) + npm scripts `train`, `train:stop|start|restart|ship`.
- Workflow note from the user: testing happens on LOCALHOST; still deploy to gh-pages after every finished user-visible change.

## Pitfalls (learned today, keep)

- The flee diagnostic needs chaser contact: document-start runs take ~15 s before pressure; use 3600 frames (60 s) per run.
- `AV_FLEE_PARAMS` overrides the binding params of the focus car only — perfect for param sweeps before touching the world file.
- The sandbox approval gate blocks `npm run deploy` and combined `git commit && git push` commands: repeat the same command once to get the user confirmation, or split commit and push.
- Never `pkill -f` with a pattern contained in your own command line (see handoff-policy-evolution.md).
- self_hunt_flexible has NO exporter (hand-maintained world file; do not "regenerate" it). The other AV worlds do — `exampleWorld.test.ts` asserts disk == exporter.
- After stage-code edits in `public/global/transformers/av-stack/`: `npm run sync:global-pipeline`, re-export worlds, run the AV world suites before shipping.
- The v3cap training eats ~700 % CPU: headless vitest suites run ~3x slower while it runs — launch long suites with nohup in the background and poll the log instead of blocking a 300 s tool call (av-neural-v3-world alone takes ~8 min under load).
- The training rewrites `training-data/policy-evolution/v3cap.json` every gen: do NOT `git stash` the whole tree while it runs (conflicts on pop). Commit the checkpoint directly.
- `av-neural.js` is GENERATED from `src/policyEvolution/policyStage.ts` (test asserts disk == `neuralStageFile()`): edit the generator, then `npx tsx tools/policy-evolution/export-av-neural-stage.ts` + `npm run sync:global-pipeline` + `npx tsx tools/renn-mcp/export-av-neural-example-world.ts` for the neural example worlds.
