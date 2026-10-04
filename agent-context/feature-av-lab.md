# AV lab — headless test orchestration for "stuck / jittering car" bugs

Real worlds (hundreds of bodies, other cars with legacy pipes, random goals) make car bugs look random. The lab turns a
run into a deterministic, observable, replayable experiment. Code: `src/test/avLab/` · CLI: `src/test/scenarios/av-lab.diagnostic.test.ts`
(skipped unless `AVLAB_WORLD` / `AVLAB_SCENE` is set) · profiler: `src/runtime/transformerProfilerBridge.ts`.

## Pieces

| Piece | File | What it does |
| --- | --- | --- |
| Determinism | `avLab/determinism.ts` | Seeded `Math.random` (state can be saved/restored) + `Date.now` tied to the simulation clock. Legacy stages (`direction.js`, `umlenker.js`, inline world code) time with `Date.now`; headless that made every run different. Same (world, seed, frames) ⇒ identical trajectory. |
| Motion heuristic | `avLab/motionMonitor.ts` | 3 s window per vehicle: `net` displacement, `path`, `yawPath`, speed sign `flips`, `roughness` (mean \|Δv\| per frame). Classes: `asleep` (body sleeping), `stall`, `jitter` (high-frequency chatter: flips ≥ 3 or roughness > 0.8), `shuttle` (slow back-and-forth without progress), `moving`. An event fires once per episode. |
| Scene capture | `avLab/lab.ts` `runLab` | On every trigger: all dynamic body states (pose, velocity, sleeping) every 30 frames over the last 8 s, every chain entity's stage instance fields every 60 frames (custom `state`, preset fields like the wanderer target), RNG state, per-frame tracks of the other vehicles, and a diagnostic dump (watch values, contacts, physics rays with entity names, nearby bodies). Written as `<name>-s<seed>-<kind>-f<frame>.scene.json`. |
| Triggers | `runLab` options | motion events (`captureKinds`), `slowTriggerMs` (a stage call slower than N ms), `captureAt` (fixed frames). |
| Replay | `replayScene` | Rebuilds the constellation from a snapshot (`rewindSec` before the trigger), optionally restores stage states, runs one settle step (contacts / touching cache), and **puppets** the other vehicles along their recorded tracks (legacy stage code keeps hidden closure state that no snapshot can capture). Reports **fidelity**: focus / worst-body position error vs the original at every stored snapshot frame. |
| Probes | `liveStageState`, `watchValues`, `diagnose` | Per-frame access to a stage's live `state` / watch values in `onFrame` hooks — write a throw-away probe test around `replayScene`. |
| Pipe timing | `transformerProfilerBridge.ts` | Off by default. `TransformerChain.execute` times every stage, `RenderItemRegistry` every chain. Per entity × stage: calls, mean, p95, max, share; slow-call list with frame tag (`setTransformerProfilerFrame`). Browser console: `__rennProfiler.enable()` / `.report()`. |

## CLI

```bash
# drive a world, watch one vehicle, capture scenes on trouble (several seeds)
AVLAB_WORLD=self_hunt_flexible AVLAB_FOCUS=<entityId> AVLAB_SEEDS=2,6,7 AVLAB_FRAMES=3600 npx vitest run src/test/scenarios/av-lab.diagnostic.test.ts
# replay a captured scene from 4 s before the trigger with restored stage state
AVLAB_SCENE=test-results/avlab/<file>.scene.json AVLAB_REWIND=4 AVLAB_RESTORE=1 npx vitest run src/test/scenarios/av-lab.diagnostic.test.ts
```

More env: `AVLAB_OUT` (default `test-results/avlab`), `AVLAB_MAX_SCENES`, `AVLAB_STOP` (stop after N scenes), `AVLAB_CAPTURE_AT=1170,1500`,
`AVLAB_SLOW_MS=200`, `AVLAB_PROFILE=1` (timing table of every entity). `AVLAB_WORLD` also takes a path to a world.json. The lab applies the current
global library to the world (`updateWorldFromGlobalLibrary`) — run `npm run sync:global-pipeline` after editing `public/global/transformers/**`.

Output per seed: path length, realtime factor, `roughness` / `spikes` (smoothness), frames per class, events, scene files, final watch values, the focus
stage timing table, chain means of all entities and slow calls.

## Workflow that found the 2026-10 bugs

1. Run several seeds on the real world → events + roughness show *what kind* of trouble (jitter vs stall vs sleep vs shuttle).
2. Replay the scene; check fidelity. A chaotic controller (limit cycle) makes the focus diverge even with a perfect environment — itself a finding.
3. Probe test around `replayScene` printing the stage states per frame → root cause.
4. Fix, re-run the same seeds (deterministic ⇒ before/after is a fair comparison), add the situation to `AV_EDGE_CASES`.

## Known limits

- Fidelity of the focus is limited by chaos in the scene (contacts, solver warm-start are not snapshotted); the environment is exact via puppets.
- Puppets are moved by velocity tracking: they still collide and can be pushed, but they do not react to the focus.
- A single stage call of ~25 s in long background runs was an OS pause (it vanished in the identical deterministic rerun); look at p95, not max, for cost.

## Metrics, code versioning (2026-10)

- `METRICS` line per seed: mean / max speed, path, **catches** (a chaser centre within 1 m of the focus hull: OBB distance minus 2 m chaser half-width < `CATCH_GAP`; an episode ends when the gap exceeds `CATCH_CLEAR` 3 m), min chaser distance, fraction of time with a chaser centre < 15 m. Chasers = other chain entities whose first pipe id matches `AVLAB_CHASER_PIPE` (default `^pipe_`).
- `STEER` line: mean |Δsteer| per frame, steering **reversals per second** (swing > 0.03 against the previous direction, speed > 3 m/s), |Δ yaw rate|, planner curvature changes/switches per second, obstacle-memory flicker (needs the perception `memCount` state). Baseline before the lateral smoothing: 8-10 reversals/s; after: 2.5-3.
- `AVLAB_PARAMS='{"comfortDecel":6}'` overrides params of the focus pipe binding for quick tuning.
- **Versioning:** `CODE VERSION` line = hash per AV stage + overall stack version (hash of the code that executes, `src/globalPipeline/avStackVersion.ts`), plus whether `world.json` embeds stale code. Scenes carry `stackVersion`; replay warns on mismatch. The Builder header shows `build <sha> · av <version>` and logs the same to the console, so compare it with the lab line.
- `npm run sync:global-pipeline` also upgrades stage code embedded in `public/exampleWorlds/*/world.json` (`tools/renn-mcp/upgrade-example-worlds-library.ts`); `avStackVersion.test.ts` fails when `self_hunt_flexible/world.json` is out of sync. Example `world.json` is fetched with `?v=<build sha>` and `cache: 'no-cache'`.
- Many AV integration tests (course, beside-gate, wander, lane-slowing) are chaotic: any behaviour change flips one of them. Judge a change by the whole set and re-run flaky ones (the wanderer tests use wall-clock time and also fail at HEAD sometimes).

## Scripted scenarios (2026-10) — pass / fail instead of seed aggregates

`src/test/scenarios/av-evasion-scenarios.test.ts` + `src/test/fixtures/avEvasionArena.ts`. Random-seed aggregates (mean speed, metres over 6 seeds) are chaotic; a scenario is one fixed start, a
fixed duration and explicit criteria, so a regression names the situation. ~40 s for 10 scenarios (<= 20 s sim each, `profile: false`).

- **Car:** the `self_hunt_flexible` AV (entity, pipe binding + all params, wanderer + car2 stages, current global library code), copied at test time. Only the start pose, the goal and `threatIds` (= the scripted chasers) differ. The goal is the preset wanderer with its perimeter collapsed onto one point (a fixed, non-final goal).
- **Arena:** infinite ground plane, static boxes (`ArenaBox`), optional light dynamic clutter cubes. Every run builds a fresh world (reset to the defined start), seeded RNG, simulated clock (`runLab`).
- **Chasers = kinematic puppets** (`PuppetSpec`): `park`, `line` (constant velocity along the heading) or `home` (pure pursuit of the car position + velocity * `lead`, fixed speed, turn-rate limit). Pose is a pure function of time / car pose. Yaw convention = the car's (0 = -Z, positive = left).
- **Metrics** (`ScenarioMetrics`, one line per scenario in the `AV SCENARIOS` table): min hull-to-hull gap to chasers, chaser / static contact frames (gap < 0.1 m, exact rectangle distance), stalled seconds (< 0.5 m/s after 1 s), steering reversals/s (lab), signed mean / peak / reverse / end speed, progress toward the goal, speed spikes (> 2 m/s per frame after 0.5 s), speed-limit-source histogram, first contact time. `AV_SCENARIO_TRACE=1` prints a 1 Hz trace (t, x, z, forward speed) of every run.
- **Add a scenario:** append to `SCENARIOS` (name, one-line `about`, `seconds`, `spec()` returning an `ArenaSpec`, `criteria(m)` returning the violated criteria; start from `surviveCriteria()`). A spec may derive its timing from another run (`crossing` reads the open-road trace so the chaser meets the car at t=6 s if it keeps going).
- **Known failures:** `KNOWN_FAILING[name] = 'suspected cause'` runs the scenario with `it.fails`: CI is green, the table still prints `FAIL` + the broken criteria, and the entry's text. When the AV is fixed the `it.fails` turns red -> delete the entry (it becomes a normal `it`). Current failures: reverse-escape, open-road-reverse (causes in the file).
- Runs are bit-identical across repeats (checked twice). If you change the AV stack run `npm run sync:global-pipeline` first; the arena applies the library on load.
