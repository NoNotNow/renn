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
