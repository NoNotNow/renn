# Plan: neural policy in the AV car as a command-following "neural drive" mode

Status 2026-10-09: Phase 1 (stage plumbing, no training) IMPLEMENTED with the v2 policy (24 inputs, no speed command; the training spec `spec-command-chains.md` is authoritative over sections 1-2 here): see feature-av-stack.md 'Neural drive mode'. Phases 0, 2-4 open. Direction agreed with the user: the net must follow a directional target vector
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
- **Phase 5 (v3 policy, forward + reverse): see section 8.** Earlier idea kept: re-rank the top 5-10 snapshots of the long run by the AV A/B on TRAIN crowd cases (final selection only, never ES inside the full stack); experiment: net takes over during distress manoeuvres (`av.needManeuver`) behind its own param.

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

## 8. Phase 5 — v3 policy in the AV car
Status 2026-10-10: PLAN only (no code). Read with `spec-command-chains.md` (v3 section) and the Phase-3 A/B in `feature-av-stack.md` ("Neural drive mode").

### 8.1 What v3 adds vs the integrated v2 (checked in `policy.ts`, `policyStage.ts`, `legs.ts`, `shippedPolicyV3.json`)
- **Network: same interface.** v3 still has 24 inputs (14 rays at 0..180 deg all round, fwd/side speed, yaw rate, aim cos/sin/dist, next cos/sin, prev steer/gas) and 2 outputs (steer, gas). No speed input, no speed command. Only the size differs: `shippedPolicyV3.json` has 650 numbers = H 24 (27 H + 2), v2 in the AV has H 10 (272). `STAGE_HIDDEN` / `hiddenOf` infer H from the length, so the weights are a drop-in swap (`neuralWeights` param or `avNeuralWeights.json`). `POLICY_STAGE_CODE_V3` = v2 net code + only a different command helper (`STAGE_CMD_HELPERS_V3`).
- **Reverse is in the output and the command, not in new inputs.** gas < 0 maps to target speed `gas * 8` (`V_REV_MAX`), gas > 0 to `gas * 30`; the pedal law brakes/reverses via `u = (vT - v_fwd)/TAU/G`, negative u = brake (car2 reverses when held). The net reverses ONLY when the aim point is behind the car: v3 training chains are made of LEGS (`legs.ts`, `params.legEnds`); a reversal leg puts the aim up to 5-20 m behind the car, leg change refreshes the command at once, aim never beyond the leg end.
- **Obstacle sensing is the same 14 hull-edge rays as v2** (range 50, `x = 1 - d/50`, hit offsets `hl 4.1 / hw 2.1`). What is new is training: bay, corridor, slalom, field, maze, crowd kinds (stratified, kind-evenness fitness), so rays 120/180/-120 are actually used (reverse out of bays/corridors).
- **What the AV car feeds today** (`av-neural.js`, v2 `deriveCmd`): aim = point `clamp(lmin + tau*v, lmin, 40)` m ahead on `av.routePath` (monotone projection, fallback carrot/maze goal/target), next = 12 m beyond. It never yields an aim behind the car, so v3 would drive FORWARD ONLY in the AV today (its reverse behaviour is never triggered) and its `next`/aim statistics differ from the training legs. Everything else (rays, ego speeds, prev steer/gas, pedal law with G, `vMax` cap) matches.

### 8.2 Integration steps
1. **Weights/param switch (no behaviour change):** new binding param `neuralPolicy` (enum `v2` default | `v3`) in `NEURAL_PARAM_DEFS` (`src/policyEvolution/policyStage.ts`), plus `neuralWeightsV3` default from `shippedPolicyV3.json` (resolve in `src/globalPipeline/avStackStagePaths.ts` next to `avNeuralWeights.json`; keep `avNeuralWeights.json` = promoted v2). `neuralWeights` explicit override still wins. Existing worlds carry no `neuralPolicy` -> v2 -> bit-identical (extend the `off`/default bit-identity test).
2. **Leg-aware command in the stage (`policyStage.ts`):** when `neuralPolicy: v3`, build the stage head with `stageHead(N_IN_V2, true, true)` (pulls `LEG_TRACK_JS` + `STAGE_CMD_HELPERS_V3`) and feed it a chain with `legEnds` instead of the monotone v2 projection. Keep `av.cmd` override as is.
3. **Where reversal legs come from (design decision, see 8.6):** (a) v3-forward only first: chain = `av.routePath`, ONE leg (identical to training "v2 kinds run as one leg"); (b) then a reverse trigger: when the car is stuck/blocked (watchdog stall, `av.needManeuver`, rays front < ~3 m with the aim ahead blocked) the stage appends a back leg of 5-10 m along the car's own heading (aim behind), then the forward leg again via the route re-plan. Never reverse longer than `neuralRevMaxM` (new param, default 12 m).
4. **Reverse awareness of the classic stages:** AEB (`av-aeb.js`) probes forward from `e.fwd` only and the supervisor/stuck timers know nothing of reversing. While `av.neural.on` and the net commands gas < 0: AEB must either probe backwards (`-e.fwd`) or stay out of the way; supervisor holds stuck/blocked timers at 0 (already so while on). Watchdog: the stall test (< 2 m along the command) is measured along the command, so a reversal is fine; the "hull ray < 0.4 m at > 3 m/s" fail must be sign-aware (use |v| along the ray, reverse uses rays 120/180/-120).
5. **Speed cap:** `neuralVMax` already caps vT; set the v3 default to 12-15 m/s (see 8.4). Reverse cap stays `V_REV_MAX` 8.
6. **Regenerate** `av-neural.js` (`npx tsx tools/policy-evolution/export-av-neural-stage.ts`, `npm run sync:global-pipeline`); the disk == generator test must cover both heads. Overlay/watch: show `av.neural.dir` (fwd/rev) and reverse metres in `av.neural.n`.
7. **Docs:** `feature-av-stack.md` (Neural drive mode), `feature-policy-evolution.md`, `handoff-policy-evolution.md`, `example-worlds.md`.

### 8.3 Verification plan (headless first, per `.cursor/rules/agent-headless-defined-start.mdc`)
- Unit/integration (`src/test/scenarios/av-neural.integration.test.ts`): `neuralPolicy` absent = v2 poses bit-identical; v3 stage output == `policyForward` of the 650-genome (like test (e)); v3 command helper == training (`v3.test.ts` parity); reverse leg aims behind, AEB/supervisor behave while reversing.
- Reset to the defined start every run: load the world from the JSON on disk (`public/exampleWorlds/<id>/`), reset ALL entities to document poses (also movers), fixed seeds; no browser-only Play as primary signal.
- A/B harness: extend `av-neural-ab.diagnostic.test.ts` / `av-neural-maze-ab.diagnostic.test.ts` (crowd cases TRAIN/HOLDOUT in `avCrowdCases.ts`, maze HOLDOUT-24) with arm `v3` next to `off` / `auto(v2)`. Metrics: reached, time, contact frames, min gap, handovers/min, reverse metres, watchdog fails. Gate (as Phase 3): crowd HOLDOUT reached >= classic AND contact frames <= classic; maze HOLDOUT not worse beyond noise; v3 must also beat v2 `auto` or it stays optional.
- New cases that only v3 can solve: parked-in bay/dead-end corridor (the car must back out), narrow gate overshot by the planner; classic stack baseline on the same cases.
- Example worlds: sync into `public/exampleWorlds/<id>/` (never leave edits only in IndexedDB), add a new world e.g. `av_neural_v3` (copy of `av_neural_crowd` with `neuralPolicy: 'v3'`) or flip the param in the existing ones only after the gate; document the rows in `agent-context/example-worlds.md` (rule `agent-mcp-example-world-sync.mdc`; keep ids generic, `agent-mcp-no-project-names.mdc`). Playwright screenshot after the headless pass.
- Do not run the Phase-5 A/B while a training run occupies the CPU.

### 8.4 Known v3 weaknesses to guard against
- **It never brakes:** gas ~ +1 almost everywhere, vT ~ 27.5 m/s even in clutter; rare gas < 0 only with an aim behind. Guards: `neuralVMax` cap (12-15 m/s), AEB stays active, watchdog 'aeb' fail, auto trigger only on clutter (not open road at full speed).
- **Field / crowd losses are forward crashes** (holdout field 65 %, crowd 74 %; reverse share there ~1 %): reverse does not rescue it. Do not sell v3 as better in dense clutter; expected wins are bays/corridors (94 % / 89 %) and free (100 %), slalom 83 %, maze 73 % (below the classic AV 24/24).
- **Speed-capped retrain `v3cap` is in progress:** wait for it before the A/B (same 24 inputs; if H or the input set changes the swap is no longer a pure weight swap). Plan the A/B arms: v2, v3 (uncapped + `neuralVMax`), v3cap.
- Reverse is trained at the 4x8 car / pedal gain 1200 only; the reverse hull offsets use the same 4.1/2.1.
- Training chains have clean, noiseless legs; real routes/carrots jump (replans) -> keep the 0.5 s hold and watch for aim flipping behind the car (spurious reversal).

### 8.5 Risks
- Spurious reversing in traffic (a rear car behind): no rear-mover logic exists; reverse only with rays 120/180/-120 clear, and cap by `neuralRevMaxM`.
- Handover into a reversing state: the classic longitudinal stage has actuator bookkeeping for forward only; hand back only at |v| < 1 m/s.
- Watchdog false positives on short reversals (stall window 3 s).
- Overfitting to leg statistics: AV sends longer, smoother aims than the synthetic legs.

### 8.6 Open questions for the user
1. Is v3-forward-only (Step 3a, no reversal, safe speed cap) an acceptable first release, with reversing only as a separate step 3b (stuck recovery)?
2. Which arm decides: v3 vs the promoted v2 `auto` on the same crowd/maze HOLDOUT, or only "not worse than classic"?
3. Wait for `v3cap` before any A/B, or A/B the shipped gen1000 now with `neuralVMax`?
4. Should reversing be allowed in `self_hunt_flexible` (chasers behind) or only in maze/bay worlds?
5. Is a dedicated v3 world (`av_neural_v3`) preferred over flipping `neuralPolicy` in existing worlds?

## Critical files
`src/policyEvolution/policy.ts` (+ new `policyStage.ts`, `command.ts`), `courses.ts`, `episode.ts`;
`src/globalPipeline/buildAvStackGlobalBehaviorLibrary.ts`, `src/globalPipeline/avStackStagePaths.ts` (+ new `public/global/transformers/av-stack/av-neural.js`);
`public/global/transformers/av-stack/av-control-lateral.js`, `av-control-longitudinal.js`, `av-supervisor.js` (yield branches next to `av.manual`);
`src/test/fixtures/avEvasionRunner.ts`, `src/avEvolution/eval/episode.ts`, `src/avEvolution/maze/arenaWorld.ts` (+ new `src/test/fixtures/avCrowdCases.ts`).
