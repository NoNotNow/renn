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
  0.2-0.8 s, bearing noise 3 deg; the spec's 10-20 m / 1-2 s made a pure-pursuit follower cut every corner). The chain projection is anchored at the car CENTER in v2;
  v3 stages (and the AV neural stage with `neuralPolicy: 'v3'`) project at the car's LEADING edge in the direction of travel — the nose,
  center + fwd * `NOSE_M` (4.1 m, the ray-sensing front edge) when driving forward, the tail (center - fwd * `NOSE_M`) when reversing
  (hysteresis at +-0.5 m/s, `state.aRev`), so the command leads the steering reference; v1/v2 stay center-anchored.
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
- **Hidden size H (`--hidden N`):** a v2 genome has 27 H + 2 numbers (272 = H 10); H is inferred from the length everywhere (`hiddenOfV2`, `policyForwardV2`, training stage `hiddenOf(w)`, AV neural stage; a non-integer H = refuse/off).
  `widenHidden(genome, newH, rng)` keeps the function exactly (new units: zero outgoing weights, incoming std 0.1). `run-islands.ts --v2 --hidden N`: with `--warm` the warm genome (v1 padded) is widened to N, without it random init with N;
  crossover/immigrants use the run's H. `ship.ts --v2` prints H of candidate and current `shippedPolicyV2.json` (a different H may replace it when better); `compare.ts --v2` prints `H=` per run and can mix sizes.
  Screening: `run-islands.ts --v2 --warm src/policyEvolution/shippedPolicyV2.json --hidden 24 --train-per-kind 40 --holdout-per-kind 10 --batch 6 --gens 150 --workers 4 --seed S`.
- Not done: example worlds / AV integration for v2, dynamic obstacles, a real training run (only 2-3 generation smoke runs so far).

## Not done yet
Browser panel / live playback per generation, MCP tools, comparison against the evolved AV pipeline on the same courses.

## v2 run "v2a" (2026-10-10): first command-chain result
- `run-islands.ts --v2 --warm shippedPolicy.json --batch 6 --seed 11`, 558 generations in the first 2 h (resumed afterwards). HOLDOUT chains finished
  (epoch evaluations): 16/65 (gen 25) -> 34/65 (150) -> 48/65 (300) -> ~48/65 plateau (300-550); TRAIN 21/97 -> 71/97.
- Shipped as `shippedPolicyV2.json` (best by TRAIN, gen 400): paired HOLDOUT vs the padded v1 net: 62 wins / 15 losses, mean diff CI95 +0.94..+1.43.
  Per kind on 10 HOLDOUT setups each (all chains): field 24/32 chains (75 %, all chains of a setup 4/10), slalom 29/37 (78 %, 3/10),
  maze 16/28 (57 %, 2/10), crowd 18/28 (64 %, 3/10). Evenness is the weak part: only 12/40 setups have every chain finished.
- **Inside the AV car the v2 net is NOT better yet**: crowd A/B (`AV_NEURAL_AB=1 npx vitest run src/test/scenarios/av-neural-ab.diagnostic.test.ts`)
  with v2 weights: `always` reaches 4/4 without contact but 15-28 s vs classic 9-16 s, with 7-9 s stalled; `auto` slower than classic, and the
  `av_neural_crowd` world did not reach its goal in time. So the AV library does NOT read `shippedPolicyV2.json`; it reads a separately promoted
  `avNeuralWeights.json` (absent => padded v1). `upgrade-example-worlds-library.ts` now also refreshes the neural stage's `w` param in the example worlds.
- **Root cause of the slow v2 in the AV (2026-10-10):** the AV stage capped the target speed at `neuralVMax` 12 m/s, training never caps (vT up to 30, net outputs gas ~1 all the time). The pedal law then holds only ~9.3 m/s (net sees speed 0.31 forever with gas memory 1), mean speed 6-8 m/s vs classic 14-18, and after the goal the 12 m/s variant sat stalled 7-9 s. With `neuralVMax` 30: `always` 4/4, 0 contacts (16.3/12.1/8.6/13.6 s), `auto` 4/4 0 contacts total 48.4 s vs classic 48.6 s. Default is now 30; v2 weights promoted as `avNeuralWeights.json`. No retraining needed.
- v2a continued to generation ~1010 (second 2 h block, then stopped, not restarted): HOLDOUT chains stayed at 45-52/65 since gen ~300 while TRAIN rose
  to 72-77/97 (overfitting to the TRAIN setups). Best by TRAIN (gen 950) vs the shipped gen-400 policy, paired on HOLDOUT: 35 wins / 42 losses, mean
  slightly higher -> not clearly better; the shipped (and AV-promoted) gen-400 policy was KEPT. More of the same training does not help; the next
  lever is more / more varied TRAIN setups (generalisation gap) or capacity, decided by screening runs.

## v3 (2026-10-10): forward AND backward, free-track pretraining (spec: [spec-command-chains.md](./spec-command-chains.md), section v3)
Same 24-input direction-only net, trained FROM SCRATCH (no warm start). Episode key `<setup>#<i>v3` (v2 keys are untouched).
- **Leg-wise progress (`legs.ts`)**: chains are split into legs (`Chain.legEnds`); leg advances within `reach` (2.5-5 m) of its end; progress = finished legs + projection on the CURRENT leg; offcourse = distance to the current leg (`Chain.offM`: free 20 m, bay/corridor 8 m, v2 kinds 6 m). The tracker is one JS string used by the episode AND the stage (`POLICY_STAGE_CODE_V3`), v2 kinds are one-leg chains. Since the v3 leading-edge anchor the episode tracker receives the car's LEADING edge in the direction of travel (nose forward, tail reversing, hysteresis at +-0.5 m/s — `NOSE_M` 4.1 m), like the stage command; legs complete when the LEADING edge is within reach, so a leg between two corners can lose up to ~2 x (4.1 + reach) m of center travel (short stop-and-go legs complete with centimetres of reversing).
- **Stall**: stand-still (|v| < 0.5 m/s for 3 s) or no 1 m progress for 10 s; contact still ends the episode. Metrics carry `reverseShare`, `maxReverseM`.
- **Setups**: `free` (200 x 200 m closed arena, 4 seeded chains of 6-12 legs: forward / reversal 5-20 m / lateral / stop-and-go; chain 1 starts with a reversal), `bay` (13 m wide, 20-32 m deep dead end; chains: in, back out, on to one of 3 exits), `corridor` (13 m wide, closed both ends; forward-back-forward, back-first, stop-and-go). The car's turning radius is ~10 m, so none of these can be turned in.
- **Hand-wired check** (`reverserV3` vs `pursuitV2`, first setups): bay reverser 100 % / forward-only 0 %, corridor 100 % / 0 %, free 90 % (18/20) vs ~56 % (U-turns on open ground, slower: 28 s vs 20 s).
- **Fitness**: `aggregateKindMin` (weakest link: MIN over all episode values of the batch — the worst run decides; per-episode value = peakNorm x speed-cap, x V3_FAIL_FACTOR on failure). Batches are stratified per active kind (`--batch` = setups per kind, default 1). Stage curriculum: free track only until its chain finish rate EMA >= 0.7, then the share rises 0.1 per step to 0.7, adding bay, corridor, slalom, crowd, field, maze (`--no-stage` = all from the start).
- **Run**: `npx tsx tools/policy-evolution/run-islands.ts --v3 --hidden 24 --batch 1 --gens 600 --workers 4 --out test-results/policy-evolution/v3.json` (`--resume`). Evaluate: `compare.ts --v3 --group A run.json ...`, ship: `ship.ts run.json --v3` (writes `shippedPolicyV3.json`); both print per kind finish rate, all-finished setups and REVERSE USAGE.
- Smoke (3 generations, fresh H=10 nets, free track only): island centres 0.04 / 0.02 / 0.02 -> 0.04 / 0.03 / 0.03: small but non-zero and varying, so no extra start prior was added (random genomes already get the +0.5 speed bias of `freshGenome`).
- Capacity screening (2026-10-10, v2, warm from shippedPolicyV2.json, 160 TRAIN setups, 150 gens, 2 seeds each), HOLDOUT 125 chain episodes:
  H=10 fitness 1.52 / 1.57 (finish 77 %), H=24 1.49 / 1.54 (78 %), shipped 1.42 (70 %). No capacity effect when warm-started (the new units start
  silent); the run-vs-shipped gap is within selection noise. v3 is trained from scratch with H=24 (the manoeuvre task is harder; untested choice).
- v3 first interim (2026-10-10, run `v3`, H=24 from scratch, seed 21): gen 430 after ~63 min, stage share 0.7 (all 7 kinds active). Shipped gen 400 as
  `shippedPolicyV3.json` (worlds `policy_v3_*` re-exported). HOLDOUT per kind (chains finished / reverse share of time / max reverse): free 23/24 (50 %, 131 m),
  corridor 14/18 (38 %, 26 m), slalom 18/23 (1 %), field 12/20 (1 %), crowd 12/19 (1 %), maze 10/15 (4 %), **bay 0/18 (all crash, reverses only 2 m)**.
  The net reverses where it pays (free, corridor) and drives forward elsewhere; the dead-end bay is unsolved so far.
- v3 fitness fix (79eda6e): failed episodes keep `V3_FAIL_FACTOR` = 0.5 of their norm. Before, a policy that drove fast into every bay and crashed (bay 0/18)
  beat one that finished 16/18. Re-shipped run v3 gen ~700 (HOLDOUT kind-evenness 0.995 vs 0.862): bay 16/18 (reverse 80 % of the time, max 90 m),
  corridor 17/18, free 22/24, maze 12/15, slalom 19/23, crowd 10/19, field 9/20. Field and crowd are now the weak kinds. Training resumed with the fixed fitness.

## v3 policy inside the AV car (2026-10-10)

`neuralPolicy: 'v3'` runs the v3 net (650 weights, H = 24) in `global_av_neural` (params `neuralReverse`, `neuralRevMaxM`, `neuralVMax`; contract `av.neural.dir/revM` and reverse-aware AEB in [feature-av-stack.md](./feature-av-stack.md)). Default weights = `avNeuralWeightsV3.json` (copied from `shippedPolicyV3.json` by `npm run sync:global-pipeline`, which also writes `wV3` into every example world's neural stage via `tools/renn-mcp/upgrade-example-worlds-library.ts`). Example world: `av_neural_v3`. A/B (diagnostic, skipped by default): `AV_NEURAL_AB=1 AV_NEURAL_MODES=off,auto,v3 npx vitest run src/test/scenarios/av-neural-ab.diagnostic.test.ts` and the maze variant (`AV_NEURAL_MAZE_AB=1`). Evaluate candidate weights without shipping: `AV_NEURAL_V3_WEIGHTS=training-data/policy-evolution/v3cap.json` (reads `best.genome`, passed as `neuralWeights` to the v3 arm only). Helper: `src/test/fixtures/avNeuralV3Arm.ts`.

## v3 crux curriculum, 2nd generation (2026-10-12, replaces the retired C1..C5 stall-analysis band)

Source: the v3nose maze-only run (nose-anchored command, finished at gen 3000, best = gen 675) failed the maze band. `diagnose-v3.ts --kinds maze` on its best: train 17/27, holdout 6/13. TWO crux classes cover every failure:
- **NC1 fast corner** (dominant, 14 of 17): ALL on leg 0, t ~10-13 s, 17-22 m/s at the end, NO wall contact (hull gap ~9.6 m, fwd ray inf = shot out of the corridor), bearing error to the aim consistently ~-48 deg (a sign bias). The car does not brake / steer enough for the first 90 deg turn and overshoots offcourse.
- **NC2 start swing** (3 + the leg-0 offcourses of maze:4011~2): the ~90 deg start swing taken too sharply, slip angle ~76 deg, skid into the wall at ~0.6 m/s, cone ray ~4.2 m one second before (the M1 corner-exit crash, maze:1040~1); the M2 lateral starts are the same family.

Implementation (`courses.ts`): `CRUX_CLASSES` = 2, `cruxClass` = `(seed - 1) % 2`; embodiment `cruxEmb` = `floor((seed - 1) / 2) % 2` and turn direction `cruxDir` = `floor((seed - 1) / 4) % 2` are fixed by the seed, so every standard band holds BOTH embodiments of both classes and BOTH turn directions (the v3nose sign bias cannot survive). `layout.cls` keeps the class, `layout.emb` the embodiment, `layout.dir` the mirror:
- **NC1 (cls 0) fast corner** (`cruxNC1Course`): a 20-45 m straight approach (w 10-14 m) into a 90 deg turn to an exit corridor (w2 9-12 m, goal a few m before its end wall) - and the overshoot space PAST the corner is OPEN (no dead-end wall): an under-braked car shoots out and ends offcourse AT SPEED with no contact, exactly the maze signature. Embodiment 0 OCCLUDED: an occluder stub hides the exit until close (like the old C1; approach / exit seed the narrow end of the range - only there does the stub hide a fast-approach carrot); embodiment 1 OPEN: fully visible corner, the pure speed / braking failure.
- **NC2 (cls 1) start swing**: embodiment 0 LATERAL (`cruxLateralCourse`, the old C4/M2): first leg ~90 deg off the start heading (~8-16 m lateral) into a gap flanked by stubs at `CRUX_GATE_M` 16; embodiment 1 CORNER-EXIT (`cruxPocketCourse`, the M1 crash geometry): aimed at the dead-end wall of a sealed pocket, straight 16-24 m run-up, the ONLY exit a tight mouth (6.5-8 m) at the end with the dead-end wall 0.5-1.5 m below it - the ~90 deg swing separates drivers by arrival speed (the pursuit baseline reaches ~7.5 m/s over the run-up and its preview swing fits; a speed-blind net arrives at 13-16 m/s, cannot bend its ~10-12 m turning circle in 8 m of carrot preview, swings wide and slides down into the dead-end wall).

Chains (`cruxChains.ts`, machinery unchanged): base path + ~5 jittered variants (noise via the path / goal vectors), geometric gates (fillets, exact clearance, detour, CRUX_VARIANT_GAP distinctness) and the pure-pursuit acceptance gate (NO DEAD ZEROS, `CRUX_PURSUIT_SPEED` 0.35) - the baseline finishes EVERY accepted chain. ALL NC2 chains (both embodiments) carry `offM` 16 (`CRUX_LATERAL_OFF_M`): the ~90 deg start swing leaves the chain by up to ~12 m; with the default 6 m even the baseline goes offcourse. Tests (`crux.test.ts`): pinned band TRAIN15 = seeds 1,2,3,5,6,7,9,10,11,12,13,14,15,16,17, HOLDOUT10 = seeds 1001-1003, 1005-1011 (variant 1), every (class, embodiment, direction) combo in train, both classes + embodiments in holdout; 130 chains over 25 setups (mean 5.2), pursuit baseline 100 % finish; NC1 occluded-vs-open line-of-sight signatures; NC2 lateral / pocket geometry signatures.

Proof that the crux is the right one (`diagnose-v3.ts --kinds crux`, the v3nose gen-675 best): train 39/76 (51 %), holdout 23/54 (43 %). NC1 setups fail as LEG-0 OFFCOURSE AT SPEED (median 12 m/s - a 20-45 m approach from a standing start physically tops out there, the maze's 17-22 m/s needed 100+ m of run; signature otherwise identical: no contact, hull gap ~3 m, fwd ray inf, progress fraction ~0.83) on the WEST-exit setups, and as EARLY CRASHES WITH HIGH SLIP (t ~6 s, v -> 0.6, gap 0, fwd ray ~4.5, slip 55-84 deg - the M1 signature) on the EAST-exit setups - the measured directional bias. NC2 lateral setups fail the same way on the east swings (crux:14, crux:1006: slide crashes / offcourse). The NC2 corner-exit pocket chains the gate accepts are handled by this net (it brakes for the visible dead-end); its pocket slide appears on sharp-corner commands only, which the chain fillets smooth away. The shipped center-trained `shippedGenomeV3` handles more of the band (train 47/76 = 62 %, holdout 30/54 = 56 %; it drives 27+ m/s and dies differently - overshoot crashes), and the pursuit baseline finishes 100 %: the band is drivable, learnable and discriminates speed-blind policies.

## Crux training worlds + Training Crux dialog (2026-10-13, mirrors the maze training worlds 1:1)
User request: "die crux kandidaten auch im dialog zugänglich und abspielbar - gleiches prinzip, gleiche funktionalität". The accepted crux band is PLAYABLE in the app, one world per crux setup, ONE tiny crux copy PER ACCEPTED CHAIN (like the maze worlds hold one maze copy per route), the v3 policy car driving every copy on its own chain — the SAME chains the training episodes run (`generateCruxChains` via `chainsForSetup`) and the SAME per-chain command config (`cmdConfigFor(chainEpisodeKey(setupKey, i, true))`, incl. the NC2 `offM` 16).
- **`src/policyEvolution/cruxTraining.ts`** (source of truth): `CRUX_TRAINING_WORLDS` = the 25 pinned band setups (`crux_train_1..15` / `crux_holdout_1..10`, ids mapped 1:1 onto `acceptedSetupKeys(15/10, ['crux'], ...)`), `buildCruxTrainingWorld` (x-offset 70 m per copy, goal slab + `crux_score_<i>` stage per copy, camera on car 0), `cruxTrainingMeta` (cls/emb/dir, base chain stats, chains count, tileSvg), `focusCruxChain` (load-time tile focus). Scoring, goal-reach/y, carrot color and the candidate scheme are SHARED with the maze worlds; the score-stage code is one factory (`src/policyEvolution/trainingScoreStage.ts`, `MAZE_SCORE_STAGE_CODE` = prefix 'maze', `CRUX_SCORE_STAGE_CODE` = prefix 'crux' — only the `api.watch` labels differ).
- **Exporter** `tools/renn-mcp/export-crux-training-worlds.ts` (run with `--score`): warms the pursuit gate (`warmCruxGate`), writes `public/exampleWorlds/crux_*/world.json` + `meta.json` (bestScore = max over the per-chain headless runs, snapshot at reach) + `thumb.svg` + `route_<i>.svg` tiles; `RENN_V3_GENOME_FILE` trials a candidate (meta names it). The thumb renderer (`tools/renn-mcp/trainingThumbSvg.ts`) and the headless `--score` run (`tools/renn-mcp/trainingScoreRun.ts`) are shared with the maze exporter.
- **Dialog**: `MazeTrainingDialog` is parameterized by a `trainingSet` prop (`TrainingSet`: worlds, car ids, watch labels, tile texts) — the SAME component serves "Training Mazes" (default) and "Training Crux" (`CRUX_TRAINING_SET`, File menu, own localStorage slots, `crux-training-*` testids, `crux.score`/`crux.seg` live labels, base/jitter chain tiles, "chain" wording). The same `candidates.json` chips swap the drive-stage weights of the loaded world (`applyMazeCandidate` is world-agnostic); the Builder focuses via `focusMazeRoute` / `focusCruxChain` (world id prefix `crux_`).
- **Tests** `src/test/scenarios/crux-training-worlds.test.ts`: registry == live band enumeration, on-disk == exporter output for all 25, meta + candidate-aware (RENN_V3_GENOME_FILE), score-stage finish freeze + LOS gate, `focusCruxChain`, tile files; headless drive runs env-gated (`CRUX_TRAIN_SIM=1`) — the crux progress gate, green when a candidate clears every chain.
- **Trial**: `train-ctl.mjs trial` exports BOTH world sets with the pinned candidate and runs BOTH on-disk gates (verdict lines per gate); the auto-trial watcher inherits this (it calls `trial`).

## Crux hard band (2026-10-13): the crux:1010~1 pattern covered by TRAIN setups

After the first KEPT focus cycle the full-band gate showed train 76/76 but holdout 51/54: the ONLY failing holdout
setup is `crux:1010~1` (NC2 LATERAL, cls 1 emb 0, dir -1; all 3 failing chains) — a mid-corner slide into a gap stub
during the start swing (frac 0.42-0.46, residual speed 0-2 m/s, slip -63..-81 deg, cone ray ~4.3 m one second before,
fwd AND back ray inf, noise-independent — it crashes identically with sensor noise 0). It passed at the checkpoint
(gen 3575) and broke during the focus cycles; the old holdout fails (1003~1/1005~1/1007~1) are fixed. Holdout setups are
never trained on, so the lever is the TRAIN band (`chains.ts`).

**Analysis** (seeds/variants probed read-only, 350 worlds): the failure is NOT a course-parameter outlier and NOT a
start-jitter outlier — the candidate passes 25 natural NC2-lateral draws at variant 2 (canonical) and again at
variant 3 (jittered), and passes natural seeds 18-40 (their NC2 laterals 18/22/26/30/34/38 all clear; it fails natural
NC1 seeds 23/27/33 instead — a count bump would sharpen NC1, not this pattern). The failing dimension is the specific
(route x start-pose) combination of a jittered chain variant. The empirical selector found 4 setups in a RESERVED
band whose accepted chains the candidate fails with the 1010 signature — ALL WEST like crux:1010~1 (the weakness is
direction-biased, an echo of the v3nose bearing-error sign bias).

**Implementation** (`chains.ts`): `CRUX_HARD_SETUPS = ['crux:2066~8', 'crux:2106~3', 'crux:2114~3']` (the three 6-chain
honest failures; `crux:2178~3` also fails but has only 3 chains) + `cruxHardSetupKeys(kinds)` — PINNED keys (not scanned
at runtime; a key that ever fails the chain gates throws loud), reserved-band keyed (seeds 2001+, variant >= 2 — like
the adversarial keys these never collide with any standard scan: train scans variant 0, holdout variant 1), NC2-lateral
by the seed-fixed class/embodiment formulas. `trainV3Episodes` APPENDS them (after the adversarial append) — every
existing setup id stays stable, holdout untouched; the trainer / diagnose / ship gate / focus driver all pick them up
through `trainV3Episodes` with NO flag or count change. The 25 dialog worlds stay at the standard 15/10
(`cruxTraining.ts` pins `acceptedSetupKeys`, not `trainV3Episodes`; exporting new dialog worlds would write
`public/exampleWorlds/**` — deliberately not done here).

**Verification**: the validated candidate on the sharpened band — train 18 setups / 94 chains, 90 finished; the 4
failures are EXACTLY the new hard setups' chains (`crux:2066~8#1/#2`, `crux:2106~3#5`, `crux:2114~3#3`), signatures
matching 1010~1 (frac 0.43-0.46, v 1.3-1.9 m/s, slip -69..-73 deg, cone 4.3-4.4 m, contact 17-22 deg); the old 76
chains all still pass; holdout unchanged 51/54. `crux.test.ts` pins the appended band and runs the full structural
invariants (chain gates, NO DEAD ZEROS pursuit baseline, NC2-lateral signatures) over the hard setups too.

## Widen-freeze (2026-10-13): freeze-first widening, task-specific phase 1, four new kinds, harder touch penalties

Source: the 2026-10-13 widening analysis (`test-results/policy-evolution/widen-freeze/`, spec from the read-only analysis of the same day).
The v3cruxnose lineage (best-by-TRAIN **gen 3575**, H=24; the focus run's candidate was ROLLED BACK by its driver and is NOT the
lineage) is widened to H=32 with the old core FROZEN, the new units evolved on harder tasks, then everything released.

- **Freeze seam** (`es.ts` / `islands.ts` / `run-islands.ts`): optional `freeze?: boolean[]` in `EsConfig` (true = frozen) — frozen dims
  get zero perturbation (candidates stay at the center there; the antithetic gradient contributes 0) and their weightDecay pull is
  suspended, so they stay bit-identical over any number of steps; without a mask everything is bit-identical to the old behavior.
  `freezeOldMask(len, oldH)` (`policy.ts`) covers exactly the FOUR sets the old function lives in (old W1 rows, old b1, old W2 columns
  — stride change oldH→newH — and BOTH b2); only the new units' parameters (new W1 rows, new b1, new W2 columns) evolve — they start
  silent (zero outgoing weights) and the freeze is what puts selection pressure on them. Island replacement (crossover + immigrants)
  is BLOCKED while the mask is active (frozen dims are identical across islands, an immigrant would destroy the warm core);
  stagnation / focus bookkeeping unchanged. CLI: `--freeze-old` (creation only; needs `--warm` + `--hidden N >` warm H; the mask
  persists in `config.freeze` like speedCap, so a plain resume keeps it) and `--unfreeze` (resume only; clears it — phase 2).
  Tests: `freeze.test.ts` (mask layout incl. the "only old incoming weights is NOT enough" counter-test, bit-identical frozen dims,
  JSON round trip = resume, replacement block).
- **Harder touch penalties** (`es.ts`): `V3_WALL_TOUCH_PENALTY` 0.005 → **0.0125**, `V3_OBJECT_TOUCH_PENALTY` 0.002 → **0.005**
  (2.5x): ~1 s of wall contact now costs 0.75 norm (was 0.3), a 6-frame brush 0.075 (does not zero a good run). `CRASH_TOUCH_S` stays
  2.0 — measured: 1.5 rejects PINNED crux band setups (the pursuit acceptance gate runs through the shared episode rule, e.g.
  crux:12) and would cascade into the dialog worlds / export gates; the raised per-frame penalties make sustained grinding
  fitness-dead long before the crash-out anyway. CONSEQUENCE: old run files' `file.best.trainVec` is INCOMPARABLE under the new
  constants — every widen-freeze run starts a NEW out file and never resumes an old one (`beatsBest` would mis-rank).
- **Four new kinds** (`courses.ts`, chains in `v3Chains.ts` / the standard planner; tests `widenKinds.test.ts`): all registered in
  TRAIN and HOLDOUT (`V3_KINDS`), the kind-evenness / weakest-link fitness is untouched.
  - `rslalom` (reversal): a 13.5-15.5 m corridor (no U-turn possible) with staggered pillars leaving one 7.5-9.5 m gap each, and the
    car starts FACING THE REAR WALL — the chains lead 90-140 m to the far end, so finishing means threading every gap IN REVERSE
    the whole way (full-length reverse chains with steering). The hand-wired `reverserV3` finishes them (physically solvable); the
    warm candidate crashes at ~15 m (real headroom).
  - `deadend` (reversal): a hall with TWO independently seeded dead-end bays (12.5-14 m wide — no U-turn — 16-26 m deep); chains:
    into a bay, back out, exit — or across the hall into the OTHER bay and back out again (two full reversals with a forward arc).
    More variety than `bay` (which the crux-run best scores 0/18 on).
  - `gates` (forward avoidance): a corridor whose alternating wall stubs leave exactly ONE 9.5-12 m opening per gate (strictly
    alternating sides — the weave is forced); planner chains, exact clearance >= 2.5 m. NO extra obstacles (the first design's small
    middle boxes plugged the only free column and the planner rejected every setup).
  - `dense` (forward avoidance): a corridor packed with a dense lattice of small jittered boxes (rows every 10-14 m, >= 10 m gaps,
    many routes, all demanding close quarters without contact).
  - **Per-episode noise**: the four kinds' GEOMETRY is re-seeded by the start variant (`variantRng`: seed + KIND_SALT + variant), so
    the per-generation variant rotation of run-islands re-jitters the obstacle world itself (pillar positions, gate widths, bay
    layout, lattice draws) — every generation trains on a fresh world of the same family; the canonical variant 0 setup keys stay
    stable. Sensor noise (2 %) as everywhere.
  - Stage curriculum (`curriculum.ts`): the four kinds join `OBSTACLE_KIND_ORDER` (rslalom / deadend after corridor, gates / dense
    after crowd); `activeKinds(DEFAULT_STAGE.max)` now has 11 kinds. The widen-freeze runs use `--no-stage` (the warm candidate is
    far past the ramp).
- **Phase 1 trains EXCLUSIVELY on the new tasks, original kinds are VALIDATION ONLY** — the existing focus mechanism expresses it:
  `--focus-setups kind:rslalom:4,kind:deadend:4,kind:gates:2,kind:dense:2` (new `kind:<kind>:<n>` token in `parseFocusSetups` =
  the accepted TRAIN setups of that kind). Fitness stays goal-directed (peakNorm x speed-cap 10, weakest link): every new-kind
  chain demands progress (a standing / creeping policy stalls at ~0 norm — pinned in `widenKinds.test.ts`), and the raised touch
  penalties price the "drive fast into everything" alternative out. The ORIGINAL kinds never enter the gradient: they appear only
  in the epoch-end TRAIN / HOLDOUT reports (selection runs on the focus keys) and in the read-only regression eval
  (`tools/policy-evolution/eval-candidate.ts`: per-kind finish rates, wall-touch rates, reverse usage, machine-readable JSON).
- **Phase design + drivers** (`test-results/policy-evolution/widen-freeze/`, all writes inside the repo):
  - `run-abc.mjs`: SHORT screening, three variants, <= 45 min each (measured gens: focus ~1-2 s, full curriculum ~3-5 s early,
    growing as policies improve): **A** freeze + focus on the new tasks, **B** freeze + full curriculum, **C** no freeze (control).
    Warm baseline eval (new + original kinds) first, per-variant candidate eval (epoch-best) after; machine-readable
    `summary-abc.json` with per-kind deltas and the >10 pp regression flags.
  - `run-pipeline.mjs --variant A|B|C`: the LONG overnight run, restartable (driver state file): phase 1 (freeze, focus per
    variant, ~700 gens in chunks) → **validation gate** (epoch-best vs warm baseline on the ORIGINAL kinds: FAIL when any kind's
    HOLDOUT finish rate drops > `--gate-pp` (default 10) pp — on FAIL it stops, writes state + report, phase 2 NOT started) →
    phase 2 (`--resume --unfreeze --no-focus-setups --lr 0.01`, full fitness, ~800 gens) → final compare-style report on all kinds.
    NOTE the flag composition: a plain resume KEEPS a stored focus set — phase 2 must pass `--no-focus-setups` (the driver does).
  - Phase-1 candidate = `epochBest` (a focused run's fitness never beats the stored full-band `file.best` — the same lesson the
    focus-curriculum driver learned).
- **Design decisions (the empirical A/B answers them tonight)**: (i) is the new-task-only signal sufficient for the new neurons to
  become useful — or does the focus starve them of the old tasks' structure (A vs B)? (ii) is fitness focused exclusively on
  collision-avoidance kinds safe from rewarding destructive behaviour — the kind designs demand progress (finish only on full
  chain progress; stall / offcourse / crash all fail-factor), and the touch penalties make contact expensive, but only the runs can
  show it; (iii) the original tasks as regression validation: the gate threshold (10 pp on holdout) is the guard that phase 1
  cannot silently trade old behaviour for new; (iv) phase 2 restoring full fitness + `--unfreeze` at lr 0.01 is the release — the
  A/B's B-variant already tests the full-curriculum freeze, C calibrates the no-freeze control.
- **RESULTS (2026-10-14, pipeline A, artifacts in `test-results/policy-evolution/widen-freeze/`)** — strategy VALIDATED, not shipped:
  - Screening (40 gens/variant): **A** (freeze + new-task focus) the only variant within the 10 pp regression gate; B lost maze -14 pp,
    C lost maze -14 pp, crowd -10 pp AND its bay ability — the frozen core protects the warm behaviour exactly as designed.
  - Phase 1 (700 gens, freeze + focus): new kinds learned — dense 80 %, deadend 50 %, rslalom 4 % (8-setup holdout), gates 0 %.
    UNEXPECTED GENERALISATION: the collision-avoidance units also lifted the OLD touch-heavy kinds (crowd 20→61 %, bay 0→29 %,
    grid 0→18 %, slalom 25→34 %). Racing-line precision regressed (not in phase-1 fitness): maze 86→43 %, crux 94→71 %, free 25→19 %.
    Gate FAILED on field + maze — field turned out to be 3-setup-holdout NOISE (powered eval: 31 % vs 30 % baseline, no regression),
    maze real; L1 reviewed and continued to phase 2 (the designed recovery).
  - Phase 2 (800 gens, unfreeze, full fitness, lr 0.01) final (3-6-setup holdouts, noisy): free 100 %, corridor 100 %, grid 67 %,
    deadend 78 %, field 70 %, crowd 60 %, rslalom 33 %, dense 55 %, slalom 33 %, crux 89 % (recovered), maze 57 % (PARTIAL recovery,
    -29 pp vs baseline = the one real remaining regression), bay 22 %, gates 0 % (unsolved — needs longer training or design iteration).
    Touch share: bay 89→0 %, corridor 11→0 % (collision avoidance strongly down where it matters). Reverse usage: free 38 %
    (141 m), bay 72 %, rslalom 89 % (78 m), deadend 79 % (59 m) — the backwards-heavy curriculum took.
  - Empirical answers to the four design questions: (i) YES — the new-task-only signal suffices to make the new units useful, and
    generalises beyond the focused kinds; (ii) focused fitness did NOT reward destructive behaviour (kinds demand progress), but it
    DID drift precision behaviour it could not see — validation sets must include maze/crux-style racing-line kinds; (iii) the
    original-kind validation gate WORKS (caught the maze drift) but its default 3-setup holdout is too noisy — powered evals
    (8+ setups) for gates, or accept occasional false alarms; (iv) phase 2 (full fitness + unfreeze) recovers the drift: crux fully,
    maze partially within the 800-gen lr-0.01 budget — more budget improves it.
  - State: `wf-pipeline-A.json` (gen 1500, H=32) is RESUMABLE for a longer phase-2-style stretch; NOT shipped (maze regression,
    gates 0 %). Sigma-boost was maxed (4x) for most of phase 2 — the 13-kind weakest-link fitness makes late progress slow;
    consider `--pairs` increase or kind-subset phases for the next stretch.
