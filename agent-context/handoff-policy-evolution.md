# Handoff: neural driving policy (v1 → v2 → v3), state 2026-10-10 ~13:00 UTC (local Mac)

Moving from the cloud session to a LOCAL session on the user's Mac (more cores, no 2 h background limit, no container restarts).
Branch `claude/autonomous-car-evolution-9p6zt2` (far ahead of `main`; `npm run deploy` publishes the whole branch state to GitHub Pages).
**Rule (always on):** after every finished user-visible step run tests, commit, push and `npm run deploy`, then tell the user what to look at
(`.cursor/rules/deploy-after-each-step.mdc`). The user verifies only via the live site. The user asked for regular push + deploy.

Read in this order: this file → [spec-command-chains.md](./spec-command-chains.md) (v2 + v3 design, lessons) →
[feature-policy-evolution.md](./feature-policy-evolution.md) (all measured results, newest at the end) →
[plan-policy-in-av-car.md](./plan-policy-in-av-car.md) (AV integration plan, Phases 0-5) → AV "Neural drive mode" section in `feature-av-stack.md`.

## Goal (user)
A small neural net (vector math, minimal logic) that follows a DYNAMIC target-direction vector (no speed command, ONLY direction),
drives forward AND backward, with EVEN performance across all kinds of worlds (evenness is rewarded), later used inside the AV car in
mazes and crowded situations. Work focused, good tests, learn from past mistakes; token budget is limited, compute is not.

## Generations of the net
- **v1** (`shippedPolicy.json`): 22 inputs, fixed waypoint goals. Worlds `policy_drive_{field,slalom,maze}`. Superseded.
- **v2** (`shippedPolicyV2.json`, H=10): 24 inputs = 14 rays, fwd/side speed, yaw rate, aim cos/sin/dist, next-segment cos/sin, prev steer/gas.
  Trained on setups × several target-vector chains, evenness fitness. HOLDOUT ~70-77 % chains. **Promoted into the AV car** as
  `avNeuralWeights.json` (AV reads ONLY this file; promotion requires the AV A/B gate). Forward-only driver (full throttle).
- **v3** (`shippedPolicyV3.json`, H=24, from scratch): same inputs, chains of LEGS incl. reversals, stand-still stall rule, leg-wise
  progress, free-track pretraining → obstacle curriculum (free, bay, corridor, slalom, crowd, field, maze), kind-evenness fitness
  (0.5 mean + 0.5 min over kinds) with failed episodes counting 0.5 (`V3_FAIL_FACTOR`). Shipped: run v3 gen ~700. Worlds `policy_v3_{free,bay,corridor}`.
  HOLDOUT of the shipped v3: bay 16/18 (reverses 80 % of the time), corridor 17/18, free 22/24, maze 12/15, slalom 19/23, crowd 10/19, field 9/20.
  **Weak kinds now: field and crowd (~50 %, crashes).** v3 is NOT in the AV car yet.

## Run state handed over (TRACKED in git: `training-data/policy-evolution/`)
- Shipped v3 = `v3.json` gen 1000 (commit 3774e50e). HOLDOUT finished 114/137 (free 24/24, bay 17, corridor 16/18, field 13/20, slalom 19/23,
  maze 11/15, crowd 14/19). Weakness (diagnose-v3.ts): never brakes, ~27.5 m/s, field/crowd losses are forward crashes.
- `v3.json` = uncapped run, **stopped cleanly at gen 1500** (commit f76a5390), resumable with `tools/policy-evolution/run-v3.sh 3000 7`.
  Ship check of its best (gen 1425) with the finish-count gate: **KEEP**, 107 vs 114 finished (field -2, slalom -3, crowd -4 WORSE; bay +1, corridor +2).
- `v3cap.json` = **speed-capped fork, running** (warm start from v3 gen 1500, `--speed-cap 15`, gen counter and curriculum restart at 0, target 3000,
  7 workers, log `v3cap.nohup.log` / `v3cap.log`, both git-ignored). Commit `v3cap.json` regularly (first checkpoint d50aff8e). Local Mac session: running since 2026-10-10 ~15:45, resumed at gen 1515 after the ship check below.
  - Ship check 2026-10-10 evening at **gen 1515**: **KEEP** — candidate fails the HOLDOUT finish-count gate on kind `free` (88 % vs 100 % finished; TRAIN looks strong but HOLDOUT free is clearly worse than tolerance). No policy written; training restarted, next check ~gen 1800-2000 or after 1-2 h more.
  - Ship check 2026-10-10 late at **gen 2630**: **KEEP** — HOLDOUT total finished 109 is NOT strictly higher than shipped 114, and kind `maze` is clearly worse than tolerance. No policy written; training restarted at gen 2630/3000. Next check near the gen-3000 target (or on a strong TRAIN/HOLDOUT trend before that). Smart integration stays blocked until a WROTE.
  - **train-ctl CLI (control the training)**: `npm run train` (= status: what runs, why, current gen, CPU, pids; also shows the vite dev server), `npm run train:stop` (stops right after a gen line — the state saves every finished gen), `npm run train:start` (the documented resume command), `train:restart`, `train:ship` (stop -> ship.ts gate -> start, verdict printed). This REPLACES the raw nohup command in handoff-flee-improvements.md.
- All earlier runs + logs are copies for reference (run1-5, islands1-2 = v1; v2a, v2b, h10/h24 = v2 screening). `test-results/` stays git-ignored.

## Local workflow (Mac)
```
git pull && npm ci
npx tsx tools/policy-evolution/bench.ts --per-kind 10            # per-core speed (cloud Xeon 2.1 GHz: ~12-14 ms per sim s under load)
tools/policy-evolution/run-v3.sh 3000                            # resumable; workers = cores-1; Ctrl+C any time, re-run to continue
npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3.json --v3 --workers 8   # writes shippedPolicyV3.json only if the HOLDOUT FINISH-COUNT gate passes (see below)
npx tsx tools/renn-mcp/export-policy-drive-example-world.ts       # after a ship: re-export the policy worlds
npx vitest run src/policyEvolution                               # must be green before commit
git add -A training-data src/policyEvolution/shippedPolicyV3.json public/exampleWorlds && git commit && git push && npm run deploy
```
Capped fork (start / resume, same command; stop with kill of the run-v3.sh/run-islands processes right after a `gen N` log line, state is saved each gen):
```
V3_OUT=training-data/policy-evolution/v3cap.json V3_EXTRA_ARGS="--speed-cap 15 --warm training-data/policy-evolution/v3.json" \
  nohup bash tools/policy-evolution/run-v3.sh 3000 7 > training-data/policy-evolution/v3cap.nohup.log 2>&1 &
npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3cap.json --v3 --workers 9   # stop training first (uses all cores, ~15 s)
```
The ship gate measures uncapped episodes; the finish-count gate is fair for capped nets (finishing is what counts, not speed).
Commit `v3.json` / `v3cap.json` regularly so runs can move between machines.

## Next steps (in order)
1. Let `v3cap` train; ship check every ~1-2 h (stop training briefly, or run with `--workers 2`). If WROTE: re-export worlds, vitest, commit, push, deploy.
2. Compare v3cap vs uncapped on field/crowd (crash counts, `diagnose-v3.ts`). Uncapped v3 regressed after gen 1000 on field/slalom/crowd holdout,
   so resuming it is lower priority.
3. If field/crowd still plateau: more field/crowd setups, curriculum on density, capacity.
4. v3 into the AV car: promote only through the AV A/B gate (crowd cases `AV_NEURAL_AB=1 npx vitest run src/test/scenarios/av-neural-ab.diagnostic.test.ts`,
   mazes `AV_NEURAL_MAZE_AB=1 npx vitest run src/test/scenarios/av-neural-maze-ab.diagnostic.test.ts`). The AV stage infers H from the weight length and
   uses the v2 command (no legs); v3 reversing inside the AV needs the AV-side command to allow backward aims and the AV stage to stop excluding
   manoeuvres — plan written: plan-policy-in-av-car.md section 8 (v3 forward-only + speed cap first, reverse later; 5 open questions).
5. Open from earlier: in AV mazes the watchdog hands back on 34 of 37 handovers (auto: 1 contact vs 0) → `av_maze_escape` stays off.

## Lessons / pitfalls (keep)
- Fitness gaming is the main failure mode: open field driven around (v1), fast-and-crash scoring like finishing (v3 bay). Ask for every new
  setup or fitness: can it be scored without doing the task? Check per-kind finish rates, not just fitness.
- After a fitness change, a resumed run's stored `best.train` is on the old scale: reset it (set `best.train = -1` in the run file while the run is stopped).
- Training vs runtime mismatch: the AV speed cap of 12 m/s made the v2 net stall (fixed: default `neuralVMax` 30). Compare input statistics.
- The AV library and example worlds carry stage params: `npm run sync:global-pipeline` refreshes code AND the neural weights (`upgrade-example-worlds-library.ts`).
- `exampleWorld.test.ts` checks disk == exporter: re-export after every stage-code or weight change. Camera `thirdPerson`.
- Never `pkill -f` with a pattern contained in your own command line; use `pkill -f "[v]ite --port NNNN"` as a separate command.
- Single runs vary; decide with `compare.ts` / `ship.ts` (paired, HOLDOUT) and screening runs (150 gens, several seeds) before long runs.
- Delegating to subagents worked well with a written spec + "max N lines" reports + "commit early" (cloud restarts killed agents twice).

## Ship gate (v3, `src/policyEvolution/shipGate.ts`, used by `ship.ts --v3`)
Decides on HOLDOUT finish count, not fitness: ship only if (1) candidate total finished > shipped total (strictly) and (2) per kind
cand finished >= shipped finished - max(1, ceil(5 % of n)) (`kindTolerance`). Fitness is printed for reference only. 1-episode drops
(e.g. corridor 17->16) are tolerated, 2 of 18 are not. Unit tests: `src/policyEvolution/shipGate.test.ts`. `--force` still overrides.

## v3 in the AV car: what exists (2026-10-10)

- Stage params `neuralPolicy` (v2|v3, default v2), `neuralReverse` (false), `neuralRevMaxM` (12); `av.neural.dir` / `revM`; AEB probes from the rear when reversing (positive stopping u). Details: [feature-av-stack.md](./feature-av-stack.md).
- World `av_neural_v3` (regenerate: `npx tsx tools/renn-mcp/export-av-neural-example-world.ts [av_neural_v3]`, then `npm run sync:global-pipeline`); on-disk-equals-exporter test + headless run in `src/test/scenarios/av-neural-v3-world.test.ts`.
- To judge a candidate: A/B arm `v3` in `av-neural-ab.diagnostic.test.ts` / `av-neural-maze-ab.diagnostic.test.ts` with `AV_NEURAL_V3_WEIGHTS=<run json>` (not run in CI, not run yet).

## NEW TASK from the user (posted in the cloud session): improve the fleeing car in `self_hunt_flexible` — MOVED to [handoff-flee-improvements.md](./handoff-flee-improvements.md)
The local session of 2026-10-10 activated the diagnostic (`src/test/scenarios/av-flee.diagnostic.test.ts` + `tools/av-flee-compare.mjs`), wrote the diagnosis + fix plan
(`plan-flee-improvements.md`), shipped the classic world-param fix (mean speed 10.1 -> 20.8 m/s, deployed) and parked the remaining gated stage fixes + neural-v3 integration
in the new handoff. This section is kept for the original task statement (weaknesses 1-4, wanted A/B) — read the new handoff for the current state.
