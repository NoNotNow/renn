# Plan: improve the fleeing car in `self_hunt_flexible`

State 2026-10-10 (local session). Focus car `entity_1779823253285_brtkx1p` (stack binding `global_av_autopilot`, `mazeModule: true`, 11 chasers + `car`).
This file is the diagnosis + fix plan for the four weaknesses the user observed in the browser. Read with [feature-av-stack.md](./feature-av-stack.md).

## Diagnostic harness (active)

- `src/test/scenarios/av-flee.diagnostic.test.ts` — env-gated (`AV_FLEE_DIAG=1`), headless, defined start, fresh world per run. Measures all four weaknesses per run: flee-goal switches/age/quality (W1), speed + limiter by chaser count < 30 m (W2), manoeuvre + reverse speeds + caps (W3), slow episodes, manoeuvre clusters, disturbance recovery (W4). Writes per-run + pooled json to `test-results/avflee/`.
- `tools/av-flee-compare.mjs <base> [<variant>...]` — paired (seed x start) before/after table with bootstrap CI and win/loss per metric.
- Baseline (4 seeds x 60 s, `AV_FLEE_NAME=base`): mean speed 10.1 m/s, mean speed with >= 3 chasers < 30 m **1.4 m/s**, 4 catches, 17 goal changes/min (flee switch age median 2.1 s), 38.7 % bad flee goals, 30.8 % of time in slow episodes, reverse mean 4.8 m/s.

## Diagnosis (root cause -> evidence -> fix -> metric)

### W1 flee goals switch too fast / point into dead ends

Root causes in `av-ego.js` `fleeSim()` (gapCommit layer):

1. `curBlocked` bypasses the switch hysteresis: a committed gap goal is re-scored every 0.3 s (`escapeEvalEvery`); when its free run on the *growing* persistent static map drops below `gapWallMin` (60 m), it is replaced IMMEDIATELY (line ~1524: `!cur || curBlocked || bestS > cur.score + escapeSwitch`) — the `escapeSwitch` (6) margin never applies. As the car maps more walls while driving, goals keep getting "blocked" and flip.
   Evidence: flee-to-flee switch age median 1.5-2.8 s, p10 0.3-0.4 s (vs the intended 6 s margin / 4 s `fleeHold`); bearing change median 39-135 deg.
2. Goal clamp lands inside the inflated wall: a heading whose free run is short gets its goal clamped to `Dg = max(8, best.run - 3)` — but the diagnostic's inflated grid (hull 2.5 m) scores that goal "in wall".
   Evidence: gap goals "inside inflated wall" 17-38 % (seeds 3/4), dead end 25-33 %.
3. Corridor goals win the score: `escapeSim` min-distance is capped at `escapeSafe` (20) — with pursuers near, many headings score equal; `goalOpenGap` (6) only partially penalizes a maze-corridor heading whose straight run is long.
   Evidence: 38.7 % of flee goals bad; gap goals in labyrinth 0-75 % (seed 2: maze goals 85 % in labyrinth is BY DESIGN — `mazeStep` routes to the nearest exit through it; not counted as fixable by the openness score).

Fix (world params, no stage change — sweep with `AV_FLEE_PARAMS` in the diagnostic first):
- `escapeEvalEvery: 0.6` (halve the re-eval churn), `gapWallMin: 40` (a goal is only "blocked" when truly walled in), keep `escapeSwitch` 6.
- Stage fix (gated, later): `curBlocked` requires the block to persist ~0.5 s before replacing the goal; clamp `Dg` to `run - hull inflation - 1` instead of `run - 3`.
Metric: `goalChangesPerMin` (target < 10), `fleeSwitchAgeMedian` (target > 4 s), `badGoalShare` (target < 20 %), no regression in catches / mean speed.

### W2 car gets extremely slow when surrounded by chasers

Root cause is NOT the speed planner: with >= 3 chasers < 30 m the limiter is `maneuver` in 79-87 % of those frames (route planner manoeuvre mode at shuffle speed 3 m/s). The cascade into it:

1. AEB treats moving chasers as static walls: `av-aeb.js` raycasts `need = v²/(2·aebDecel 7) + margin` ahead (65 m at 30 m/s) and brakes to a stop on ANY body in the strip — a pursuing chaser has no velocity-based exemption.
   Evidence: 5-6 over-braking events/min in free driving, 100 % with `av.aeb` set, start speeds 16-35 m/s, nearest chaser < 30 m in 17-40 % (the rest: static walls, see 2).
2. AEB fires on static walls before the speed planner: the free-path limit uses `chasedDecel` 9 (> aebDecel 7), so the planner permits speeds the AEB then clamps.
   Evidence: over-braking with mean start speed 31-35 m/s and no chaser near (seeds 1/3); `cruiseSpeed: 1000` lets the car reach 35+ m/s toward far walls.
3. Stopped -> manoeuvre: `wantManeuver` at |v| < 1.5 with a reverse-first route (`maneuverEntryStopSpeed` 0.3 / `maneuverEntrySpeed` 1.5) latches the shuffle mode.
   Evidence: entry causes `route starts in reverse` 3-5 of 7-8 entries (seeds 2/4); speed before entry median 0.

Fix:
- World param: `chasedDecel: 7` = aebDecel (the planner then brakes no later than the AEB on static walls). Metric: `overBrakeEventsPerMin` (target < 2), `overBrakeLostMedian`.
- Stage fix (gated, later): AEB closing-speed awareness — for a hit that is a tracked threat (`av.threats`, vx/vz known), brake only for the closing speed component (`v_rel` along the ray), not the own speed. Risk: touching-side / av-stack integration tests, `av_maze_escape`, `av_fleet_eco` — needs their paired gates.
- Stage fix (gated, later): while `av.fleeing` is true and >= 2 threats are near, the AEB target for threats could be "slow to passing speed" (yield but not standstill). Only with the closing-speed fix above; a standstill is the worst state for a hunted car.
Metric: `near['>=3'].meanV` (target > 6 m/s), `meanSpeedUnder3`, `overBrake*`, catches.

### W3 reversing slower than necessary

Root cause: the world runs the stack in default `style` (comfort): manoeuvre shuffle `maneuverSpeed` 3 (world does not set it), runs capped by `maneuverRunSpeed: 7` only when the REMAINING run > 8 m (`runTotal` opt-in not set — a 13 m reverse run drops to 3 m/s for its last 5 m). The `chaser-evasion` preset was designed for exactly this car ("manoeuvres / reversing as fast as the plan can be stopped, not 3 m/s") but the world binds none of it: no `preset`, no `style`.

Evidence: reverse |v| mean 3.3-7.8 m/s; commanded cap vm buckets dominated by `=3.0 (maneuverSpeed)`; `waiting-for-rest` 4-11 % of manoeuvre frames.

Fix (world params only):
- `style: 'escape'` (unlocks `escapeManeuverSpeed` 15 / `maneuverDecel` 10: every run as fast as it can still be stopped; also turns on `manTrack`) + `runTotal: true` + `mazeManeuverSpeed: 4.5` (shuffle floor in maze mode).
Metric: `revSpeedMean` (target > 7), `revCapMean`, `maneuverTimeShare` down, catches not worse.

### W4 after a disturbance the car creeps and reverses for a long time

Root cause: the AEB hard-brakes (see W2) leave the car stopped near walls/chasers; `wantManeuver` latches the shuffle mode; the hand-back (needs a >= 10 m forward run, `handbackFree`, clear ahead on the obstacle memory) is refused while chasers sit in the memory ahead, and the next stop re-enters within seconds.
Evidence: 31-45 % of total time in slow episodes, cause `maneuver` in 94-96 % of those frames, 72-77 % of them reverse; manoeuvre re-entry within 10 s: 5-6 of 7-8 entries; clusters up to 34 s; disturbances 6-9 per run (mostly `hard-brake` = AEB), recovery to > 12 m/s median 0.5-5.6 s, p90 up to never.

Fix: follow from W2 (fewer AEB standstills) + W1 (less goal churn behind the car). No separate change planned; verify with `slowTimeShare` (target < 15 %), `slowDurMedian`, `clusterDurMax`.

## Step 2 done (2026-10-10): winning params adopted into the world

Sweep (paired vs base, 4 seeds x 60 s, `tools/av-flee-compare.mjs`): v-esc (style escape), v-aeb (chasedDecel 7), v-goal each improved; the combo won clearly and was written into `self_hunt_flexible/world.json` (focus binding): `style: 'escape'`, `runTotal: true`, `mazeManeuverSpeed: 4.5`, `chasedDecel: 7` (was 9), `escapeEvalEvery: 0.6`, `gapWallMin: 40` (was 60).

Paired result (world-fix vs base; bootstrap CI over 4 runs):

| metric | base | world-fix | note |
|---|---|---|---|
| mean speed | 10.1 m/s | **20.8 m/s** | 4/0/0, CI [4.5, 15.6] |
| time with a chaser < 30 m | 47.4 % | **10.5 %** | 4/0/0 |
| time in manoeuvre | 42.9 % | **12.7 %** | 4/0/0 |
| time in slow episodes | 30.8 % | **8.0 %** | |
| manoeuvre cluster max | 24.9 s | **7.3 s** | 4/0/0 |
| bad flee goals | 39 % | **25 %** | 3/0/0 |
| reverse speed mean | 4.8 m/s | **5.9 m/s** | 4/0/0 |
| catches | 1.0/run | 0.25/run | 3/1/0 |
| flee time with chaser > 60 m | 11 % | 38 % | the car outruns them and keeps the escape goal longer (by design, `fleeRelease`) |

Watch / next: `fleeSwitchAgeMedian` did not improve (2.1 -> 1.4 s; the goal-churn fix needs the gated stage change below), and slow-episode median duration rose (fewer but longer episodes). Hunt-game integration + maze-profile tests on this world stay green (11/11).



## Order of work (cheap classic fixes first; every step: baseline name vs variant name, paired compare, then world edit + commit + push + deploy)

1. **Param sweep, no code change**: `AV_FLEE_PARAMS='{"style":"escape","runTotal":true,"mazeManeuverSpeed":4.5,"chasedDecel":7}'` etc. per fix table above, `AV_FLEE_NAME=v1...`; `node tools/av-flee-compare.mjs base v1 v2 ...`.
2. Adopt the winning param set into `public/exampleWorlds/self_hunt_flexible/world.json` (world file only — zero risk to `av_maze_escape` / `av_fleet_eco` / `self_drive_av`; `exampleWorld.test.ts` checks disk == exporter, so re-export if the exporter defaults change).
3. **Stage fixes (gated)**, each with its own A/B: AEB closing-speed awareness (av-aeb.js), gap-goal blocked-persistence + clamp fix (av-ego.js). Gates: this diagnostic paired + `av_maze_escape` / `av_fleet_eco` / `self_drive_av` headless suites must not regress (they share the library stage code; `npm run sync:global-pipeline` after any stage change).
4. **Smart integration (later, per [plan-policy-in-av-car.md](./plan-policy-in-av-car.md) §8)**: the AV logic (flee layer / route planner) sets the target-direction vectors for the neural v3 net (forward + reverse) in mazes / dense chaser packs / instead of the slow manoeuvre mode; hand-over, fallback, training changes (chasers / moving obstacles) and the AV A/B gate (`AV_NEURAL_V3_WEIGHTS`, crowd + maze diagnostics) before enabling.

## Risks / guardrails

- Stage changes touch every AV world (library code): always `npm run sync:global-pipeline`, re-export example worlds, run the AV suites named above before shipping.
- `style: 'escape'` also changes AEB probing (chord ray while manoeuvring) and turns on manoeuvre path tracking — covered by the paired diagnostic; watch catches (contact must not increase) and `speedRoughness`.
- The user verifies via the live site (deploy after each finished step).
