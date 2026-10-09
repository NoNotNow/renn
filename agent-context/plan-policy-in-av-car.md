# Plan: neural policy in the AV car as a command-following "neural drive" mode

Status 2026-10-09: PLAN ONLY, nothing implemented. Direction agreed with the user: the net must follow a directional target vector
handed over by the AV stack and take over in mazes and crowded situations. Open questions for the user: section 7.
Background: [feature-policy-evolution.md](./feature-policy-evolution.md), [handoff-policy-evolution.md](./handoff-policy-evolution.md).

## 0. Facts this plan builds on (checked in the code)
- **Same plant.** The AV car of `self_hunt_flexible` (`entity_1779823253285_brtkx1p`, also copied by `buildArenaWorldFrom` / `av_maze_escape`) is a 4 x 8 box, mass 2, friction 0.01, car2 `..._tf1` power 2400, steeringSpeed 0.51 = exactly what the policy trained on (`episode.ts` `CAR_BODY` / `CAR2_PARAMS`). The policy's pedal gain 1200 and fixed hull offsets (`hl 4.1`, `hw 2.1`) are valid there, NOT on the library default car (`global_av_car`, power 340, 2 x 4) and not on the power-400 cars in the hunt world. v1 refuses to run unless `av.vehicle` is ~4 x 8.
- **AV stack order** (library priorities, `buildAvStackGlobalBehaviorLibrary.ts`; example worlds carry renumbered copies, e.g. supervisor 7, lateral 8, AEB 10, car2 11): `global_av_input` (1) -> `av-ego` (2, rebuilds blackboard `input.av`: `av.ego`, `av.manual`, flee layer, `av.maze`) -> `av-perception` (3: `av.scan`, `av.points`, `av.movers`) -> `av-route-planner` (3.8, Hybrid-A*: `av.carrot`, `av.routePath`, `av.override` / `av.mode='maneuver'`) -> `av-motion-planner` (4: `av.plan {kappa, free, clearance, blocked, ...}`, `av.goal`) -> `av-speed-planner` (4.5: `plan.vDesired`) -> `av-supervisor` (4.6: `av.needManeuver`, `av.mode`) -> `av-control-lateral` (5) / `av-control-longitudinal` (5.5, RLS of G, D -> `av.actuator {G, D, u}`) -> `av-aeb` (7) -> car2. Stages talk only through `input.av`; execution order = priority.
- **Template for "something else drives": `av.manual`.** Lateral/longitudinal yield (lateral resets `state.steer`/`state.kf`, longitudinal keeps its actuator bookkeeping), the supervisor holds stuck/blocked timers at 0, the AEB does not yield. Tested in `av-manual-override.integration.test.ts` incl. "off = bit-identical poses". Neural mode copies this pattern.
- **The directional target already exists: `av.carrot`** (a point ~`lookahead` 15-30 m along the Hybrid-A* route, or `carrotLookT * v`, with `carrotPull` line-of-sight shortcuts; refreshed every `routeInterval` 0.37-0.8 s, x2.5 in eco; route dropped on goal jumps > `goalJumpReplan` 8 m). It already goes around known obstacles. In maze-flee `av.maze.goal` becomes `input.target`. Without a carrot: `input.target.pose.position`.
- The maze module (`av.maze.on`) only acts inside the flee layer with chasers (byte-identical to off on maze-escape episodes): it cannot be the trigger.
- Custom stages may output `setPose` (`customCodeTransformer.ts` `readSetPose`): deterministic in-world movers give browser = headless parity.
- **Bars.** Classic AV, maze escape with evolved params: HOLDOUT-24 18.1 s mean, 24/24 reached, 0 contacts (defaults: TRAIN-24 52.7 s, 20/24). Policy alone with the route given: maze 5/10, slalom 9/10, dense field 0/10.

**Honest expectation:** in mazes the classic stack is already strong. The realistic win is in crowded / dynamic scenes (parked cars, crossing traffic, clutter, tight gaps where the classic planner shuttles or stalls). `neuralMode` stays off by default and is only enabled per world after a paired A/B shows it is not worse.

## 1. Interface: the command vector
The net stays a pure `f(w, x) -> (steer, vTarget)`; only x changes. The stage derives a command `av.cmd` per frame, in car frame:

| input | value | runtime source |
|---|---|---|
| c0, c1 | cos, sin of the bearing to the aim point | `av.carrot`, else `av.maze.goal`, else `input.target.pose.position` |
| c2 | min(dist / 60, 1) to the aim point | same (same scale as today: warm start works) |
| c3, c4 | cos, sin of the route heading AFTER the aim point relative to the car ("next turn") | segment of `av.routePath` past the carrot; else = c0, c1 |
| c5 | commanded speed `min(plan.vDesired, neuralVMax) / 30` | speed planner |

- Inputs v2 = 14 rays + 3 ego + 6 cmd + 2 memory = 25 (was 22); hidden 10; GENOME_LENGTH 282. Warm start: shipped 22-input genome zero-padded on c3-c5 = identical function (exact equality test).
- The net keeps its own 14 rays (`api.raycast` from the hull edge, range 50), not `av.scan`: identical inputs in training and runtime.
- Pedal law `u = (vT - v) / TAU / G` with G = `av.actuator.G` (RLS) when present, else `params.gain`; the stage writes `av.actuator.u` (the AEB's mailbox).
- **One source of truth:** `src/policyEvolution/policyStage.ts` exports `NEURAL_STAGE_CODE`; a generator (`tools/policy-evolution/export-av-neural-stage.ts`, also called by `npm run sync:global-pipeline`) writes `public/global/transformers/av-stack/av-neural.js`; a test asserts disk == generator. Register in `src/globalPipeline/avStackStagePaths.ts` (`neural: 'av-neural.js'`) and `STAGES` of `buildAvStackGlobalBehaviorLibrary.ts` as `global_av_neural`, priority 4.55 (after speed planner, before supervisor), appended LAST to `global_av_control` (no re-indexing of `scopeParams`; never decimate the control layer). Weights in the stage default params (from `shippedPolicy*.json` at library build), overridable by binding param `neuralWeights`.
- Training uses the same stage code: a small `policy_cmd` stage (priority 4) builds `input.av = { cmd, neural: { mode: 'always' } }` from course data; the neural stage uses `av.cmd` if present and derives it from `av.carrot` / `av.routePath` / `plan` only inside the AV.

## 2. Training: follow a command, do not memorise a course
**2a. Command generator** `src/policyEvolution/command.ts` (pure, seeded per course key):
- Oracle route at course build: grid A* (1 m) over boxes inflated by half the car width + ~1 m; mazes: existing shortest cell route, string-pulled. Cached per key in the worker.
- AV-like carrot: aim = point `L = max(Lmin, T v)` ahead (Lmin 12-30 m, T 1.6-2.7 s, sampled per episode), pulled back to line of sight, refreshed every P = 0.35-2 s and held in between.
- Degradations (seeded per episode; calibrate on real AV traces from Phase 0): bearing noise +-3 deg, distance +-10 %; replan jumps (p ~0.1 per refresh, alternative route from perturbed A* costs); dropouts (hold 1-3 s); obstacle-unaware commands in 20-30 % of episodes (straight line, as the planner before a box is mapped); c5 from a curve/goal speed law + noise.
- Free-command episodes (~20 % of each batch): sparse closed arena with movers, command direction = random walk with 30-180 deg steps, aim 20 m ahead.

**2b. Courses** (`courses.ts`, keys stay `kind:seed~variant@d`): new `crowd` (closed 40 x 250 m track, parked 4 x 8 cars, crossing constant-velocity movers 3-12 m/s, slow "pedestrian" boxes 1-2 m/s; movers not in the oracle map) and `avmaze` (`mazeGen.ts` `DEFAULT_MAZE`: 8 x 8, pitch 15 m, corridors 14 m, loops); keep `field` (curriculum), `slalom`, `maze`. Movers via a deterministic `policy_mover` stage (`setPose` as a function of sim time). `episode.ts` checks moving polygons too and counts `moverContact` separately.

**2c. Fitness.** Route episodes: progress^2 / time on the oracle route, `offcourse` rule kept (16 m). Free-command: integral of max(0, v . c_hat) dt / (T x 10), end on contact/flip, stall = < 1 m along c_hat in 3 s. Same aggregation (0.5 mean + 0.5 worst quarter). Report per kind: finish rate, contacts (static / mover), heading error while free.

**2d. Dense field:** run-4 failed because the goal pointed through the boxes. With an obstacle-aware carrot the planner chooses the gap and the net tracks + keeps clearance: the planner-like episodes should mostly be solvable; the obstacle-unaware ones stay hard (report separately). In static fields the classic AV is already good; the net's value must show on movers and tight passages.

**2e. Tools:** `run-islands.ts` / `ship.ts` / `compare.ts`: `--inputs v2`, `--warm <genome.json>`, `--kinds field,slalom,maze,crowd,avmaze`, `--free-cmd 0.2`, HOLDOUT seeds 1001.. for new kinds; `ship.ts` writes `shippedPolicyV2.json` (v1 stays for the `policy_drive_*` worlds), paired-bootstrap rule kept.

## 3. Integration into the AV car (`av-neural.js`)
Binding param `neuralMode`: `'off'` (default, bit-identical), `'always'` (debug), `'auto'`.

Auto trigger from the net's own rays: `occ` = share of the 11 rays with |bearing| <= 80 deg shorter than `neuralOccR` (12 m); `minFront` = min ray within +-35 deg; `nMov` = `av.movers` within 25 m; `conf` = share of all 14 rays < 18 m.

| | rule |
|---|---|
| ON candidate | (`occ >= 0.5` or `nMov >= 3` or `conf >= 0.6`) for `neuralOnT` 0.5 s |
| OFF candidate | `occ < 0.3` and `nMov < 2` and `conf < 0.4` for `neuralOffT` 1.5 s |
| min dwell | 2 s per state |
| never ON | `av.manual`, `av.mode === 'maneuver'` (K-turns stay classic in v1), `av.mode === 'hold'`, tracked threats within `fixThreatRange` (pursuit evasion stays classic in v1), vehicle not ~4 x 8, no aim |

All thresholds are params (tuned on TRAIN only).
- **While ON:** the stage writes `steering_angle`, `throttle` / `brake`, `av.actuator.u`; lateral/longitudinal get `if (av.neural && av.neural.on)` branches identical to their `av.manual` branches; the supervisor holds timers as for manual; the AEB stays active; route/motion planners keep running (fresh command, warm handback); `vTarget` capped at `neuralVMax` (default 12 m/s).
- **Handover:** classic -> net: init memory inputs (`state.steer = clamp(av.ego.kappa / 0.12)`, `state.gas = v / 30`); net -> classic: yield branches reset filters, plus `av.neural.justOff` for one frame.
- **Watchdog** (forces OFF + cooldown `neuralCooldown` 5 s): < 2 m along the command in 3 s; AEB fired; hull-ray distance < 0.4 m at > 3 m/s; |side speed| > 4 m/s. 3 fails in 30 s -> locked 30 s.
- **Observability:** watch row `av.neural` (`on crowd occ 0.62 mov 3` / `off` / `cooldown 3.1 s stall` / `locked`), counters `av.neural.{onS, handovers, fails}`, violet status mast + violet car-to-aim line.

## 4. Verification
- **A/B harness** `tools/policy-evolution/av-ab.ts --modes off,auto,always --sets maze-holdout,maze-cases,crowd,field [--workers 4]` (worker pool, fresh world per episode): maze escape via `runMazeEpisode` (`src/avEvolution/eval/episode.ts`) on HOLDOUT-24; scripted cases via `runScenario` (`src/test/fixtures/avEvasionRunner.ts`) on `avMazeCases` and a new `src/test/fixtures/avCrowdCases.ts` (parked-car gauntlet, crossing traffic with `threat:false` line puppets, clutter, policy `field:100x` layouts as `ArenaBox`, slow random movers); policy courses through the full stack (net alone vs AV + net vs classic).
- **Metrics:** reached, goal/exit time, contact frames (static / mover / clutter), `minStaticGap`, `stalledSec`, `shuttleEvents`, `reversals`, mean speed, net-on share, handovers, fails. Paired table per set (A - B, bootstrap 95 % interval, wins/losses).
- **Tests** `src/test/scenarios/av-neural.integration.test.ts`: (a) `off` = identical poses to no stage; (b) `always` reaches an open-road goal; (c) `auto` switches on in a crowd case and off after it; (d) zero weights -> watchdog hands back within 3 s and the car still arrives; (e) stage forward pass = `policyForward`; (f) disk `av-neural.js` = generator. `npm run av:quick` / `av:pre` stay green.
- **Example worlds** via `tools/renn-mcp/export-av-neural-example-worlds.ts` (same builder as the headless cases, movers via the `setPose` stage): `av_neural_crowd` (`auto`), `av_neural_maze` (`av_maze_escape` copy, `auto`); camera `thirdPerson`; rows in `example-worlds.md`; Playwright screenshot; deploy after each user-visible step.

## 5. Phases
- **Phase 0 - baseline + signal capture (no net):** `avCrowdCases.ts` (6-8 cases, TRAIN/HOLDOUT) + mover stage; `av-ab.ts` with `off` only; classic baseline table (maze-holdout, maze-cases, crowd); recorded command traces (carrot bearing/distance per frame, refresh intervals, jump sizes, c3-c5 stats) to calibrate 2a; benchmark of AV episode wall time (unknown, much heavier than policy episodes). Verify: maze HOLDOUT reproduces ~18.1 s, 24/24.
- **Phase 1 - stage plumbing with the shipped v1 net (aim = carrot), no training:** `policyStage.ts`, generated `av-neural.js`, library entry, yield branches, trigger, watchdog, watch + overlay, tests, `av_neural_crowd` world. A/B off/auto/always. Expected: `always` weak (never trained on carrots); `auto` must not crash more than classic thanks to the watchdog. Deploy.
- **Phase 2 - command-following training (v2 inputs):** `command.ts`, `crowd` + `avmaze` kinds, free-command episodes, mover contact, new fitness, tool flags; unit tests (generator determinism, oracle avoids boxes, warm-start equality, mover contact). Screening A (warm start) vs B (scratch) x 2 seeds x 150 gens (~2.7 h), `compare.ts`; one long run of the winner (~2 h, `--resume`); ship into `shippedPolicyV2.json` by the paired HOLDOUT rule.
- **Phase 3 - A/B in the AV + threshold tuning:** library weights v2; thresholds tuned on TRAIN crowd/maze cases; HOLDOUT table off vs auto vs always. Gate for `auto` in a world: crowd HOLDOUT reached >= classic AND contact frames <= classic (paired interval not worse), maze HOLDOUT not worse beyond noise. Deploy.
- **Phase 4 - enable + document:** `neuralMode: 'auto'` in worlds that passed (candidates `av_neural_crowd`, `av_maze_escape`, maybe the `self_hunt_flexible` focus car outside pursuit); update `feature-av-stack.md` ("Neural drive mode"), `feature-policy-evolution.md`, `handoff-policy-evolution.md`, `example-worlds.md`; `npm run sync:global-pipeline`; regenerate `av_maze_escape`. Deploy.
- **Optional Phase 5:** re-rank the top 5-10 snapshots of the long run by the AV A/B on TRAIN crowd cases (final selection only, never ES inside the full stack); experiment: net takes over during distress manoeuvres (`av.needManeuver`) behind its own param.

## 6. Risks
- Net may not beat the classic AV in mazes (24/24): off by default, Phase-3 gate, maze trigger switchable on its own.
- Synthetic commands may not match real carrots (period, jumps, eco hold): Phase-0 calibration + wide randomisation.
- Handover oscillation: hysteresis, dwell, cooldown, lockout; measure handovers per minute.
- Overfitting to the 4 x 8 / 2400 plant: mode refuses other sizes; RLS G helps a little; other bodies need retraining.
- Mover realism: kinematic boxes are not reactive AV cars; validate once in `self_hunt_flexible` traffic before claiming "crowded".
- CPU: 14 rays + ~300 MACs per frame is negligible against the stack; cast rays only when mode != `off`.
- Priority / scope layout: example worlds copy priorities and scope keys; append to `global_av_control`, check with `npm run sync:global-pipeline` and the hunt-game tests.

## 7. Open questions for the user
1. Which situations exactly? "Mazes" = `av_maze_escape` and the labyrinths in `self_hunt_flexible`? "Crowded" = static clutter/parked cars, crossing traffic, or the pack of AV cars in `self_hunt_flexible`? Should the net ever drive while chased (recommendation v1: no)?
2. Success = (a) "the net drives safely to the AV's targets, visible in the worlds" or (b) "net-on measurably better than classic" (then mazes may stay classic)?
3. Compute budget OK: ~3 h screening + 2 h long run in Phase 2, plus A/B runs (cost measured in Phase 0)?
4. Speed cap while the net drives (default 12 m/s in crowds) or full 30 m/s with only the AEB as guard?

## Critical files
`src/policyEvolution/policy.ts` (+ new `policyStage.ts`, `command.ts`), `courses.ts`, `episode.ts`;
`src/globalPipeline/buildAvStackGlobalBehaviorLibrary.ts`, `src/globalPipeline/avStackStagePaths.ts` (+ new `public/global/transformers/av-stack/av-neural.js`);
`public/global/transformers/av-stack/av-control-lateral.js`, `av-control-longitudinal.js`, `av-supervisor.js` (yield branches next to `av.manual`);
`src/test/fixtures/avEvasionRunner.ts`, `src/avEvolution/eval/episode.ts`, `src/avEvolution/maze/arenaWorld.ts` (+ new `src/test/fixtures/avCrowdCases.ts`).
