# Handoff: neural driving policy (v1 → v2 → v3), state 2026-10-10 ~12:00 UTC

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
- `v3.json` = the live v3 run (islands state, curriculum stage share 0.7, all 7 kinds active), at **generation 1025**; best snapshot
  gen 1000 (TRAIN 1.18 / HOLDOUT 1.10 under the CURRENT fitness). Not yet compared with the shipped v3 → **first thing to do: ship check**.
- All earlier runs + logs are copies for reference (run1-5, islands1-2 = v1; v2a, v2b, h10/h24 = v2 screening). `test-results/` stays git-ignored.

## Local workflow (Mac)
```
git pull && npm ci
npx tsx tools/policy-evolution/bench.ts --per-kind 10            # per-core speed (cloud Xeon 2.1 GHz: ~12-14 ms per sim s under load)
tools/policy-evolution/run-v3.sh 3000                            # resumable; workers = cores-1; Ctrl+C any time, re-run to continue
npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3.json --v3 --workers 8   # writes shippedPolicyV3.json only if better (kind evenness, HOLDOUT)
npx tsx tools/renn-mcp/export-policy-drive-example-world.ts       # after a ship: re-export the policy worlds
npx vitest run src/policyEvolution                               # must be green before commit
git add -A training-data src/policyEvolution/shippedPolicyV3.json public/exampleWorlds && git commit && git push && npm run deploy
```
Commit `training-data/policy-evolution/v3.json` (+ `v3.log`) regularly so the run can move between machines.

## Next steps (in order)
1. Ship check of v3 gen 1000 vs shipped (command above); if written: re-export, test, commit, push, deploy, report per kind + reverse usage.
2. Keep training (`run-v3.sh`), ship check every ~1-2 h of training, deploy when better. Watch the min kind (field/crowd).
3. If field/crowd plateau: diagnose where episodes end (trace like the v1 field analysis) before changing anything; candidates: more
   field/crowd setups, curriculum on field density, capacity.
4. v3 into the AV car: promote only through the AV A/B gate (crowd cases `AV_NEURAL_AB=1 npx vitest run src/test/scenarios/av-neural-ab.diagnostic.test.ts`,
   mazes `AV_NEURAL_MAZE_AB=1 npx vitest run src/test/scenarios/av-neural-maze-ab.diagnostic.test.ts`). The AV stage infers H from the weight length and
   uses the v2 command (no legs); v3 reversing inside the AV needs the AV-side command to allow backward aims and the AV stage to stop excluding
   manoeuvres — plan it first (plan-policy-in-av-car.md, Phase 5).
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
