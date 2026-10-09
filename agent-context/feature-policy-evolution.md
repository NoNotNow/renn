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

## Courses (`courses.ts`), keys `field:<seed>` / `slalom:<seed>` / `maze:<seed>`
Start at the origin facing -Z, route 400 m along -Z, fully seeded. `field`: open ground, boxes with density growing with distance, wandering goal
chain (start and goals kept clear). `slalom`: corridor narrowing 28 -> 16 m, pillars from alternating sides (55 % of the width), goals in the gaps.
`maze`: seeded 6x6 maze (16 m pitch, generator shared with the AV maze task), start in a south-row cell facing the first route step, goal chain = cell centres along the shortest route to the exit gate (no map: the goal vector is the only hint where the route turns). A blind goal follower with no sensors already reaches ~130 m in a maze.
TRAIN = seeds 1.. of each kind (`--train-per-kind`), HOLDOUT = seeds 1001.. (`--holdout-per-kind`), disjoint; sets interleave the kinds.

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
`public/exampleWorlds/policy_drive_{field,slalom,maze}/` (File -> Example Worlds; documented in example-worlds.md). State of the shipped gen-340 policy on the example courses: field:1001 and slalom:1001 finished (405 / 428 m, ~16 s); maze:1001-1003 crash after 101 / 163 / 20 m.

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
- A background run started with `nohup` / detached dies when the session idles; use the harness background task (Bash run_in_background) and `--resume` (state is saved every generation).

## Not done yet
Browser panel / live playback per generation, MCP tools, comparison against the evolved AV pipeline on the same courses.
