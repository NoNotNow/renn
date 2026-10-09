# Policy evolution (neuroevolution of a driving policy)

Second approach next to the AV stack tuning in [feature-av-evolution.md](./feature-av-evolution.md): instead of tuning the
parameters of a hand-built sense/plan/control pipeline, a tiny neural policy **is** the controller and an evolution strategy
learns its weights from scratch (the walker-videos approach). Code lives apart from `src/avEvolution/` in `src/policyEvolution/`.

## Idea
`inputs -> tanh(W1 x + b1) -> tanh(W2 h + b2) -> (steer, speed target)`; the genome is the flat weight vector (`GENOME_LENGTH`,
252 numbers: 22 inputs, 10 hidden, 2 outputs). The only code is one custom transformer stage (`POLICY_STAGE_CODE`, a matrix product) in
front of the **unchanged `car2` actuator** (same body and car2 params as the shipped AV car: power 2400, mass 2, steeringSpeed 0.51).

- **Inputs**: 14 ray proximities (`1 - d/50`, dense in front, 180 deg behind), forward / side speed, yaw rate, goal vector in the
  car frame (cos, sin of the bearing, distance/60), previous steer and speed target (the only memory).
- **Outputs**: `steering_angle` (-1..1, car2 treats it as a target wheel angle) and a **target speed** (+30 / -8 m/s).
  A raw pedal does not work: the actuator accelerates at `power / mass` = 1200 m/s^2 per unit pedal, i.e. it is a bang-bang switch. One fixed
  proportional law `pedal = (vTarget - v) / 0.05 s / 1200` (constants in `policy.ts`) is the single piece of "logic".
- **Goal**: a chain of waypoints; the stage targets the first one not yet within 8 m. No planner, no map.

## Known flaw, fixed 2026-10-09 (all earlier field results are void)
The first `field` course was open ground with boxes only in |x| < 35. The fitness counts progress along the route polyline (projection), so the policy learned to swing 50-73 m sideways
and drive AROUND the whole obstacle field (measured: max lateral deviation 50-73 m, never closer than 7 m to a box), yet counted as finished (10/10 on held-out fields). Fix: `field` is now a **closed track**
(side walls at +-19 m, back and end wall, boxes inside, goals within +-8 m of the middle) and every episode ends as `offcourse` (counts like a crash) when the car is more than `OFF_COURSE_M` = 16 m from the route.
The old shipped policy now crashes on all 10 held-out fields after 43-124 m. Runs 1-3 and the numbers below for them were trained / measured on the open field; do not compare with runs after this fix. Slalom and maze were never affected (walls).
Test: `field track is closed` in `src/policyEvolution/episode.test.ts`.

## Courses (`courses.ts`), keys `field:<seed>` / `slalom:<seed>` / `maze:<seed>`
Start at the origin facing -Z, route 400 m along -Z, fully seeded. `field`: open ground, boxes with density growing with distance, wandering goal
chain (start and goals kept clear). `slalom`: corridor narrowing 28 -> 16 m, pillars from alternating sides (55 % of the width), goals in the gaps.
`maze`: seeded 6x6 maze (16 m pitch, generator shared with the AV maze task), start in a south-row cell facing the first route step, goal chain = cell centres along the shortest route to the exit gate (no map: the goal vector is the only hint where the route turns). A blind goal follower with no sensors already reaches ~130 m in a maze.
TRAIN = seeds 1.. of each kind (`--train-per-kind`), HOLDOUT = seeds 1001.. (`--holdout-per-kind`), disjoint; sets interleave the kinds.

## Noise and start variants (since 2026-10-09)
- **Start variants**: a course key `kind:seed~n` is the same course with the n-th seeded random start pose (`courses.ts` `START_JITTER`: field +-6 m / +-25 deg, slalom +-5 m / +-25 deg, maze +-2 m / +-2 m / +-20 deg; the hull is kept clear of every wall, else canonical start). `kind:seed` (variant 0) is the canonical start; example worlds always use it.
- `run.ts` gives every generation its own variants (`variant = generation + 1`, all candidates of a generation share them; `--no-variants` turns it off). TRAIN reports use the canonical start; HOLDOUT keys carry variant 1 (`holdoutCourseKeys(perKind, kinds, variant = 1)`), so the HOLDOUT set is `courses x random start`.
- **Sensor noise**: every ray distance carries 2 % relative noise (`SENSOR_NOISE`, seeded per episode key, applied in the stage via `noise` / `noiseSeed`; example worlds run noise free).
- `ship.ts` also prints a **paired comparison on identical HOLDOUT courses** (mean difference of the normalised score, bootstrap 95 % interval, wins / losses / ties). Differences whose interval contains 0 are noise.
- Baseline for later runs: run-4 gen-390 policy on the new sets (`--train-per-kind 30 --holdout-per-kind 20` = 60 held-out courses with random start + noise): HOLDOUT-60 fitness 1.06, 210 m, 24 / 60 finished; TRAIN-90 (canonical start, with noise) 1.11, 211 m, 37 / 90.

- **Run 5** (random start per generation + 2 % sensor noise, 60-course HOLDOUT, seed 5, stopped at gen 467 by the 2 h background limit, same budget as run 4): best-by-TRAIN gen 400 vs the shipped run-4 gen-390 policy, paired on the 60 identical held-out courses: HOLDOUT fitness 1.052 vs 1.059, 23 vs 24 finished, mean paired difference -0.055 (bootstrap 95 % interval -0.18 .. +0.06; 27 wins / 33 losses). No measurable difference; shipped policy kept. Both runs plateau at TRAIN ~1.1 (about 40 % of courses finished). Randomising the start did not move the plateau by itself; the learning curve was steadier (HOLDOUT 0.95 at gen 80 -> 1.07 at gen 240) but ended at the same level.

## Curriculum, islands, immigrants, crossover (`curriculum.ts`, `islands.ts`, `tools/policy-evolution/run-islands.ts`)
`npm run policy:islands -- --gens 600 --workers 4 --out test-results/policy-evolution/islands.json [--resume]` (flags in the file header; `--islands 1 --no-curriculum` reproduces the single-centre setup for ablations).
- **Field curriculum**: key suffix `@d` (`field:5~3@0.4`) scales box count (x d) and box size (max 4 + 4 d); d = 0 is an empty track (walls and goals only), d = 1 the unchanged course. `curriculum.ts` starts at d = 0 and raises it by 0.05 when the moving average of the route fraction the mean policies cover on field courses passes 0.7 (min 6 generations per step); every field key of a batch draws its d from [current - 0.25, current]. TRAIN / HOLDOUT reports always use d = 1. (First version: start 0.2, gate = field FINISH rate >= 0.5: it never opened - the policy finishes 0 of the sparse fields because it drives straight along the middle and hits the first box in the lane - so the run silently trained on d = 0.2 only. Found at generation 279 of the first islands run, restarted.)
- **Islands**: K independent ES centres (own Adam, own RNG, antithetic pairs per island = `--pairs`) step on the same batches; total cost per generation stays about the same when pairs per island = total pairs / K (default 3 islands x 8 pairs).
- **Epoch (every 25 generations)**: islands are ranked on 36 fresh train courses (full difficulty, new start variants); the best island's mean policy is scored on all TRAIN + HOLDOUT courses (`best` by TRAIN, as before). The worst island **older than 75 generations** is then replaced: 50 % by a **crossover of the two best islands**, 50 % by a new **random immigrant** (young islands are protected so an immigrant can mature).
- **Crossover** works on hidden neurons (block = 22 incoming weights + bias + 2 outgoing weights). Neurons of parent B are first matched to parent A (Hungarian assignment on the activation correlation over 200 plausible sample inputs, sign flip when anti-correlated, because tanh units are permutation- and sign-symmetric); the child takes each hidden neuron from A or from the aligned B (p 0.5), output biases are averaged. Tests prove the alignment recovers a scrambled copy and that crossing a net with its scrambled copy returns the same function, while naive vector crossover does not.

## Episode and fitness (`episode.ts`)
Fresh world per episode, headless `WorldSimulator`, ~0.2-1 s wall per episode (no planner). Ends on **contact** (hull vs. box gap < 0.1 m,
geometric like the maze episodes), **stall** (< 1 m route progress in 3 s), flip, end of the route, or 60 s.
`progress` = arc length along the goal polyline (monotone best, not odometer). **Score = progress x mean speed = progress^2 / time**;
`norm = score / (route length x 10)`. Candidate fitness (`aggregateFitness`) = 0.5 mean + 0.5 mean of the worst quarter of `norm` over the courses.

## Algorithm (`es.ts`) and tooling
OpenAI-ES: antithetic perturbations, centred ranks, Adam on the mean, small weight decay. All candidates of a generation run the same course batch
(common random numbers; a rotating window over TRAIN). Start prior: speed-target bias +0.5 (without it random policies never move and every fitness is 0).

- `npm run policy:evolve -- --gens 200 --pairs 24 --batch 6 --workers 4 --out test-results/policy-evolution/run.json [--resume]`
  (`tools/policy-evolution/`, worker_threads pool). Every `--eval-every` generations the mean policy is scored on all TRAIN and HOLDOUT courses; the
  best by TRAIN is stored as `best.genome` in the output file (HOLDOUT is only reported).
- Tests: `npx vitest run src/policyEvolution` (courses, episode outcomes incl. a hand-wired goal follower, ES on a quadratic).

## Shipped policy and example world
`tools/policy-evolution/ship.ts <run.json> [--train-per-kind N --holdout-per-kind N] [--force]` rounds the best-by-TRAIN mean policy, scores it AND the currently shipped one on the same
courses and rewrites `src/policyEvolution/shippedPolicy.json` only if the candidate has the better HOLDOUT fitness. `npx tsx tools/renn-mcp/export-policy-drive-example-world.ts` writes
`public/exampleWorlds/policy_drive_{field,slalom,maze}/` (File -> Example Worlds; documented in example-worlds.md). State of the shipped policy on the example courses: field:1001 and slalom:1001 finished (405 / 428 m, ~16 s); maze:1001-1004 all crash (142 / 164 / 20 / 96 m).

- Run 1 (12 TRAIN / 12 HOLDOUT courses, 200 gens, ~11 min): TRAIN 2.06, HOLDOUT 1.42 (own 12 courses). Shipped first.
- Run 2 (`--train-per-kind 30 --holdout-per-kind 10`, batch 12, seed 2, 1500 gens, ~4 h on 4 cores, resumed twice after container restarts): TRAIN rose 0.97 (gen 80) -> 1.5 (gen 600-870, plateau) -> ~1.7 (gen 1000+) -> 1.9 (gen 1340); HOLDOUT ~1.45 -> 1.6 (noisy, +-0.1 between evaluations).
- Shipped now: run 2 generation 1340. Compared on the same 60 TRAIN + 20 HOLDOUT courses (fitness / mean progress of 400 m / finished / crashed):
  - HOLDOUT-20: new 1.59 / 336 m / 8 / 12 vs previous shipped 1.38 / 305 m / 7 / 13.
  - TRAIN-60: new 1.89 / 365 m / 29 / 31 vs previous 1.39 / 315 m / 23 / 37.
- Reading: still only ~40 % of unseen courses are driven to the end and every other one ends in a contact (no stalls, no flips). The HOLDOUT gain is within the
  evaluation noise of 20 courses; the TRAIN gain is larger. Course sets this size cannot separate generalisation from selection on TRAIN well; more seeds / a larger HOLDOUT would.
- Run 3 (from scratch, all three kinds: `--train-per-kind 30 --holdout-per-kind 10` = 90 TRAIN + 30 HOLDOUT courses, batch 18, seed 3; fitness values are not comparable with runs 1-2). Shipped at generation 340 of a run in progress (best-by-TRAIN snapshot at gen 351):
  - HOLDOUT-30: new 1.90 / 315 m / 18 finished / 12 crashed vs previous shipped (run 2 gen 1340) 1.70 / 275 m / 14 / 16.
  - TRAIN-90: new 2.01 / 316 m / 59 / 31 vs previous 1.60 / 282 m / 38 / 52 (the previous policy never saw a maze).
- Run 3 stopped at generation 596 when its 2 h background-task limit ran out (state saved, `--resume` continues; not restarted). Re-shipped the best-by-TRAIN snapshot, generation 510:
  - HOLDOUT-30: 1.93 / 322 m / 22 finished / 8 crashed (previous shipped gen 340: 1.90 / 315 m / 18 / 12). TRAIN-90: 2.03 / 318 m / 67 / 23 (previous 2.01 / 316 m / 59 / 31).
  - Per kind on the 10 held-out courses each: field 10/10 finished (404 m mean), slalom 8/10 (426 m), maze 4/10 (136 m mean). Mazes are the weak kind: the policy has no map, only the goal vector.
- Run 4 (after the field fix, from scratch, same sets, seed 4, background task limit 2 h; still running when this interim was shipped): shipped on the user's request as an INTERIM result, run-4 generation 310 (snapshot at gen 363), `ship.ts --force`:
  - HOLDOUT-30 fitness 0.99 / 202 m / 14 finished vs the previous shipped (trained on the open field) 1.05 / 211 m / 12 finished; TRAIN-90 1.08 / 210 m / 41 finished vs 1.06 / 209 m / 37. By HOLDOUT fitness it is not better, which is why `--force` was needed.
  - Per kind, 10 held-out courses each: **field 0/10 finished (mean 71 m)**, slalom 10/10 (429 m), maze 4/10 (106 m). The closed field is the hard kind now (dense boxes, no way around); the earlier "field 10/10" was the bypass.
  - Example courses: field:1001 crash 87 m, slalom:1001 finish, maze:1001 crash 100 m, maze:1002 finish 203 m, maze:1003 crash 20 m, maze:1004 finish 155 m.
- Run 4 final: stopped at generation 457 by the 2 h background-task limit (state saved, `--resume` continues, not restarted). Shipped the best-by-TRAIN snapshot, generation 390 (`ship.ts`, better on HOLDOUT than the interim gen 310):
  - HOLDOUT-30: 1.10 / 213 m / 14 finished (interim: 0.99 / 202 m / 14); TRAIN-90: 1.11 / 210 m / 38 finished (interim 1.08 / 210 m / 41).
  - Per kind, 10 held-out courses each: field 0/10 finished (mean 78 m), slalom 9/10 (428 m), maze 5/10 (134 m). Progress has flattened around TRAIN ~1.1 since gen ~300; the closed field (dense boxes, no bypass) is not solved by the reactive policy yet.
- A background run started with `nohup` / detached dies when the session idles; use the harness background task (Bash run_in_background) and `--resume` (state is saved every generation).

## Experiment cost and screening protocol (measured 2026-10-09)
- Per core the simulation already runs ~70-120x real time (`tools/policy-evolution/bench.ts`): world build ~5 ms per episode; per simulated
  second ~6 ms transformers (of which Rapier `castRay` for the 14 rays is the largest single part, ~25 % of all CPU), ~4 ms physics step,
  ~4 ms episode checks. Episodes are short: perturbed policies average ~6 sim s (crash 5.5 s, finish 9.8 s; no stall/timeout seen;
  `tools/policy-evolution/bench-es.ts`). So code tuning can win at most ~1.3x (decision rate 20 Hz instead of 60 would save ~20 %, but
  changes behaviour); the cost of a run is simply ~900 episodes x ~600 generations.
- The lever is the protocol: runs reach ~95 % of their final level by generation 100-150 (run 4 TRAIN 1.00 at gen 100 vs 1.10 at 400; run 5 1.01 vs 1.12).
  **Screening runs: `--gens 150` (~40 min on 4 cores), several seeds per configuration**, compared with
  `npx tsx tools/policy-evolution/compare.ts --group A a1.json a2.json --group B b1.json b2.json [--group shipped]` (every run's best on the same
  HOLDOUT courses; per run fitness + finish rate per kind, per group mean / sd / range). Only the winner gets a long run.

## v2: command chains (implemented 2026-10-09, spec: [spec-command-chains.md](./spec-command-chains.md))
The net follows a DYNAMIC target vector instead of memorising courses. v1 (16 inputs, `goals`, `shippedPolicy.json`, example worlds) is untouched.
- **Setup / chain / episode key:** setup = geometry + start (`kind:seed[~variant][@difficulty]`, kinds `field slalom maze crowd`; chain setups use
  `field@0.3` (`CHAIN_FIELD_DIFFICULTY`) and island-slalom geometry via `buildSetupCourse`); chain = waypoints start -> end (`chains.ts`, `chainsForSetup`);
  episode key `<setupKey>#<chainIndex>`. Listing: `trainChainEpisodes(perKind, kinds)` (seeds 1..) / `holdoutChainEpisodes` (seeds 1001.., variant 1) return
  `{ setupKey, keys }[]` grouped by setup (`flattenChainKeys`). Rejected setups (< 2 chains) are skipped deterministically.
- **Generation (`chains.ts`):** 1 m grid, obstacles inflated by car half width + margin (open kinds 2.5 m, maze 1.5 m), 2-4 end targets, A* per end (comfort cost
  away from obstacles), alternatives via penalty field + seeded cost noise, string-pull, Douglas-Peucker, corner rounding (radius 12 / 10 m, a chain
  is rejected if a corner stays tighter than `MIN_TURN_RADIUS` = 6 m: the car's tightest circle is ~10 m), resample <= 10 m. Accepted only if exact clearance
  holds, length <= 1.8 x shortest, symmetric Hausdorff >= 10 m to all accepted chains. Measured on seeds 1-8: 2.6-4.0 chains per setup (slalom 4.0, field 2.9, crowd 2.6, maze 2.8).
- **Policy v2 (`policy.ts`):** `POLICY_STAGE_CODE_V2`, `policyForwardV2`, `GENOME_LENGTH_V2` = 272 (24 inputs), `padV1Genome` (v1 -> v2, identical outputs).
  The stage reads `input.av.cmd = { aim, next }` or derives the command from `params.chain` + `params.cmd` (`cmdConfigFor(key)`: Lmin 6-10 m, T 0.4-0.8 s, refresh
  0.2-0.8 s, bearing noise 3 deg; the spec's 10-20 m / 1-2 s made a pure-pursuit follower cut every corner).
- **Episode (`episode.ts`):** `runPolicyEpisode(v2Genome, '<setup>#<i>')`; progress along the commanded chain (`RouteProgress` over the chain points), `offcourse` > `OFF_CHAIN_M` = 6 m,
  90 s limit, norm per chain length (`metrics.length`). `opts.stageChain` commands a different chain than the scored one (exploit tests).
- **Fitness (`es.ts`):** `aggregateEvenness(metrics)` (needs `key`): setupScore = 0.5 mean + 0.5 min over its chains; fitness = 0.5 mean + 0.5 worst-quarter mean over setups.
  `aggregateFitness` stays for v1. `PolicyEs` / `IslandEs` take the fitness function as an optional last constructor argument; island helpers work for 16 and 24 inputs.
- **Solvability baseline (`handWired.ts` `pursuitV2`, test in `chains.test.ts`):** hand-wired pure pursuit finishes slalom 100 %, field 88 %, crowd 86 %, maze 92 % of the chains
  (first 5 setups per kind). Getting there needed: lookahead 6-10 m, clearance margin 2.5 m (open kinds), filleted corners and the turn-radius rejection above.
- **Run:** `npx tsx tools/policy-evolution/run-islands.ts --v2 --warm src/policyEvolution/shippedPolicy.json --batch 6 --gens 600 --workers 4 --out test-results/policy-evolution/v2.json`
  (`--batch` = SETUPS per generation, all their chains are driven; `--warm FILE` = v1 genome padded, or a v2 genome / run file, applied to every island centre;
  `--kinds field,slalom,maze,crowd`; `--train-per-kind` 8 / `--holdout-per-kind` 5 setups; field curriculum capped at 0.3; `--resume` keeps the mode).
  `ship.ts <run.json> --v2` and `compare.ts --v2 --group ...` use chain episodes + evenness and print per kind: chain finish rate, setups with all chains finished, offcourse, crashes.
  `ship.ts --v2` writes `src/policyEvolution/shippedPolicyV2.json`. `run.ts` (single ES) has no `--v2`.
- Not done: example worlds / AV integration for v2, dynamic obstacles, a real training run (only 2-3 generation smoke runs so far).

## Not done yet
Browser panel / live playback per generation, MCP tools, comparison against the evolved AV pipeline on the same courses.
