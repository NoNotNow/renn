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

## Standstill deadlocks (found via Snapshot)

- **Longitudinal chatter:** zero demand + reverse-thrust braking flipped the speed sign every frame (±5 m/s, no net motion). `av-control-longitudinal.js` now coasts (no thrust) for 1.5 s after 3 sign flips.
- **Manoeuvre waited for rest forever:** a gear change waited for `|speed| < 0.4`, never true while chattering → `vDesired 0` for ever. Now `restWaitMax` (1.2 s) ends the wait; a plan the car is `maxOffPath` (6 m) away from is dropped and replanned.
