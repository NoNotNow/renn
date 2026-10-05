# AV stack — industry-style self-driving pipeline (nested pipes)

Experimental second approach next to the legacy **Pipe3** stack (Umlenker → direction → auto-brake). It follows the
classic autonomy architecture — **sense → plan → control → safety** — with one transformer stage per module, grouped as
**nested, configurable pipes** (manifolds, see [feature-transformer-pipes.md](./feature-transformer-pipes.md)).

Sources: `public/global/transformers/av-stack/*.js` · fixture/builder: `src/test/fixtures/avStackWorld.ts`
(`applyAvStack`) · tests: `src/test/scenarios/av-stack.integration.test.ts`.

## Use it in any project (global library)

The stack ships as **Organize → Global** pipes (`public/global/shipped-global-behavior-library.json`, refreshed on Builder
open when the checksum changes):

| Global pipe | What it is |
|---|---|
| `global_av_stack` | Full vehicle: `av_mission` (waypoints) + autopilot + `car2` actuator. **Assign to one object and it drives.** |
| `global_av_autopilot` | Sense / plan / control / safety only — bring your own target source and actuator |
| `global_av_sense`, `global_av_plan` (route + local), `global_av_control`, `global_av_safety` | The nested layers, usable on their own |

In another project: Organize → Global → `AV Stack` → *Copy to project* / *Assign* (Link or Copy), or Transformers tab →
**+ Add Pipe**. Copying brings the child pipes and all 12 stages along (`copyGlobalPipeIntoWorld` is recursive).
Pipe params (`cruiseSpeed`, `vehicleWidth/Length`, `safetyMargin`, `maxCurvature`, `goalTolerance`, `debugDraw`) are seeded
into the binding; edit them in the pipe config drawer, per nested layer if wanted.

Set your route on the **AV Mission** stage: `waypoints: [[x, z], ...]` (world metres, floor plane), `acceptRadius` (9),
`mode` `'loop'` (default demo square) or `'stop'`. The mission is position-only (no heading demanded). Optional stack params:
`drivableArea: [xmin, xmax, zmin, zmax]` adds virtual walls at the edge of your floor so the car stays on it.
The object should be a dynamic body of roughly the default vehicle size (2 × 1 × 4, front = −Z); set `vehicleWidth` /
`vehicleLength` otherwise. Regenerate the library: `npm run sync:global-pipeline`.
Test: `src/test/scenarios/av-stack-global-pipe.integration.test.ts` (foreign project → copy → assign → drives around an obstacle).

## CPU budget / economy mode (2026-10-04, many cars per world)

Binding param `budget`: `'full'` (default, unchanged behaviour) | `'normal'` | `'eco'`. Measured with 6 cars on an open map (`av-fleet-budget.test.ts`, profiler chain time per car per frame): full ~3.3 ms, normal ~1.6 ms, eco ~1.2 ms (ratio ~0.35-0.4); all cars reach their goals in every mode. The time ratio is the only machine-dependent number; the test bar is eco < 0.8 x full.

- **Fixation** (`normal` + `eco`, `av-motion-planner.js`): when the aim point (route carrot or goal) is within `fixAimDeg` 35 of the heading, no tracked threat (`threatIds`) is within `fixThreatRange` 150 m, no MOVING costmap mark (`av.movers`) is within `fixDynRange` 12 m or inside a `fixDynBand` 6 m band beside the arc, and the footprint corridor of the pure-pursuit arc to the aim is free (hard + soft margin), the planner drives that arc (`av.plan.fixed`, `av.fix`) instead of sampling ~190 candidates. Anything failing -> the full planner that frame. A blocked way is handled by the route planner: its carrot is the next waypoint the car then fixates on. Watch `av.fixWhy` (`fix`, `cone`, `near`, `slow`, `threat`, `dyn`, `curve`, `blocked`).
- **Narrow perception** (`eco`, `av-perception.js`): while fixated (`av.prevFix` from last frame), the dense cone is `fixConeDeg` 24 around the aim (3 deg rays), sides every `ecoSideEvery` 6th frame, coarse 360 sweep every `ecoSweepEvery` 20th, extra ray planes every 2nd frame.
- **Fewer route refreshes** (`eco`): `routeInterval` x `ecoRouteFactor` 2.5 while fixated. All budgets: the reverse-cruise checks build their costmap grid lazily (only when the goal is behind).
- `fixThreatRange` 150 m: with 60 m the eco car collided in `corner-trap` (30 m/s pursuer closes 60 m in ~1 s). In a world where every other car is a threat (self_hunt_flexible) the car is rarely fixated near them: hunted = full attention.
- **Time-based threat gate** (`fixThreatTime` 5 s, `fixThreatMin` 25 m, `fixThreatVMin` 2 m/s, `fixThreatRange` 90 m): a tracked threat blocks fixation only when it is within `fixThreatMin` or `dist < fixThreatTime * max(closing speed along the line of sight, body's own speed, fixThreatVMin)` (own speed because a homing body turns onto the car; closing speed uses the ego velocity vector). `fixThreatTime` 0 = old rule (any threat within `fixThreatRange`). Default range is 90 m (what the old rule effectively used: its ego-frame list was cut at 90 m); 150 m made `corner-trap` collide (0.2 m gap). Savings on self_hunt_flexible are small (~3 % work, focus car 30 s) because threats rarely block there; full budget is unaffected.
- **Eco in manoeuvres / field rebuilds** (self_hunt_flexible focus car, seed 2, 30 s; histogram of frames: 80 % were multi-point manoeuvres (`av.override`, no `fixWhy` set), near 10 %, cone 5 %, fix 4 %, threat 1 %; weighted work of those frames 58 % manoeuvre, 33 % near; stage split perception 21 %, route 55 % mostly goal-field cells, motion planner 8 %). Two eco-only changes, work 638k -> 349k (-45 %): (1) `ecoFieldFactor` 3: a change of the stopped-body stamps of the goal field (they flicker as lidar re-sees them, ~1100 changes / run) waits 3 x `fieldEvery`; new static map points and goal-cell changes keep the normal rate; `ecoFieldExact` (default on): a map point landing in an already blocked cell does not mark the field dirty. (2) `ecoManeuver` (default on): during a NON-maze manoeuvre (`input.avMan`, set by the motion planner from last frame's `av.override`, maze manoeuvres excluded) perception uses the eco ray set (cone `ecoManConeDeg` 100 around the gear direction, eco side / sweep rates). Slowing the field for all dirtiness, or narrowing perception in maze manoeuvres, broke `maze-dead-end` (chaotic hidden-end case), hence the restrictions. Full budget unaffected.
- **Work counters (deterministic CPU measure).** `av-ego` creates `av.work` = `{ rays, freeLen, cands, astarExp, fieldCells }` fresh each frame; perception counts raycasts, the motion planner `freeLength` sweeps and candidates, the route planner A* expansions and goal-field cells settled (integer increments only, no behaviour change). Ego adds last frame's tally to a cumulative total published as watch `av.work` (`'rays freeLen cands astarExp fieldCells'`, one frame behind). `av-fleet-budget.test.ts` asserts the weighted eco / full work ratio (weights: `WORK_WEIGHTS` in `fixtures/avFleet.ts`), not wall-clock. Measured (6 cars, spread, 16 s): eco / full 0.43, normal / full 0.61; bar 0.6 for eco.

**Moving-body marks (the pink ticks).** Hits on a non-static body are stored relative to that body and move with it; once it has moved they expire after `dynTtl` 2 s unless re-seen (`memFollow`, default on). Before, they stayed at the hit position for 15 s (trail up to 135 m long). Test `av-perception-marks.test.ts` (background traffic crossing ahead: 0 ghost marks; red check `memFollow: false`: ~46 000 ghost mark-frames). Exception: tracked threats keep the old fixed marks unless `memFollowThreats: true`, because following measurably hurt evasion (corner-trap 5.7 -> 3.5 m min gap, full sweep 61 -> 59/75): their recent trail acts as a buffer the pursuit prediction does not replace.

Tests: `av-evasion-scenarios.eco.test.ts`, `av-maze-scenarios.eco.test.ts` (all scripted scenarios with `budget: 'eco'`, same criteria; suites in `fixtures/avEvasionSuite.ts` / `avMazeSuite.ts`), `av-fleet-budget.test.ts`; report with stage table and fixation outcomes: `AV_FLEET=1 AV_FLEET_LAYOUT=spread|ring AV_FLEET_N=8 AV_FLEET_BUDGETS=full,normal,eco npx vitest run src/test/scenarios/av-fleet-budget.diagnostic.test.ts` (fixture `fixtures/avFleet.ts`: n copies of the example car; `ring` = all cross the middle, worst case).

## Pipe tree

```
av_stack                         binding.params = stack-wide config (cruiseSpeed, vehicle size, maxCurvature …)
├─ tf_mission                    waypoint source (targetPoseInput / wanderer) — world specific
├─ av_sense
│   ├─ av_ego                    state estimate: speed, yaw rate, curvature, simulated clock
│   └─ av_perception             360° range ring + obstacle memory (local costmap)
├─ av_plan
│   ├─ av_plan_route
│   │   └─ av_route_planner      Hybrid-A* every 0.8 s → route + `carrot` for the local planner; takes over for multi-point turns (reverse-first route / stuck)
│   ├─ av_plan_local
│   │   ├─ av_motion_planner     sampling planner: turn-then-straight paths, swept footprint (margin grows with speed), chases the carrot
│   │   └─ av_speed_planner      v = min(cruise, stopping distance, clearance gap, lateral accel, final-goal approach)
│   └─ av_supervisor             hold at final goal
├─ av_control
│   ├─ av_control_lateral        curvature feed-forward + feedback, steering-rate limit
│   └─ av_control_longitudinal   speed PI with actuator deadband feed-forward (forward + reverse)
├─ av_safety
│   └─ av_aeb                    independent time-to-collision brake monitor
└─ tf_car                        car2 actuator
```

Stages talk through the blackboard `input.av` (`ego`, `scan`, `points`, `goal`, `plan`, `mode`, `needManeuver`). It is
rebuilt every frame; cross-frame memory lives in each stage's own `state`.

## Configuring

- **Whole stack:** `entity.transformerPipeStack[0].params` (same-key merge into every stage).
- **One layer:** `binding.scopeParams['stack:0/member:av_stack:<index>…']`. `applyAvStack({ layerParams })` writes the
  keys for `sense | plan | planRoute | planLocal | control | safety`.
- **One stage:** `stageParams[logicalStage]` (stage registry level, shared by all entities using the stage).
- **Ablation:** `applyAvStack(world, { disable: ['routePlanner'] })` — used for the red-check.
- Per-stage params are documented in the header comment of each `.js` file.

## Using the AV autopilot in your game (presets, 2026-10-04)

Assign `global_av_autopilot` (or `global_av_stack`) and set on the binding: `preset`, `cruiseSpeed`, `vehicleWidth` / `vehicleLength` (or let `av.vehicle` read the box collider), a goal source, and `threatIds` if something hunts the car. Nothing else is needed; explicit params always win over the preset (binding, layer scope and stage params alike).

| `preset` | Turns on |
|---|---|
| unset / `'none'` | nothing: the raw per-stage defaults (how every world behaved before presets; the example worlds keep their hand-tuned params) |
| `'car'` | `selfCalibrate` (the longitudinal actuator identifies G / D at the first launch: no per-vehicle `gainInit` / `maxAccel` tuning), curvature smoothing + plan hysteresis, footprint-aware hand-back, travel-direction scan, goal watchdog, prediction params (inert without `threatIds`) |
| `'chaser-evasion'` | `car` + `style: 'escape'` (manoeuvres / reversing as fast as the collision-free plan can still be stopped, closed-loop path tracking, AEB along the arc) + evasion tuning (`wThreat`, `threatHitFloor`, `minSpeed` 9.4, `comfortDecel` 4) |
| `'maze'` | `car` + persistent static map + 2D goal-distance field |
| `'arena'` | `chaser-evasion` + `maze` |

Mechanics: `av-ego.js` holds the tables and publishes `av.preset`; every stage merges its own params over it (cached per params object). Tests: `av-vehicle-reuse.<vehicle>.test.ts` drive a heavy cube, a light car on ice, a small car and a 6 x 14 truck with nothing but `preset` + `cruiseSpeed` (+ `threatIds`) through open road, goal behind a wall, U-trap, pocket escape and a head-on chaser (cases in `fixtures/avReuseCases.ts`; `ArenaSpec.vehicle` / `carParams`).

Opt-in route-planner experiments (default off; each regressed an existing scenario when on by default): `headingHeuristic` (turn around instead of reversing toward a goal behind; breaks reversing out of an 18 m alley: `reverse-escape`, `open-road-reverse`), `mazeLatch` (maze-mode hysteresis; breaks `pocket-escape`), `runTotal` and `mazeManeuverSpeed` (faster maze shuffles; break `maze-gate-exit`).

## Debug overlay (Builder visualize mode; no-op in Play/tests)

Every stage draws with `api.visualizeLine`; switch off per stack/layer/stage with `debugDraw: false`.

| Colour | What |
|---|---|
| mint polyline + poles, **yellow** pole | whole mission route, active waypoint (`av_waypoint_viz`) |
| **yellow** line | car → current goal |
| **red** rays | lidar hits (every `debugRayStride`-th ray) |
| **magenta** ticks | costmap memory points (nearest `debugMaxPoints`) |
| dark **blue** fan | candidate arcs (collision-free part) |
| **green** arc / **orange** tail | chosen arc / where it would collide |
| **magenta** polyline + mast | Hybrid-A* manoeuvre path while manoeuvring; orange = current segment end |
| **cyan** | velocity vector |
| **white** | commanded steering direction |
| dark gold / **red** | AEB look-ahead / AEB triggered |
| mast over car: green / orange / white | drive / manoeuvre requested / hold |

`self_drive_av` is the showcase: parkour + 10 coloured extra obstacles + a return lane (9 waypoints, `buildAvShowcaseWorld`).

## Mission acceptance and map prior (set by `applyAvStack`)

- `waypointRadius` (default 6 m) raises the mission's `positionEpsilon`; `waypointHeadingTolerance` (default 180°) makes
  waypoints position-only. The stock `targetPoseInput` also demands the waypoint **heading** within 20°, so a car that
  passes a waypoint at the wrong angle never "reaches" it and orbits forever.
- `goalTolerance = waypointRadius − 0.5`: arrive/hold zone of the final waypoint (a goal inside the ~8 m turning circle
  cannot be hit exactly).
- `drivableArea` is derived from the ground slab (inset `edgeInset` 3 m); perception turns its edge into virtual walls so
  the car stays on the platform.

## Tuning for speed vs safety

- Speed limit from the **lateral gap** to obstacle surfaces (`clearSpeedBase 5`, `clearSpeedGain 3.5`): room beside an
  obstacle → full speed (`cruiseSpeed 10`), squeezing past → slower. Hard collision margin = `safetyMargin 0.5 + 0.05·v`.
- Stopping-distance rule uses the chosen path's free length; paths are turn-then-straight so a path that swings around an
  obstacle no longer "collides" at the horizon and throttles the car.
- AEB stays as an independent last line.

## Plant facts the controllers are built around (car2, `power: 340`)

- Static-friction **deadband**: throttle < ~0.35 does not move the car; 0.4 ≈ 2.4 m/s², 0.5 ≈ 18 m/s² → longitudinal PI adds a
  feed-forward `deadband` and caps at `maxThrottle`.
- Curvature ≈ **0.12 · steering** up to ~10 m/s (min turn radius ≈ 8 m) → `maxCurvature 0.115`, `kappaPerSteer 0.12`.
- Yaw is geometric: `yawRate = v·κ`, so reverse arcs use the same sign convention as forward arcs.
- `steering_angle == 0` means "no command" in car2 (wheel re-centres); the lateral stage writes exact 0 deliberately.

## Why it differs from the legacy stack

| Legacy Pipe3 | AV stack |
|---|---|
| Reactive rules + `Date.now()` timers (results depend on machine speed) | **Simulated time only** (`av_ego` owns the clock) → deterministic headless runs |
| Gates keyed to one site (`tightCylinderUmlSite`, z-ranges) | Generic: costmap + footprint planning, no site constants |
| Tight cylinder start stalls (`it.fails`) | Plans a K-turn (reverse, swing, forward) and drives around |
| Full course holds only for spawn `center` | Full course passes for all five parkour spawns |

## Results (headless, `av-stack.integration.test.ts`)

All 32 cases green: tight + approach cylinder, 24-seed tight perturbation grid (no permanent stall @800f), determinism (identical end pose twice),
seg1 / beside-gate / full-course × 5 spawns, seg3 sphere, cube goal-behind × 4 shapes, structure/param-scope tests.
**Red-check:** `disable: ['routePlanner']` makes the tight start stall at its spawn.

## Known limits / next

- `SELF_DRIVE_PARKOUR_CYLINDER_HUG` (spawn centre *inside* the cylinder) is not a valid start for any planner; unused by tests.
- Maneuver planner executes open-loop with guard re-planning; a tracking controller on the planned path would be tidier.
- Overlay cap raised to 200 lines (`COORDINATE_OVERLAY_MAX_COUNT`; was 16, which silently dropped later stages' lines).
- Costmap is hit-point memory (TTL 15 s), fine for static worlds; moving obstacles need tracking/prediction.
- The example world `self_drive_av` uses the fixture variant (stock `targetPoseInput` mission); the global library uses `av_mission`.

## Goal sources (mission vs. wander) — swapping the target generator

The autopilot only needs a **goal**; any stage that publishes it can sit in front:

- `input.target = { pose: { position: [x, 0, z] }, speed }` — what planners read (x/z, floor plane; heading is ignored).
- optional `input.goalSource = { index, waypoints: [[x, z], ...], isFinal }` — `av-ego` adopts it as `av.mission` (it rebuilds `input.av` every
  frame, so a source that runs *before* ego hands its mission over this way; `av-mission`/`av-wander` at 2.5 write `av.mission` directly).
  Without it every goal counts as final (speed planner brakes for it, supervisor holds there) — right for a single goal, wrong for endless goals.
- **`av-wander`** (`global_av_wander`, ready-made pipe `global_av_stack_wander`): random goals inside `area` / the stack's `drivableArea`
  (default ±40 m around the start), `acceptRadius` 9, `minDistance`/`maxDistance` 25/60, `giveUpAfter` 45 s (unreachable goals are replaced), `seed`
  (reproducible). `isFinal` is always false, so the car keeps cruising. Test: `av-stack-wander.integration.test.ts`.
- The stock `wanderer` *preset* is **not** a drop-in: it samples 3D positions + random rotations and only counts a goal as reached within
  `positionEpsilon` (0.05 m) in 3D, which a car never satisfies — use `av-wander`.

To replace the mission in a project: focus the stack pipe → `+` → Transformer → **Global library** → *AV Wander* → delete the old mission stage
(execution order follows `priority`, not list position: 2.5 keeps it right behind ego).

## Goal contract (any source, same autopilot)

The autopilot does not care where a goal comes from — only about the engine's `TransformInput.target`:

| Field | Meaning |
| --- | --- |
| `target.pose.position` | Goal; the AV uses X/Z (floor plane), Y and rotation are ignored. |
| `target.speed` | Speed hint (m/s). |
| `target.isFinal` | `false` = more goals follow (wanderer, waypoint list): the car keeps cruising. Absent/`true` = a single final goal: brake and hold there. |

Producers that satisfy it: `targetPoseInput`, **preset `wanderer`** (now `planar` mode + `isFinal:false`), **preset `follow`** (goal = another entity's pose, e.g. chase a ball or another car),
`av-mission` (waypoints), `av-wander` (random goals in the drivable area), or any custom stage that sets `input.target`.
`av-ego` turns a non-final `input.target` into `av.mission`, so the speed planner / supervisor behave. Goal sources can be top-level stages next to the autopilot pipe
(`av-stack-goal-contract.integration.test.ts` runs wanderer and follow that way).

Preset wanderer for a car: `planar: true`, `angular: false`, `positionEpsilon` ≈ 9 (the AV's acceptance radius), `perimeter.halfExtents` y = 0. `follow` targets sit inside the
followed object's footprint, so give the stack `goalReach`/`goalTolerance` a few metres more than the object's radius (standoff).

## Speed: what `cruiseSpeed` does and what else limits the car

`cruiseSpeed` (pipe param, seeded 10) is the **upper bound**; the car drives the minimum of the limits below. `av.vLimit` in the watch panel names the active one
(`cruise | free | near | route | curve | goal`). Verified in `av-stack-params.integration.test.ts`: the param is taken at start-up and live while driving.

All of these are **pipe params** (drawer on the AV pipe, labelled; defaults in brackets):

| Param | Effect |
| --- | --- |
| `minSpeed` [4] | Lowest speed while driving (bends, near obstacles); not applied while arriving at the final goal (`goalCrawlSpeed` [2]). |
| `obstacleSlowRadius` [5 m, 0 = off] | Only obstacles within this distance **of the car's hull** slow it. Farther ones, and everything behind the rear axle, never do. |
| `obstacleSlowFactor` [0.5] | Speed right next to an obstacle as a fraction of `cruiseSpeed`; rises linearly to full cruise at the radius. |
| `comfortDecel` [5 m/s²] | **Auto-brake for obstacles in the path**: `v ≤ sqrt(2 · decel · (free distance − stopMargin))` — a far obstacle in the path only matters once it is within braking distance. The independent AEB stage (`av-aeb`) still guards the last metres. |
| `maxLatAccel` [9 m/s²] | Cornering limit (`sqrt(a / κ)`) for the local arc and for route bends. Raise for grippier/more agile bodies. |
| `goalDecel` [3] | Gentler braking used for the final approach so the car can stop inside the hold radius. |

**Curve limit on a straight (2026-10):** the per-frame chosen candidate curvature wobbles left/right on a straight road (discrete kappas), and `sqrt(maxLatAccel / |kappa|)` of that wobble capped
`open-road-speed` at 23 m/s (`curve` in 64% of frames). `av-speed-planner` now uses the signed kappa smoothed over `curveSmooth` s (0.6 in `self_hunt_flexible`, 0 = raw) and ignores
`|k| < curveDeadband` (0.004 1/m); open-road peak is ~32 m/s. `av-motion-planner` also has `horizonClear` (m, 0 = off: floor for the look-ahead; tried 60-100, it made head-on flaky, so off) and
`switchMargin` (3 in `self_hunt_flexible`, 0 = off: plan-switch hysteresis, keeps last frame's candidate unless another is cheaper by the margin; fewer blue-line flips, steering reversals/s drop ~10-25%).

Other limits: the planning horizon and sensor range scale with the stopping distance of `cruiseSpeed` (they used to cap everything at 15.8 m/s), the final-goal approach, the AEB and the car's
`power` / `maxThrottle` (0.46) for acceleration. The old "side clearance" speed limit (which looked 25 m ahead and 4 m sideways) is gone.

Layering reminder: pipe params (binding, then nested scope) **override** a stage's own `params` for the same key — edit speeds in the pipe's param drawer, not in one stage's params.
A goal source's own `speed` (e.g. preset `wanderer` `speed`) is only a hint the AV ignores. Preset `wanderer` publishes `isFinal:false` only in `planar` (car) mode.

## Direct aim, escape from contact, edge-case world

- **Direct aim (motion planner):** besides the fixed turn angles each curvature gets one candidate that turns exactly until the car points at the goal, then drives straight; it is judged at the goal, so a free way is driven in a straight line instead of an arc.
- **Escape from contact (route planner):** when the Hybrid-A* finds no path at the comfort margins (corner touching a long wall), `plan()` retries with margins 0.05 / 0.02 / 0 m. A crawl watchdog (`crawlTime`, default 6 s: < 2.5 m moved while slow) also triggers the manoeuvre planner when the car scrapes along an obstacle instead of standing still.
- **Edge-case test set:** `src/test/fixtures/avEdgeWorld.ts` (`AV_EDGE_CASES`, `wallAgainstCar`, `runEdgeCase`) + `src/test/scenarios/av-edge-cases.integration.test.ts`. Add every new "car gets stuck" situation there (expects: arrives, never leaves the floor, longest stall < 300 frames).

## Snapshot (debugging)

Watch panel → **Snapshot** records, for one simulated frame, every custom stage of the selected entity: params, input (before), input after (if mutated in place, e.g. the `av` blackboard), returned output, `state` and all `api.watch` values (even with the panel closed). Result: textarea + Copy/Save JSON. Code: `src/runtime/transformerSnapshotBridge.ts` (hook in `CustomCodeTransformer.transform`).

## IN / OUT trace on cards

Stages talk by mutating `input` (`input.target`, `input.goalSource`, blackboard `input.av.*`), not only via the returned output. The trace therefore fingerprints every non-standard input key (one level deep) before/after each stage: **IN** lists live channels (`target`, `av.points[213]`, …), **OUT** adds `wrote <channels>`. Pipe cards show IN (first stage that ran) and OUT (union of member stages), using `EntityStageRuntime.flatRangeForScope`. Code: `transformerTrace.ts` (`collectChannelFingerprints`, `summarizePipeTraceBrief`), `PipeCard.tsx`.

## Longitudinal control: identified actuator model (2026-10)

car2 turns `u = throttle − brake` into a force, so the body follows `a = G·u − D·sgn(v)`. The reference car has G ≈ 156, D ≈ 60 m/s²; a light car with
`power 2400` has G ≈ 1200 (Rapier averages friction, so an "icy" friction 0.01 body still slides with ≈ 0.6 on normal ground: D ≈ 60). The old fixed
deadband feed-forward (0.36) meant ≈ 430 m/s² on such a car → a permanent 4-frame limit cycle (speed 2 → 15 → 7 → 10 m/s; the "jitter").
`av-control-longitudinal.js` now estimates G and D online (RLS with forgetting on last frame's applied command vs measured acceleration; learns from
0.12 m/s, skipped while `isTouchingSide`; rescue path for a saturated, underestimated G) and commands an acceleration:
`u = (a_des + D·s) / G`, `a_des = clamp((v_target − v)/tau + I, −maxDecel, maxAccel)`; never brakes through zero within a frame; breakaway push
ramps while demanded motion does not start and is held until the car really drives. Publishes `av.actuator {G, D, u}` — a later stage that overrides
the actions (AEB) writes the applied command into `av.actuator.u` (mailbox the controller reads next frame). Params: `tau`, `ki`, `maxAccel`, `maxDecel`,
`gainInit`, `frictionInit`, `forget`, `breakawayRate`, `maxThrottle`/`maxBrake` (hard caps, default 1).
**AEB** brakes with a deceleration through the same model (a raw brake 0.3 was 360 m/s² on the light car and flipped its speed), and uses `av.vehicle`
for the look-ahead origin (nose) and width.

## Sleeping bodies (runtime, 2026-10)

`RenderItemRegistry.executeTransformers` used to skip the chain of a sleeping, non-controlled body for good (only held keys woke it). An AV car that
stopped for a few seconds fell asleep and never decided to drive again — "stuck although everything is free; editing code (rebuild) makes it go".
Sleeping chain entities now tick every 0.25 s with the accumulated dt; an inert output (no force / torque / turn / pose) keeps them asleep, anything
else wakes the body. `PhysicsWorld.applyForce/Impulse/Torque` ignore zero vectors (they used to wake the body). Edge case `car asleep at start`.
Trace targets are still never skipped (the Builder trace view runs them every frame).

## Planner fixes from the lab (2026-10)

- **Motion planner margin ramp:** with any point inside `safetyMargin` of the current pose every candidate collided at s = 0 → `free 0`, standstill next
  to a parked car / sloped obstacle. The margin now starts at the current clearance and grows to the full value over `marginRamp` (3 m).
- **Manoeuvre handback from the first segment:** a plan that starts with a long forward run is handed back to the local planner at once (it used to creep
  along it at manoeuvre speed until a guard replan reversed it → shuttling).
- **Speed planner:** the stopping-distance limit (`free`) is a hard upper bound; `minSpeed`, route / curve / goal floors no longer lift the speed above it.

## Standstill deadlocks (found via Snapshot)

- **Longitudinal chatter:** zero demand + reverse-thrust braking flipped the speed sign every frame (±5 m/s, no net motion). Superseded by the model-based
  controller above (it never brakes through zero within a frame).
- **Manoeuvre waited for rest forever:** a gear change waited for `|speed| < 0.4`, never true while chattering → `vDesired 0` for ever. Now `restWaitMax` (1.2 s) ends the wait; a plan the car is `maxOffPath` (6 m) away from is dropped and replanned.

## Contacts the lidar cannot see

Low bars below the ray plane (height < ~0.5 m) or cars pressed against the hull never show up in `av.points`, so the planners kept driving into them (car frozen / jittering, `isTouchingObject` true, `av.plan.free` large). The route planner now turns "stalled while `environment.isTouchingObject`" into virtual obstacle points just ahead of the hull in the driving direction (`state.contacts`, `contactTtl` 25 s, only after `contactRestTime` 1.5 s at rest — `isTouchingObject` is also true on the floor, so it is not evidence by itself; no new mark within 1.5 m of an existing one; `contactMemory: false` disables) and merges them into `av.points` for all later stages, so the manoeuvre planner reverses and routes around. Edge cases: `low bar …` in `AV_EDGE_CASES`.
Note: `vehicleWidth` / `vehicleLength` must match the entity's collider (a 4 × 8 collider with the 2 × 4 defaults makes the car plan with half its real size and touch neighbours constantly).

## Vehicle footprint (`av.vehicle`)

`av-ego` publishes `av.vehicle {width, length}` = max(`vehicleWidth`/`vehicleLength` params, the entity's own box collider incl. scale). Perception, motion/route/speed planners use it, so a body larger than the 2 × 4 defaults (e.g. 4 × 8) no longer plans with half its real size and scrapes walls / other cars. Params can only enlarge the footprint. Non-box shapes keep the params. Edge cases: `big car …` in `AV_EDGE_CASES` (`carSize`).

## Snapshot physics block

The snapshot now also records `physics` (Rapier linear velocity + every collider in contact with the entity: other entity id, deepest overlap `minDist` (negative = penetration), contact normal). Use it to tell "wedged in another body / floor jitter" from a controller problem. Code: `PhysicsWorld.getContactSummary`, `setTransformerSnapshotPhysicsProbe`.

## Steering smoothing (2026-10)

The motion planner picks one of ~31 discrete curvatures per frame, so neighbours hopped (8-10 steering reversals/s). `av-control-lateral.js` now low-passes the planned curvature: changes below `kappaJump` (0.025 1/m) use tau `kappaTau` (0.04 s) + 0.008 s per m/s; larger ones (avoidance) pass with tau 0.04 s; reverse / manoeuvre / speed < 2 m/s bypass it. Result: 2.5-3 reversals/s. Tried and rejected (flip parkour / lane / low-bar tests): stronger planner commitment (`wSmooth` 6), larger lag, hysteresis bands. Perception sector clearing (ghost cells next to a standing car; `memClearFrames` hysteresis) and planner commitment (`switchMargin`) looked promising in the lab but flip parkour / beside-gate tests; not shipped.

### Straight-road weaving (2026-10-04)

Even smoothed, a straight free road still weaved +-14 m (heading +-35 deg at 0.6 Hz, 1.35 steering reversals/s): the discrete planner curvature plus a Hybrid-A* route that zig-zags around the straight line (discretised headings) and a carrot only 14 m ahead (0.5 s at 30 m/s, an unstable pure-pursuit loop). Two fixes, both only on a free, threat-free plan:

- **Carrot string-pulling** (`av-route-planner.js`, `carrotPull`, default on): line-of-sight shortcut on the same costmap / margin to the farthest node of the leading forward run the car already heads towards (cos 20 deg, `carrotPullCos`); the carrot is re-aimed every frame `max(lookahead, carrotLookT 1.6 s * speed)` along that line.
- **Pure-pursuit refinement** (`av-control-lateral.js`, `purePursuit`, default on): the continuous curvature `2y/d^2` toward the carrot replaces the planned one when within `ppWindow` (0.02 1/m) of it, so it fine-tunes, never undoes an avoidance; `kappaDeadband` 0.0015.

Tests: `straight-to-goal`, `straight-offset-10deg` and tracking bars on `open-road-speed` (`av-evasion-scenarios.test.ts`, metrics `ScenarioMetrics.path`). Red check with `AV_PARAMS='{"purePursuit":false,"carrotPull":false}'`: RMS cross-track 6.3 m / 1.35 reversals/s -> with the fix 0.00 m / 0.00. Full sweep 61/75 winnable (robust 59/64). `pair/v25/low/b-30+30/near` (margin 1.1) fails on this Linux runner both with and without the fix (it is in the macOS-recorded baseline).

## Speed / stall fixes (2026-10, abb71d2)

- **Breakaway push** (longitudinal): a 0.1 m/s creep counted as driving and relaxed the push, so a car on a free road idled for ever at throttle 0.39 (RLS had G 2725 / D 300). Driving now needs 0.5-1.5 m/s.
- **Route corner speed** uses the net heading change over 14 m (`routeCurveWindow`) instead of single Hybrid-A* arcs (k 0.058 capped at 12.5 m/s).
- Lab, self_hunt_flexible, 3600 frames, seeds 2/6/7/1/3/5: path 834/162/704/995/812/881 m (baseline 566/735/643/896/727/544), mean speed 13.7/1.6/11.3/16.5/13.4/14.6 m/s (baseline 9.1/12.2/10.0/14.9/11.7/8.7). `comfortDecel` 4 or `maxLatAccel` 12 changed individual seeds by +-300 m without a net gain (more chaser hits).
- Wall: the 12 chasers (20-46 m/s) box the car in on some seeds (seed 6: 91% of the time with a chaser < 15 m); mean speed is then set by manoeuvres, not by the speed limits. Next levers: moving-obstacle prediction in the planners, direction-aware long-range sensing, an escape rule when a chaser is within 6 m.

## Pursuit evasion, zoned sensing, goal watchdog (2026-10)

Found with the lab (`self_hunt_flexible`, 11 + 1 chasers): the chasers never "box in" a moving car — they coast inside 10 m (`approachspeed` 3) and only a car that is
slow / stopped gets surrounded. Most stalls started with a late reaction to a fast chaser crossing the nose (TTC < 1 s), a launch (see below) or an unreachable goal.
All new behaviour is **opt-in via stage params** (defaults = old behaviour; the parkour / lane / low-bar tests stay green); `self_hunt_flexible` enables it on the car's AV pipe binding.

- **Tracked bodies** (`av-ego`, `threatIds`: entity ids; `threatRange` 120 m): live positions -> filtered velocity -> `av.threats [{id,x,z,vx,vz}]`. Generic (any list of ids), set per world.
- **Predictive avoidance** (`av-motion-planner`, `wThreat` > 0 = on, e.g. 30; `threatHorizon` 2.5 s, `threatRadius` 1.8, `threatRange` 10): every candidate path is evaluated over time —
  hull pose at `t` along the path (speed `max(v, 5)`) against each threat extrapolated at constant velocity; penetration of the 10 m gap band, earlier = heavier, overlap = double. A smooth
  cost term (not a hard obstacle): a pursuer that is *aimed at the car* would otherwise always read as a wall. Effect in the lab: catches 15 -> 1 over 6 seeds, seed 6 (91 % boxed) 1.6 -> 13.8 m/s.
- **Flee layer** (`av-ego`, needs `fleeArea` [xmin,xmax,zmin,zmax]): when the straight way to the goal passes a pursuer closer than `fleeRadius` (16 m), `input.target` is replaced by a ring candidate (50-110 m)
  scored by clearance from the threats, heading away from the near ones, alignment with the real goal and the car's heading; kept `fleeHold` s (4).
- **Goal watchdog** (`goalWatchdog` s, needs `fleeArea`): a goal the car does not approach by >= 8 m within that time is unreachable (the preset wanderer clamps goals to the perimeter corners, behind walls the car
  crawled up to for ever: 40 s stalls) -> the car picks its own open-road goals until the source hands over another one (`av.goalBad`).
- **Zoned scan** (`av-perception`, `fwdFovDeg` > 0, e.g. 70): dense forward cone (`fwdStepDeg` 1.5, full range), sparse sides (`sideStepDeg` 6, `sideRange` 45), sparse rear every `rearEvery` 3 frames (`rearStepDeg` 12, `rearRange2` 30) — ~85
  rays instead of 72 x 2 planes, and the road ahead is seen at 150 m.
- **Longitudinal bug fixed (default, all worlds):** one noisy RLS sample (speed jitter 1 m/s per frame = 60 m/s^2 against a command of 0.04, covariance 1e5) dropped `G` from 800 to the floor of 10 in a single update;
  the next frame `u = 1.0` with the real G of 1200 gave +20 m/s in two frames (a launch into whatever was ahead, "max speed 60-80 m/s" in the lab). The RLS step is now bounded (G +-10 %, D +-20 % per frame).
- Car params used in `self_hunt_flexible`: `comfortDecel` 4 (was 2: the free-path limit `sqrt(2 a (free - margin))` was the active speed limit 2/3 of the time), `fwdFovDeg` 70, `goalWatchdog` 10, `wThreat` 30, `fleeArea` +-370, `threatIds` (all other chain cars).
- Lab, 3600 frames, seeds 2/6/7/1/3/5, mean speed (catches): before 13.7(1)/1.6(10)/11.3(2)/16.5(0)/13.4(2)/14.6(0); after 15.6(0)/17.4(0)/14.6(1)/18.8(0)/17.2(0)/15.8(0).
- The lab is chaotic: one early stall flips a seed from 16 to 3 m/s (`comfortDecel` 5 alone: seed 1 16.5 -> 2.6). Judge changes over >= 6 seeds, never one.

## Pursuit-aware prediction (2026-10): pincer + corner-trap pass

Scripted scenarios (`av-evasion-scenarios`), homing chasers (25-30 m/s, turn rate 1.5 rad/s -> turn radius 17-20 m, the car's 8.7 m at <= 9 m/s):
- **pincer** (chasers 75 m left / right, 60 m ahead, converge on x = 0 in ~3 s): constant-velocity prediction saw two passing lines; the car drove into the closing gap at 28 m/s and then swerved
  toward one chaser. The flee layer only fired at 16 m (too late: goal swap -> path blocked by the chaser's own costmap points -> AEB 166 m/s^2 -> stopped in front of it, 7 s ridden along).
  The gap IS passable if the car keeps accelerating (31 m/s at z = 35 vs the chasers' 25): the car must be predicted as accelerating and the chasers' own points must not block it.
- **corner-trap**: the car started facing the wall, turned at 9.8 m/s (curve / route limit) right into the chaser's path. Open-loop search (`k1,T1,k2,T2,vt` vs the exact puppet): the winning
  line is full throttle along the wall away from the chaser's intercept, a gentle turn, centre distance 6-9 m; slow dodges (the chaser's radius 20 m vs the car's 9 m) are too late once the chaser is < 30 m away.
- **Fix, `av-motion-planner` (all opt-in via params, `self_hunt_flexible` sets them):** `threatTurnRate` (1.5) = bodies faster than `threatPursuitSpeed` (4) are predicted HOMING (pure pursuit of the car's
  pose on the candidate + `threatLead`, speed kept, turn-rate limited; nearer of that and constant velocity per step); the car's own speed profile per candidate (`threatAccel` 7 m/s^2 up towards cruise, down at
  `comfortDecel`, capped by the curve limit `sqrt(maxLatAccel / |kappa|)` so a hard dodge is slow); `threatHit` (3 x wThreat) = one penalty for the earliest predicted contact (the averaged proximity cost let a
  straight run into the closing gap win against 50 m of progress); `threatRadius` 2.8 (the chaser is 5 m long); `threatBodyRadius` 4.5 = costmap points around a fast tracked body are dropped
  (it is predicted, its smeared hull is not an obstacle: a chaser alongside blocked every path). `threatHorizon` 4 s.
- Debug: `AV_SCENARIO_TRACE=2` prints 4 Hz car / chaser poses, gap, plan kappa / free, speed limit, AEB, flee goal, throttle (`AV_TRACE_T0` / `AV_TRACE_T1` = every frame in that window).
- Not done: a touched car riding along with a chaser (no break-free logic needed in the two scenarios once contact is avoided), reverse as an escape.
- **corridor-block 88.7 m/s peak is not physics**: at t = 19.2 s the longitudinal RLS (`av-control-longitudinal`) has G = 250 (real ~1200) after the earlier AEB / manoeuvre phase; u = 0.09-0.25 then gives
  +100 m/s^2, and above the target the estimate runs away (D -> 300, G -> 2000: u stays positive at 80 m/s with vd 34.5). Needs a physical bound on D (e.g. <= 0.3 G) and a hard
  `v > vDes -> u <= 0` rule in that stage (not changed here: owned by the parallel longitudinal work).

## Reverse driving, travel-direction scan, standing-start kick (2026-10, scripted scenarios `reverse-escape`, `open-road-reverse`)

- **Zoned scan follows the travel direction** (`av-perception`): the dense cone (`fwdFovDeg`, `fwdStepDeg` 2) points where the car goes (velocity sign; slow / at rest: the freer of front / rear from the
  cone + sweep, hysteresis; `scanFollowFree: false` = always forward). Sides every 2nd frame (`sideStepDeg` 12), rear = a coarse 360 sweep (`sweepStepDeg` 10, `sweepRange` 45) every 15 frames (5 while slow).
  ~46 instead of ~84 rays/frame; lab `self_hunt_flexible` seed 2, 1200 frames: perception mean 2.57 -> 1.82 ms (p95 4.7 -> 2.8).
- **Reverse cruise** (`av-route-planner`, `reverseCruise` default on, `reverseSpeed` 10): goal behind + forward way blocked (< 20 m) + free way behind (>= 30 m) -> the Hybrid-A* may reverse long runs
  (`maxReverseRun` unlimited, `reversePenalty` 1) so there are no 8 m hops with gear flips; reverse segments run at `min(reverseSpeed, stopping distance in the free arc behind, sqrt(maxLatAccel / k), end of the reverse run)`;
  an obstacle appearing inside the segment (beyond the 2 m guard look-ahead) re-plans at once. Left when the goal is no longer behind or the rear is blocked (< 10 m). No rear AEB yet (AEB is forward only).
- **Standing-start kick (longitudinal):** the priors (G 156, D 60) on a light powerful car (G ~ 1400) gave u = 0.45 at the first frame: 0 -> 8 m/s in ONE frame. Causes: the unidentified model + a joint RLS on [G, D]
  that is ill-conditioned (data only fix G*u - D, so an underestimated G was explained by D running to 300, then forward thrust against the friction model: 60+ m/s runaways). Now: G (NLMS, growth +35 %/frame, drop -10 %) and D (coasting frames only) identified separately, and no thrust along the
  direction of travel while faster than demanded.
- **Merge regression (pincer / crossing / corner-trap), fixed 2026-10:** bisecting by stage showed ONLY `av-control-longitudinal` was responsible (perception / route planner changes alone left them failing or passing
  independent of it). (1) The probe cap (u <= 0.06 for 0.4 s, then +1/s) delayed every launch from rest by ~1.5 s, so an evasion started late and the planner's `threatAccel` speed profile over-promised: **probe removed**
  (the one-frame kick is harmless next to a late launch; G / D identification is kept). (2) The "no thrust while over speed" rule (> 1 m/s) zeroed u during normal planner-driven deceleration, i.e. braked with the full
  friction D (~58 m/s^2): now only when > 8 m/s over the demand AND still accelerating (the 60+ m/s runaway it was written for). Perception savings kept; all 10 scenarios pass, `KNOWN_FAILING` empty.

- **Turn-around (`av-route-planner`, `turnAround` default on; `turnRoom` 20, `turnRouteExpansions` 5000, `turnMaxExpansions` 12000, `turnManeuverSpeed` 4.5; `turnaround-open` / `turnaround-corridor` pass):** cause (traced): goal behind on free ground -> the 1500-expansion search returned a `partial` route whose best-h node was a straight reverse run (the U-turn pays off only after ~30 m of arcs), 46 m reversed in 20 s. Fix: when the goal is behind (> 0.3), reverse cruise is off and >= 20 m are free straight ahead (`turnOk`: room to swing round, so alleys / dead ends keep reversing out, which is what broke `headingHeuristic` globally), the heading-aware heuristic is used for that plan, the budget is raised and the manoeuvre is latched (`state.turnPlan`) to shuffle at 4.5 m/s. Open: reversed 46 -> 0 m, goal 6.9 s; corridor (14 m): 83 -> 18 m reversed, goal 19 s. **Turn commit** (`turnCommit` default on, `turnDeviate` 2.5 m): `deviates()` (0.9 m / dot 0.97) re-planned the K-turn at each gear change from drift and swapped it for another K-turn 4 times (10 shuttle episodes > `maxShuttle` 6); with `state.turnPlan` set it uses maze-style loose thresholds (2.5 m / dot 0.85): 6 shuttle episodes (limit 6, no margin), 11 reversals, goal 18.9 s. `AV_PARAMS='{"turnCommit":false}'` -> shuttle 10, red. Maze / evasion (full + eco) and the full sweep (66 PASS lines, identical set, same single known failure) unchanged. `AV_PARAMS='{"turnAround":false}'` turns turnaround-open red again.

## Robustness sweep fixes (2026-10, see "Parametric evasion sweep" in feature-av-lab.md)

Sweep (winnable cases, oracle-classified): 29/78 -> 60/75 (robust, margin >= 2 m: 58/64). Causes found by tracing single cases:
- **Flee goal behind the car (av-ego):** head-on chaser -> the "away" goal lay behind the car, the car U-turned across the chaser's nose at curve speed (9 m/s) and was run over. `fleeTurnPenalty` (1.5) penalises candidates needing > ~70 deg of turn.
- **Standing-start kick:** wrong actuator priors (G 156 vs ~1300 real) gave 0 -> 8 m/s in one frame. Car params now `gainInit 1300`, `maxAccel 60`, `tau 0.12` (launch ~ 60 m/s^2 ramp, <= 1.2 m/s per frame, same v(0.5 s) ~ 14 m/s as the kick; a plain `gainInit` + `maxAccel 10` launch lost ~5 sweep cases, `tau` 0.35 too slow).
- **Progress beat a predicted contact (av-motion-planner):** an "aim at the carrot" arc (+115 m progress) into the pursuer cost less than the straight run with no predicted hit. `threatHitFloor` (250) = flat cost of ANY predicted contact. That then outweighed a certain wall collision (blocked path <= 78), so `wRequired` 300 (alley: hard left into the wall at 35 m/s).
- **Braking while chased (av-speed-planner):** the route-bend limit (stale route, 32 -> 11 m/s) and the comfort-decel free-path limit (35 m free path = 16 m/s) slowed the car in front of a 25-30 m/s pursuer. While a fast body closes in (`chased`): no route limit, free limit with `chasedDecel` (9). Side effect: open-road speed with a pursuer can reach ~50 m/s.
- **Pursuer turn rate (av-ego / av-motion-planner):** `av.threats[].turn` = recent max observed turn rate; the homing prediction uses `clamp(1.3 * turn + 0.15, threatTurnMin 0.5, threatTurnRate 1.5)` instead of always 1.5 rad/s.
- Not fixed: fan / pair-with-rear chasers at 110-130 m (the car drives at 40-50 m/s at the central chaser and starts the dodge < 25 m before contact; a `chasedMaxSpeed` cap 32-36 was tried and did not help), and cases with oracle margin < 2 m.

## Early gap commitment (`gapCommit`, av-ego, default ON; `gapCommit:false` disables) (2026-10)

- Trace (`triple/v25/high/fan/far`, before): real goal (straight ahead) until t = 1.2 s, then the geometric flee goal appears ahead (14,-68) and jumps (108,-34 -> 86,8 -> 14,36 -> ...) while the car is at 40-47 m/s on the central chaser; contact at 2.6 s.
- Design: against >= 2 pursuers (escapeRange 160 m) `fleeSim`'s heading search is used, but the chosen goal (150 m) is an ABSOLUTE point held until reached (< 25 m) or a clearly better heading appears (`escapeSwitch` 6, re-evaluated every 0.3 s). The planner gets a fixed target (trace: goal 130,70 held for 3.5 s, turn at 15 m/s). A lone chaser keeps the geometric layer.
- Sweep full: winnable 61/75 -> 63/75, robust 59/64 -> 61/64; flipped `pair/v25/high/b-30+30/far`, `pair/v35/low/b0+150/far`; still failing robust: `triple/v25/high/fan/far` (30 frames), `triple/v35/low/fan/far`, `pair/v35/high/b0+150/far`. No baseline case lost; av:quick and `src/test/scenarios/av-` + hunt-game pass.

### gapCommit follow-up: why the 3 robust fan / pair cases failed (2026-10)

- **`triple/v35/low/fan/far`:** the central chaser (138 m) was outside the tracking range (`threatRange` 120), and at t = 0.02 s every filtered chaser velocity is still ~0 (read as parked), so the sim called every heading safe and committed a 15 deg turn that was never revised (`escapeSwitch` hysteresis). Fix: `gapWarmup` (s, default 0.1 with gapCommit): no commit until every pursuer has been tracked that long; `gapTrackRange` (m, default 160 with gapCommit): a separate far list `av.threatsFar` feeds only the escape sim (`av.threats` stays at 120 m: the motion planner's own `threatRange` is a different param, do not widen it).
- **`triple/v25/high/fan/far`, `pair/v35/high/b0+150/far`:** the sim goal was right but the planner chased the route carrot (the A* carrot sits ahead of the car, arc stays shallow, the car arrives at 25-30 m/s on a chaser's path). Fix `fleeAimDirect` (default on with gapCommit, motion planner): while the sim commit is active (`av.fleeSim`) the planner aims at the committed goal itself, not the carrot.
- **Sim vs real acceleration:** after a hard turn the real car re-accelerates at ~5-9 m/s^2 (curve limit follows the smoothed kappa), the sim assumed 15. With gapCommit `escapeAccel` defaults to 9 (15 without). `escapeAccel` 6-12 are chaotic on these cases (each value flips a different one of the 3); 9 was the best value with no lost baseline case.
- Sweep full: winnable 63/75 -> 66/75, robust 61/64 -> 63/64; flipped `triple/v25/high/fan/far`, `triple/v35/low/fan/far`; no baseline case lost. Still failing robust: `pair/v35/high/b0+150/far` (c1 contact at 3.0 s, 411 frames). Without `fleeAimDirect` the sweep is 62/75 (lost `triple/v25/low/fan/far`), with `fleeAimDirect` applied to the single-chaser geometric layer it loses `single/v20/low/b0/near`: keep it to sim commits. av:quick and both eco suites pass.

## Seed-5 stall: ghost marks hugging the hull (`hullClear`, av-perception, default ON; `hullClear:false` = old) (2026-10)

- Health check after `gapCommit`: `self_hunt_flexible`, focus car `entity_1779823253285_brtkx1p`, seed 5: stall f601-1590 at (-44.2, 264), v 0 (before `gapCommit` the same trap jittered). Attribution (full lab runs with `AVLAB_PARAMS`; replay ignores params): `turnAround:false` / `turnCommit:false` identical stall, `gapCommit:false` no stall (jitter again). `gapCommit` only changes where the car goes: it commits a flee goal at f390 and drives into a pocket (8 m car, cylinder r 2.5 ahead, 1.7 m of free nose room) at 17 m/s.
- Cause of the NO-way-out: the route planner searches 1 node (`partial exp 1`), every primitive blocked even at margin 0. The costmap behind the car held ghost marks (fixed marks of tracked threats, 15 s) 0.35-0.5 m behind the bumper, left by chasers circling close; the physics rays behind were free for 30 m. The free-space clearing (`memClearRange`) sampled the ray from `hull + 1 cell` on, so marks in the first cell outside the hull were never swept; chasers kept re-stamping them, so the reverse stayed blocked (0.45 m of room, no K-turn fits an 8 m car) and nothing in the planner could ever move.
- Fix: `hullClear` (default on) starts the sweep at the hull edge. Seed 5 (1800 frames): stall 810 frames -> 0, path 118 -> 167 m; seeds 1-6 x 3600: no stall / jitter-stall on any seed (seed 5: 8 short shuttle episodes, 584 m).
- Case `pocket-ghost` (`avMazeCases.ts`, `noGoal`: judges stall / leave time only, a tracked chaser makes the car flee): pocket-escape + a chaser-like car 0.2 m behind the bumper for 1.5 s that drives off. `hullClear:false` -> stalled 16.3 s, leaves the start area after 23.0 s (red: > 5 s / > 14 s); fix -> stalled 1.5 s, leave 10.4 s.
- Still open: how the car ends up in such pockets at 17 m/s (flee goal into clutter, `gapCommit`), the seed-5 shuttle episodes.

## Seed-6 maze-pocket shuttle after gapCommit: flee goal behind walls (`gapWalls`, av-ego, opt-in, default OFF) (2026-10)

- Health check (`self_hunt_flexible`, focus `entity_1779823253285_brtkx1p`, seed 6): path 2081 -> 955 m. Attribution (full runs, 2000 frames): default 375 m (2 shuttle episodes f1111-1305 / f1441-1710 at (153,313) / (156,321), maze B), `gapCommit:false` 1115 m, no event, `fleeAimDirect:false` 863 m (1 episode elsewhere).
- Cause: the escape-heading search (`escapeSim`) only knows pursuers, not walls. The goal is committed at t = 0.1 s (150 m, east, the static map is still empty) and held while >= 2 tracked pursuers are within 160 m and the goal is > 25 m away (also when they are parked / stuck behind walls, the real goal is `bad` by the watchdog the whole time). In maze B the held goal sits behind the pocket wall: route planner `partial exp 1500 h 55 fd 74` (the field is optimistic over unknown cells, so `fd` does not flag it), the reverse manoeuvre re-latches.
- Fix (param-gated, **`gapWalls: true`**): headings are also checked against last frame's `av.smap` (`av.prevSmap`; the ego stage runs before perception): free run over 2 m cells (`wallGrid` / `freeRun`). Headings with a run < `gapWallMin` (60 m) are no candidates unless that costs > `gapWallTrade` (8) score points against the best short heading (race first); none long enough = the longest run; the goal is put at the last free point of the run (`gapWallClamp`); a held goal whose heading hits a known wall is re-picked (no hysteresis); a clamped goal is re-picked within `gapReach` (10 m). Also `gapWallPen` (score penalty, default 0), `gapWallFilter:false` (re-pick blocked goals only), `gapWallClear` (3.5 m).
- Result (3600 frames): seed 6 955 -> 1491-1758 m (no shuttle), seed 1 1624/0, but seeds 2 and 4 get 2 / 5 catches (and with other `gapWallMin` / trade / gating variants a different seed flips every time: the lab is chaotic, any change of the early flee commit changes the whole run). Hence OFF: with the default all six seeds are identical to before (1784/0 1674/0 1830/0 1405/0 1417/1 955/0).
- Tried and dropped: calm-only filter (no pursuer moving > 2 m/s within 100 m; seeds 1/2/4 fine, seed 6 stays in the pocket: it is entered during the race, when the map is not yet known), always sim off while calm (seed 6 793 m), gating by slow car / blocked time / imminent wall (< 30 m), `gapWallMin` 25 / 40 / 45 / 75 / 90. Open: a pocket-aware escape (use the route planner's goal-distance field for the committed goal, which needs the planner to expose per-candidate field distances).
- Case `flee-wall-ahead` (`avMazeCases.ts`, uses `gapWalls: true`): 2 homing 25 m/s chasers 40 m behind a car doing 25 m/s, a 300 m wall 70 m ahead, goal behind it, 30 s: without the param the goal is not reached (110.9 m away at the end), with it 24.1 s. av:quick and both eco suites pass; the full sweep is unchanged (the param is off: 66/75, robust 63/64).

## Lab smoke check + boxed-in deadlock (2026-10, self_hunt_flexible, 6 seeds x 3600 frames)

- **Speed vs chasers (lab `SPEED` line):** free-road seeds (4, 6): AV mean/p50/p90 35-39 / 38-42 / 48-50 m/s, chasers 21 / 21 / 43. Hardware: AV and chaser cars are both 4x1x8, mass 2, friction 0.01; AV `car2` power 2400 vs chaser 400 (the AV is NOT hardware-limited; the referee's pressure ramp adds up to +4 m/s^2 x level for chasers below a 20 + 4 x level m/s cap). Free-road limit sources: `curve` (planned-kappa wobble, mean vDes ~32) and `free`; not cruise. Raising `maxLatAccel` 9 -> 13 gave 40 vs 35 m/s on seed 4 and no change on seed 6 (chaos) and was not adopted.
- Slow seeds (2, 3, 5: mean 8-12 m/s) are manoeuvring in clutter (big cylinders / pyramids, parked car) with the chasers also idle (p50 0.4 m/s), not a speed limit.
- **Deadlock fixed (seed 5, stalled 31 s):** nose 3 m from the corner of a parked car. The route planner's A* (margin 0.4) calls the forward run free and `aheadFree` hands the manoeuvre back to the local planner, whose larger margins allow 0.8 m (`startGap` 0.78) -> v limit 0, stuck watchdog -> same manoeuvre -> hand back ... forever. Now: stuck again within 40 s of a hand-back -> the manoeuvre keeps driving its first 8 m itself (`state.noHandbackFrom`). Scenario `boxed-in-corner` (stalled 18.5 s before, 1.8 s after).
- **`fleeSim` (av-ego, param-gated OFF, not enabled in any world):** experimental escape-heading commit by simulation (24 headings x 2 speed policies against pursuit-predicted chasers, hysteresis, goal 90 m ahead on the heading, early trigger). Picks sensible headings for the fan cases but the motion planner fights the moving goal (kappa flips) and the route planner slows to 11 m/s: not a fix yet (the 6 robust fan / pair cases still fail). Oracle MPC for `triple/v25/low/fan/far`: turn hard at t = 0 (12 m/s, R 9 m) away from the pack, then run at 36 m/s perpendicular; the AV instead accelerates to 40-50 m/s straight at the central chaser.

## Maze world smoke check (2026-10, self_hunt_flexible with the 82 low maze walls; 6 seeds x 3600 frames)

- Seeds 1, 2: free running, mean 33 m/s, no stall. Seeds 3, 4, 5, 6: 6-20 shuttle / jitter episodes each (mean 0.7-17 m/s; seed 6: 6 catches).
- **Root cause (seed 3, maze C east gate, 33 s):** the car sits in a 14 m wide dead-end corridor whose goal (wanderer goal / flee ring goal) lies behind walls. The Hybrid-A* returns the least-bad PARTIAL route (`reached false`) and the manoeuvre executes it: 13 segments of 1.8 m that shuffle +-1 m around the same pose (local minimum of the goal heuristic), replanned every few seconds. There is no map memory beyond `memoryTtl` 15 s and the flee / own-goal candidates ignore walls, so nothing ever says "this goal is unreachable, explore elsewhere". Replaying the lab scene on the maze world: `lab-s3-shuttle-f1560` with current code leaves the dead end after ~10 s only by luck of the manoeuvre sequence.
- Tried (param-gated OFF, no measurable gain in the 6-seed lab or in a scene copied into an arena, not enabled): `fleeLos` (av-ego: line-of-sight ray per flee candidate, blocked goals penalised), `exploreTime` (av-route-planner: no 12 m displacement for N s -> drive to an A*-reachable point 30-100 m away that is far from earlier dead ends), `memoryTtl` 300 (no effect on seeds 3 / 4).
- Needed for real maze routing: a persistent occupancy map (static points only; chasers / props filtered), frontier exploration (unknown = free in A*, dead ends remembered so the same corridor is not re-entered), a partial route must NOT be executed as a manoeuvre unless it improves the heuristic by more than ~10 m, and manoeuvre speed above 3 m/s in wide corridors.

## Maze routing: persistent static map + 2D goal-distance field (2026-10, scripted `av-maze-scenarios.test.ts`)

Deterministic cases (`src/test/fixtures/avMazeCases.ts`, runner metrics `goalReachT`, `reversals`, `shuttleEvents`; pass = goal within T, no static / chaser contact, reversals and shuttle episodes within the case limits, not stalled). Baseline (before): `maze-goal-behind-wall`, `maze-u-trap`, `maze-corridor-chase` PASS; `maze-dead-end` (30 reversals, 23 shuttle episodes), `maze-u-trap-inside` (24 / 12), `maze-gate-exit` (17 / 14) FAIL. After: all 7 incl. `pocket-escape` pass.

- **Persistent static map (`av-perception`, `staticMap`):** rays that hit a body with `bodyType 'static'` (not planes) are stored forever in a 1 m cell map; consecutive hits (angle order) on the same convex body <= 10 m apart are linked by interpolated points (far-range scans leave no holes). Dynamic / kinematic hits (chasers, parked cars, props) stay in the 15 s memory (`av.dyn`), so a stationary car is an obstacle while it is seen and never burned into the map. `av.points` = dynamic memory + static points within 130 m; `av.smap {list, ver}` = the whole map.
- **2D goal-distance field (`av-route-planner`, `fieldHeuristic`):** Dijkstra from the goal over a 2 m grid (window snapped to 32 m, <= 100k cells) of the persistent map inflated by half the vehicle width + 0.8 m; unknown cells are free (optimistic: the car explores by following the field, walls it sees stay closed, dead ends are not re-entered), blocked cells cost 400x so the field is finite everywhere. Stopped dynamic bodies (remembered lidar points not within 10 m of a threat moving > 2 m/s) are stamped on a per-build copy. Rebuilt when the goal cell, the map or the stopped-body signature changes (<= every 0.3 s). The Hybrid-A* heuristic is `max(euclid, field)` (goal test still euclid), so a wall in front no longer floods the pocket / returns a partial route whose best node is a euclidean local minimum (that was the shuffle).
- **Field rebuild cost:** the Dijkstra uses Dial's algorithm (circular bucket queue, bucket width 0.99 x the smallest edge cost, so identical field values to a heap) instead of a binary heap. Lab `self_hunt_flexible` seed 3, 1800 frames, route planner: mean 0.564 -> 0.438 ms, p95 4.37 -> 1.82 ms, max 45.5 -> 32.2 ms (first-call allocation / JIT); trajectory identical (path 807.0 m, same final pose).
- **Goal watchdog (`av-ego`):** progress is measured with the field distance (read from last frame's blackboard); a goal whose field value is < 600 m (no known wall crossed) is never "bad" -> no more wall-blind own-goal ring while a long detour is driven. `fleeStoppedSpeed` (1.5 m/s): stopped bodies do not trigger the flee layer.
- **Maze mode (`av-route-planner`):** field distance > straight line + `mazeDetour` (15 m) -> reverse costs `mazeReversePenalty` 1.5 / m, reverse runs up to `mazeMaxReverseRun` 40 m (backing out of a dead end / K-turn fits the expansion budget), one-gear runs > 8 m are driven at `maneuverRunSpeed` (7 instead of 3 m/s), the plan is kept unless the drift exceeds `mazeDeviate` 2.5 m (a re-plan from every small drift picked another K-turn and flipped direction). The reverse-cruise guide direction is the point 24 m down the field, not the goal. Open ground keeps the old costs (changing `reversePenalty` / `maxReverseRun` globally flipped `corner-trap`).
- **Hand-back (`handbackMargin` 0.9):** the manoeuvre is handed to the local planner only if the planned segments stay clear with the local planner's margin for the next 10 m (footprint-swept along the route, not along the current heading). Optional `maneuverMargin`: plan a manoeuvre first with a wider margin (off, not needed).
- Enabled in `self_hunt_flexible` (car params `staticMap`, `fieldHeuristic`, `maneuverRunSpeed` 7, `handbackMargin` 0.9, `fleeStoppedSpeed` 1.5); all default off in the library.
- **pocket-escape (live build report):** wall 1.5 m left, 15 m cylinder 1.5 m ahead, parked car right-front with a 2 m gap, free ground behind. Before: 3 shuttle episodes, never out. Cause 1: the field did not know the parked car, so it (and the A* heuristic) pointed through the 2 m gap; cause 2: the parked car counted as a flee threat (goal ring away from it, ignoring walls); cause 3: hand-back to the local planner which then turned back into the pocket. Now out in ~8 s, goal 13.7 s, 3 reversals.
- Perf (lab seed 3, 1800 frames, route planner stage): mean 0.77 -> 1.15 ms, p95 0.55 -> 7.4 ms (field rebuilds), max 121 -> 64 ms; perception unchanged (2.1 ms).
- Smoke (`self_hunt_flexible`, seeds 1-6 x 3600 frames): episodes before 0/?/6-20 per seed -> 0, 1, 1, 1, 12, 0 (seed 5). Remaining: seed 5 f1050-1590 at (-24,325): boxed in between props, a pyramid and two cars (one moving at 7 m/s), `partial` route, 12 jitter/shuttle episodes, mean 5.8 m/s (a pocket with MOVING neighbours: not covered by `pocket-escape`); seed 2 f1275 (-195,237) in maze A among cars; seed 3 f2640 (-161,214) maze A exit; seed 4 f210 (-64,183) one short episode.

## Perf: per-frame cost of perception / motion planner (2026-10, bit-identical)
- Profile (self_hunt_flexible focus car, ~46 rays/frame, ~330 memory cells): perception ~45%, route planner ~25%, motion planner ~20% of the AV chain; raycasts are only ~20% of perception, the rest is JS (memory clearing walk, static-point window, per-ray allocations).
- `av-perception.js`: bloom prefilter in front of the memory-clearing Map lookup, static-point bucket window cached (non-enumerable `state.sm.pc`), no `api.vec.offsetAlong` / repeated `atan2(sin, cos)`, key list reused. `av-motion-planner.js`: dense grid instead of the `Map` hash, per-candidate pose cache shared by the hard / soft / clearance sweeps, `sin`/`cos` shared with the footprint rotation, aim-angle `sin`/`cos` table built once per frame, world-box reject before the ego transform. Engine: `api.raycast` validates in place (no vector copies), `PhysicsWorld.raycast` reuses one `RAPIER.Ray`.
- Result: lab (seeds 2,3 x 1800 frames) final pose / path / METRICS byte-identical; `av-evasion-scenarios` and `av-maze-scenarios` reports identical; `av-evasion-scenarios.test.ts` 44 s -> 26 s wall, maze 38.5 s -> 26.5 s, whole `src/test/scenarios` 162 s -> 127 s (machine shared, compare back to back). Lab focus chain mean 2.8 -> 2.5 ms (perception 1.2-1.3 -> ~1.05, motion 0.55-0.63 -> ~0.49 ms).
