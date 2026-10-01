# AV stack — industry-style self-driving pipeline (nested pipes)

Experimental second approach next to the legacy **Pipe3** stack (Umlenker → direction → auto-brake). It follows the
classic autonomy architecture — **sense → plan → control → safety** — with one transformer stage per module, grouped as
**nested, configurable pipes** (manifolds, see [feature-transformer-pipes.md](./feature-transformer-pipes.md)).

Sources: `public/global/transformers/av-stack/*.js` · fixture/builder: `src/test/fixtures/avStackWorld.ts`
(`applyAvStack`) · tests: `src/test/scenarios/av-stack.integration.test.ts`.

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
- Not yet shipped: no entry in `shipped-global-behavior-library.json`, no example world, not wired to `sync:global-pipeline`.
