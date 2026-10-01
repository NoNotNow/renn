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
│   ├─ av_plan_local
│   │   ├─ av_motion_planner     sampling planner: constant-curvature arcs, swept-footprint check, cost = progress/clearance/smoothness
│   │   └─ av_speed_planner      v = min(cruise, stopping distance, lateral accel, goal approach)
│   ├─ av_supervisor             health watchdog → `needManeuver`; hold at final goal
│   └─ av_plan_tight
│       └─ av_maneuver_planner   Hybrid-A* over forward/reverse arcs → multi-point turns, re-plans on drift/stall
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
  keys for `sense | plan | planLocal | planTight | control | safety`.
- **One stage:** `stageParams[logicalStage]` (stage registry level, shared by all entities using the stage).
- **Ablation:** `applyAvStack(world, { disable: ['maneuverPlanner'] })` — used for the red-check.
- Per-stage params are documented in the header comment of each `.js` file.

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

All 30 cases green: tight + approach cylinder, 24-seed tight perturbation grid, determinism (identical end pose twice),
seg1 / beside-gate / full-course × 5 spawns, seg3 sphere, cube goal-behind × 4 shapes, structure/param-scope tests.
**Red-check:** `disable: ['maneuverPlanner']` makes the tight start stall at its spawn.

## Known limits / next

- `SELF_DRIVE_PARKOUR_CYLINDER_HUG` (spawn centre *inside* the cylinder) is not a valid start for any planner; unused by tests.
- Maneuver planner executes open-loop with guard re-planning; a tracking controller on the planned path would be tidier.
- Costmap is hit-point memory (TTL 15 s), fine for static worlds; moving obstacles need tracking/prediction.
- Not yet shipped: no entry in `shipped-global-behavior-library.json`, no example world, not wired to `sync:global-pipeline`.
