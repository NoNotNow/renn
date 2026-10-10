# Spec: command-following policy (v2) with test setups x target-vector chains

Status: IMPLEMENTED 2026-10-09 (chains, policy v2, chain episodes, evenness fitness, tools `--v2`, tests); no training run yet; deviations: lookahead 6-10 m / 0.4-0.8 s, clearance margins 2.5 m (maze 1.5 m), corner rounding + min turn radius, `field` chain setups at difficulty 0.3, island `slalom` geometry for chain setups, `run.ts` has no `--v2` (see feature-policy-evolution.md, section v2). Agreed with the user 2026-10-09, implemented step by step by subagents (AFK). Goal: the neural net follows a DYNAMIC directional
target vector (later supplied by the AV car, see [plan-policy-in-av-car.md](./plan-policy-in-av-car.md)), instead of memorising courses.
User requirements: several test setups; per setup several different target-vector chains that lead through it in different ways; every
chain is driven; EVENLY distributed performance is rewarded. Focused work, no side quests; token budget is limited, compute is not.

## Lessons from earlier mistakes (must hold)
1. Fitness gaming: the open field was driven around. Every course is CLOSED, progress counts only along the COMMANDED chain, and leaving the
   commanded chain ends the episode (`offcourse`). Ask for every new setup: can the score be gained without following the command?
2. Tests first-class: run `npx vitest run src/policyEvolution` (and changed tests) BEFORE every commit; never commit red.
3. After any change to the stage code regenerate the example worlds (`npx tsx tools/renn-mcp/export-policy-drive-example-world.ts`),
   else `exampleWorld.test.ts` fails. Camera `mode: 'thirdPerson'`.
4. Never `pkill -f` / `pgrep -f` with a pattern contained in your own command line (kills your shell). Long runs: harness background task, `--resume`.
5. Report honestly (numbers within noise, what is unverified).

## Concepts
- **Setup** = geometry only (closed walls, boxes, start pose; key as today `kind:seed[~variant][@difficulty]`). Kinds: `field`, `slalom`, `maze`
  (existing) + new `crowd` (closed track ~40 m wide, rows of parked 4 x 8 cars with gaps, some scattered clutter boxes; static only in v2).
- **Chain** = ordered waypoints from the start to an end region through the setup. Episode key: `<setupKey>#<chainIndex>`.
  Generated per setup, deterministic from the key, cached per worker:
  - occupancy grid 1 m over the closed area, obstacles inflated by car half width (2 m) + margin 1.5 m;
  - END variety: each setup defines 2-4 end targets (field/crowd/slalom: left/centre/right at the far end; maze: different exit cells /
    goal cells reachable through different branches);
  - ROUTE variety: A* to each end; alternatives by penalising cells near already accepted chains (+ seeded cost noise);
  - string-pull with line-of-sight on the inflated grid, resample to waypoints every ~10 m;
  - accept a chain only if: no waypoint segment intersects the inflated obstacles, length <= 1.8 x shortest of that end, and it differs from
    every accepted chain (symmetric Hausdorff distance >= 10 m). Up to `CHAINS_PER_SETUP` = 4; setups with < 2 accepted chains are rejected
    (re-seed deterministically).
- **Dynamic command** (computed inside the stage every frame, like the AV route planner's carrot): project the car onto the chain polyline
  (monotone, with a segment hint); aim point = point at lookahead `L = clamp(Lmin + T * v, Lmin, 40)` further along the chain
  (per episode seeded: Lmin 10-20 m, T 1.0-2.0 s), refreshed only every P seconds (0.2-0.8 s, held in between), bearing noise +-3 deg.
  Next-turn hint = direction of the chain segment beyond the aim point.
- **Inputs v2 (24):** 14 rays (unchanged) | fwd speed, side speed, yaw rate | aim cos, sin, min(dist/60,1) | next-segment cos, sin (car frame)
  | previous steer, gas. Hidden 10, outputs unchanged. GENOME_LENGTH v2 = 10*24+10+20+2 = 272. Warm start: v1 genome padded with zero weights
  for the two new inputs => identical outputs (test). Stage reads `input.av.cmd` `{ aim: [x,z], next: [x,z] }` if present (AV integration
  later), else derives it from `params.chain` + `params.cmd` config (training / policy worlds). Keep `policyForward` (reference) and the stage
  computing the identical function (test).
- **Episode:** progress = `RouteProgress` along the commanded chain; `offcourse` if > `OFF_CHAIN_M` = 6 m from the chain (chains differ by
  >= 10 m, so following the wrong route ends the episode); other end rules unchanged; norm = progress^2 / t / (chain length x 10).
- **Fitness (evenness):** group a candidate's episodes by setup: setupScore = 0.5 mean(norm over its chains) + 0.5 min(norm over its chains);
  fitness = 0.5 mean(setupScore) + 0.5 mean(worst quarter of setupScore). Per generation: a batch of S setups x ALL their chains (common
  random numbers for all candidates). Report per kind: finish rate over chains, share of setups where ALL chains finished, contacts, offcourse.
- **TRAIN / HOLDOUT:** setups seeds 1.. vs 1001..; holdout uses random start variants. `compare.ts` / `ship.ts` work on chain episodes.
  Shipped v2 weights: `src/policyEvolution/shippedPolicyV2.json` (v1 file stays until the worlds are switched).

## Required tests (minimum)
- chains: deterministic; >= 2 accepted per setup for a sample of every kind; every segment clear of inflated obstacles; pairwise Hausdorff >= 10 m.
- exploit guards: a hand-wired follower that follows chain A while chain B is commanded ends `offcourse` (or never finishes); driving
  straight ahead never finishes a field/crowd chain; the setup walls are closed (as the existing field test).
- solvability baseline: a hand-wired pure-pursuit follower driven by the dynamic command finishes >= 70 % of chains on a sample of slalom/
  field@0.3/crowd setups (proves chains are drivable and the command pipeline works end to end); report the rate per kind.
- evenness aggregate: unit test that an uneven candidate scores below an even one with the same mean.
- warm-start equality (padded v1 == v1); stage forward pass == `policyForward`; episode determinism.

## v3 (agreed with the user 2026-10-10): forward AND backward from the start, free-track pretraining
User: no speed command, ONLY the direction. Reversing was neglected in training; the target vector must point forward and then backward
and the car must be rewarded accordingly; this has to be trained FROM THE BEGINNING (fresh nets, no warm start from v1/v2): pretraining on
a free track first, obstacles later.
- **Inputs stay direction-only** (v2 layout: aim cos, sin, dist; next-segment cos, sin; no speed input). Hidden size from the capacity screening.
- **Why the v2 net never reverses** (measured): fitness = progress x speed, stall abort = < 1 m progress in 3 s, instant abort on contact,
  and no chain ever needs braking or reversing => the net learned "full throttle forward".
- **Direction chains with reversals:** a chain is a sequence of LEGS; a leg may point back the way the car came (aim behind the car).
  Short back legs (5-20 m, aim behind within +-30 deg) are cheapest to drive in reverse (turning circle ~10 m), long ones may be turned;
  both are valid, the reward does not prescribe forward/reverse, it rewards reaching the commanded points quickly. Mix per episode:
  forward-only legs, reversal legs (back 5-20 m then forward again), lateral offsets (aim 60-120 deg to the side, needs a short reverse +
  turn or a K-turn), and stop-and-go (aim very close).
- **Progress on chains that double back:** `RouteProgress` projection is ambiguous on overlapping legs. Measure progress per leg: the leg
  index only advances when the car is within `reachR` of the leg end (or past it along the leg); progress = completed leg lengths + the
  projection onto the CURRENT leg only (monotone per leg). Offcourse = distance to the current leg > 6 m.
- **Stall rule:** stand-still based: |speed| < 0.5 m/s for 3 s (manoeuvres must survive); keep the progress stall as a much longer
  safety net (no progress for 10 s). Contact still ends the episode (safe driving).
- **Fitness:** per episode norm = progress^2 / t / (chain length x 10) on the leg-wise progress (unchanged form); evenness aggregate as v2.
- **Stage A, free track:** a big closed arena (walls far away, e.g. 200 x 200 m, no obstacles), seeded random direction chains of
  6-12 legs (incl. reversals, lateral targets, stop-and-go). Fresh random nets (start prior: none needed if the reward gives signal;
  check), islands as before.
- **Stage B, obstacles:** automatic curriculum: the share of obstacle setups (field/slalom/maze/crowd with chains as in v2, plus NEW
  reversal setups: dead-end bays to drive into and back out of, and corridors too narrow to U-turn) rises from 0 to ~70 % when the free-track
  chain finish rate EMA >= 0.7 (step 0.1, like the field curriculum). Free-track episodes stay in the mix (no forgetting).
- **Tests (minimum):** leg-wise progress on a doubling-back chain (unit); a hand-wired controller that reverses when the aim is behind
  finishes reversal chains on the free track, one that only drives forward does NOT finish a short back leg as fast (or fails the narrow
  corridor); stand-still stall vs manoeuvre (a reversing car is not stalled); dead-end and narrow-corridor setups are closed and
  solvable by the hand-wired reverser; curriculum share rises only with the gate; determinism.
