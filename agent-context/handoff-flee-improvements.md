# Handoff: flee-improvement + v3cap training, state 2026-10-10 ~16:30 local (Mac)

For the next agent. Branch `claude/autonomous-car-evolution-9p6zt2` (far ahead of `main`; `npm run deploy` publishes to GitHub Pages; user verifies only on the live site).
**Rule (always on):** after every finished user-visible step: tests, commit, push, `npm run deploy`, then tell the user what to look at (`.cursor/rules/deploy-after-each-step.mdc`).
Read in: this file -> [plan-flee-improvements.md](./plan-flee-improvements.md) (diagnosis, root causes, measured results, remaining fix plan) -> [handoff-policy-evolution.md](./handoff-policy-evolution.md) (v1->v2->v3 policy background, ship gate, workflow).

## Where things stand

Two work streams were running in parallel today; both are mid-flight:

1. **v3cap training** (speed-capped fork, `--speed-cap 15`, target gen 3000): RUNNING in the background, ~gen 933 and climbing (PID of run-v3.sh may differ per machine; check `ps aux | grep run-islands`). Log: `training-data/policy-evolution/v3cap.log`, state file `v3cap.json` (tracked; commit it regularly — the working tree has an uncommitted checkpoint).
   - Next: ship check at ~gen 1200-1500 or after ~1-2 h more of training: stop the training processes right after a `gen N` log line (state saves each gen), then `npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3cap.json --v3 --workers 9`, then restart training with the same command. If WROTE (finish-count gate): re-export worlds (`npx tsx tools/renn-mcp/export-policy-drive-example-world.ts`), `npx vitest run src/policyEvolution`, commit, push, deploy.
   - Resume command (same for start/resume): `V3_OUT=training-data/policy-evolution/v3cap.json V3_EXTRA_ARGS="--speed-cap 15 --warm training-data/policy-evolution/v3.json" nohup bash tools/policy-evolution/run-v3.sh 3000 7 > training-data/policy-evolution/v3cap.nohup.log 2>&1 &`

2. **Flee improvement in `self_hunt_flexible`** (the user's NEW task from the cloud session — diagnosis + classic fixes DONE and deployed, stage fixes open):
   - Diagnostic harness ACTIVE: `src/test/scenarios/av-flee.diagnostic.test.ts` (env-gated: `AV_FLEE_DIAG=1 AV_FLEE_SEEDS=1,2,3,4 AV_FLEE_FRAMES=3600 AV_FLEE_NAME=<name> [AV_FLEE_PARAMS='{"k":v}' | AV_FLEE_TRACE=1]`; per-run json in `test-results/avflee/`) + paired compare `node tools/av-flee-compare.mjs base <variant> --dir test-results/avflee`. Baseline = `base`, post-fix = `world-fix` (already includes the new world params; identical numbers to `v-combo`).
   - Root causes (all four weaknesses measured + traced in plan-flee-improvements.md): comfort-style manoeuvre shuffle 3 m/s (no `style: escape`), AEB braking to standstill on moving chasers AND before the speed planner (`chasedDecel` 9 > `aebDecel` 7), stopped -> `wantManeuver` -> shuffle cascade, gap-goal churn via `curBlocked` bypassing the `escapeSwitch` hysteresis + clamp into the inflated wall.
   - Fix SHIPPED (world params only, commit ac7d745e, deployed): `style: escape`, `runTotal: true`, `mazeManeuverSpeed: 4.5`, `chasedDecel: 7`, `escapeEvalEvery: 0.6`, `gapWallMin: 40` in the focus binding of `public/exampleWorlds/self_hunt_flexible/world.json`. Measured (paired, 4 seeds): mean speed 10.1 -> 20.8 m/s, chaser<30 m time 47 -> 10.5 %, manoeuvre time 43 -> 12.7 %, slow episodes 31 -> 8 %, bad goals 39 -> 25 %, catches 1.0 -> 0.25/run. World tests green (hunt-game, hunt-game-score, av-maze-profile: 11/11).

## Next steps (flee, in order)

1. **Ask the user how it looks on the live site** (`self_hunt_flexible`); the numbers say the four observed weaknesses are much reduced, but the user is the acceptance gate.
2. **Stage fix A (gated): AEB closing-speed awareness** (`public/global/transformers/av-stack/av-aeb.js`): for a hit that is a tracked threat (`av.threats` carry vx/vz), size `need` by the CLOSING speed along the probe ray, not own speed; keep static-wall semantics for everything else. Gate: paired av-flee diagnostic + regression suites of the other AV worlds that share the stage code (`av_maze_escape`, `av_fleet_eco`, `self_drive_av`, touching-side / av-stack integration tests), `npm run sync:global-pipeline` after the edit, re-export example worlds, `exampleWorld.test.ts`.
3. **Stage fix B (gated): gap-goal switch hysteresis** (`av-ego.js` `fleeSim()` ~line 1524): `curBlocked` must persist (e.g. 0.5 s) before the committed goal is replaced; clamp `Dg` to `run - hull inflation - 1` (not `run - 3`, which lands inside the 2.5 m inflated wall). Target: `fleeSwitchAgeMedian` (still 1.4 s, unchanged by the param fix) and `badGoalShare` (still 25 %). Same gates as A.
4. **Then the smart integration** (per plan-policy-in-av-car.md §8): AV logic sets target-direction vectors for the neural v3 net (forward + reverse) in mazes / dense chaser packs / instead of the slow manoeuvre mode; hand-over, fallback, training changes (chasers / moving obstacles), A/B gate (`AV_NEURAL_V3_WEIGHTS` + `av-neural-ab` / `av-neural-maze-ab` diagnostics) before enabling. This waits for a good v3 ship (see 1).

## Pitfalls (learned today, keep)

- The flee diagnostic needs chaser contact: document-start runs take ~15 s before pressure; use 3600 frames (60 s) per run.
- `AV_FLEE_PARAMS` overrides the binding params of the focus car only — perfect for param sweeps before touching the world file.
- The sandbox approval gate blocks `npm run deploy` and combined `git commit && git push` commands: repeat the same command once to get the user confirmation, or split commit and push.
- Never `pkill -f` with a pattern contained in your own command line (see handoff-policy-evolution.md).
- self_hunt_flexible has NO exporter (hand-maintained world file; do not "regenerate" it). The other AV worlds do — `exampleWorld.test.ts` asserts disk == exporter.
- After stage-code edits in `public/global/transformers/av-stack/`: `npm run sync:global-pipeline`, re-export worlds, run the AV world suites before shipping.
