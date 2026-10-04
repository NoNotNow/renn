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

## Robustness sweep fixes (2026-10, see "Parametric evasion sweep" in feature-av-lab.md)

Sweep (winnable cases, oracle-classified): 29/78 -> 60/75 (robust, margin >= 2 m: 58/64). Causes found by tracing single cases:
- **Flee goal behind the car (av-ego):** head-on chaser -> the "away" goal lay behind the car, the car U-turned across the chaser's nose at curve speed (9 m/s) and was run over. `fleeTurnPenalty` (1.5) penalises candidates needing > ~70 deg of turn.
- **Standing-start kick:** wrong actuator priors (G 156 vs ~1300 real) gave 0 -> 8 m/s in one frame. Car params now `gainInit 1300`, `maxAccel 60`, `tau 0.12` (launch ~ 60 m/s^2 ramp, <= 1.2 m/s per frame, same v(0.5 s) ~ 14 m/s as the kick; a plain `gainInit` + `maxAccel 10` launch lost ~5 sweep cases, `tau` 0.35 too slow).
- **Progress beat a predicted contact (av-motion-planner):** an "aim at the carrot" arc (+115 m progress) into the pursuer cost less than the straight run with no predicted hit. `threatHitFloor` (250) = flat cost of ANY predicted contact. That then outweighed a certain wall collision (blocked path <= 78), so `wRequired` 300 (alley: hard left into the wall at 35 m/s).
- **Braking while chased (av-speed-planner):** the route-bend limit (stale route, 32 -> 11 m/s) and the comfort-decel free-path limit (35 m free path = 16 m/s) slowed the car in front of a 25-30 m/s pursuer. While a fast body closes in (`chased`): no route limit, free limit with `chasedDecel` (9). Side effect: open-road speed with a pursuer can reach ~50 m/s.
- **Pursuer turn rate (av-ego / av-motion-planner):** `av.threats[].turn` = recent max observed turn rate; the homing prediction uses `clamp(1.3 * turn + 0.15, threatTurnMin 0.5, threatTurnRate 1.5)` instead of always 1.5 rad/s.
- Not fixed: fan / pair-with-rear chasers at 110-130 m (the car drives at 40-50 m/s at the central chaser and starts the dodge < 25 m before contact; a `chasedMaxSpeed` cap 32-36 was tried and did not help), and cases with oracle margin < 2 m.

## Lab smoke check + boxed-in deadlock (2026-10, self_hunt_flexible, 6 seeds x 3600 frames)

- **Speed vs chasers (lab `SPEED` line):** free-road seeds (4, 6): AV mean/p50/p90 35-39 / 38-42 / 48-50 m/s, chasers 21 / 21 / 43. Hardware: AV and chaser cars are both 4x1x8, mass 2, friction 0.01; AV `car2` power 2400 vs chaser 400 (the AV is NOT hardware-limited; the referee's pressure ramp adds up to +4 m/s^2 x level for chasers below a 20 + 4 x level m/s cap). Free-road limit sources: `curve` (planned-kappa wobble, mean vDes ~32) and `free`; not cruise. Raising `maxLatAccel` 9 -> 13 gave 40 vs 35 m/s on seed 4 and no change on seed 6 (chaos) and was not adopted.
- Slow seeds (2, 3, 5: mean 8-12 m/s) are manoeuvring in clutter (big cylinders / pyramids, parked car) with the chasers also idle (p50 0.4 m/s), not a speed limit.
- **Deadlock fixed (seed 5, stalled 31 s):** nose 3 m from the corner of a parked car. The route planner's A* (margin 0.4) calls the forward run free and `aheadFree` hands the manoeuvre back to the local planner, whose larger margins allow 0.8 m (`startGap` 0.78) -> v limit 0, stuck watchdog -> same manoeuvre -> hand back ... forever. Now: stuck again within 40 s of a hand-back -> the manoeuvre keeps driving its first 8 m itself (`state.noHandbackFrom`). Scenario `boxed-in-corner` (stalled 18.5 s before, 1.8 s after).
- **`fleeSim` (av-ego, param-gated OFF, not enabled in any world):** experimental escape-heading commit by simulation (24 headings x 2 speed policies against pursuit-predicted chasers, hysteresis, goal 90 m ahead on the heading, early trigger). Picks sensible headings for the fan cases but the motion planner fights the moving goal (kappa flips) and the route planner slows to 11 m/s: not a fix yet (the 6 robust fan / pair cases still fail). Oracle MPC for `triple/v25/low/fan/far`: turn hard at t = 0 (12 m/s, R 9 m) away from the pack, then run at 36 m/s perpendicular; the AV instead accelerates to 40-50 m/s straight at the central chaser.
