# Example Worlds and Test Fixtures

## Global transformers and pipes (`public/global/`)

Shared **custom transformer source** and **pipe manifests** for the self-driving car stack. Headless tests, example worlds, and `hunt_repair2` all read the same files under [`public/global/`](../public/global/).

| Path | Role |
|------|------|
| [`public/global/transformers/self-driving-car/`](../public/global/transformers/self-driving-car/) | `umlenker.js`, `direction.js`, `auto-brake.js`, `target-line-visualizer.js` |
| [`public/global/pipes/self-driving-car-pipe3.json`](../public/global/pipes/self-driving-car-pipe3.json) | Pipe3 stage order + hunt vs fixture stage-id bindings |

**Sync after patch edits:** `npm run sync:global-pipeline` — copies `tools/renn-mcp/patches/` → global transformers, updates manifest checksums, syncs `hunt_repair2`, re-exports the fixture-built example worlds (`self_drive_av`, `av_fleet_eco`).

On another browser/port: **File → Example Worlds** (loads exported `world.json` with embedded registry). **Organize → Global → Pipes** lists shipped defaults from [`shipped-global-behavior-library.json`](../public/global/shipped-global-behavior-library.json) (auto-merged into IndexedDB on Builder open). Fetch raw stage JS from `/global/transformers/self-driving-car/` when debugging.

## Folder Structure (`public/exampleWorlds/`)

Example worlds are stored in [`public/exampleWorlds/`](../public/exampleWorlds/) and can be opened via **File → Example Worlds** menu in the Builder. Each id is a folder name that contains at least `world.json`; GLB-heavy exports also need an `assets/` tree (same layout as a Builder **Export** zip).

**Shareable links** (`src/utils/exampleWorldUrlParam.ts`, wired in `src/pages/Builder.tsx`): opening an example world writes `?example=<id>` into the address bar; `&entity=<entityId>` (first selected entity) and `&tool=<gizmo mode>` (`translate`, `rotate`, `scale`, `transform`, `paint`, `visualize` = Visualize custom transformer variables) follow the Builder state live (`history.replaceState`). Starting the Builder with such a URL loads the world and restores selection + tool (unknown entity / tool are dropped). Opening any other project (IndexedDB, New, import) removes the params.

**Discovery:** In dev, the Builder menu loads ids from `GET /__renn-agent/dev/example-worlds` (folders under `public/exampleWorlds/` with `world.json`). Production builds use the same folder set at compile time. Agent/MCP code uses `listAgentDevExampleWorldIds()` — never a hardcoded id list in `src/` or `tools/`.

### Adding a world from Export

1. In Builder: **Export** (zip with `world.json` + `assets/`).
2. Unpack into `public/exampleWorlds/<id>/` (choose a stable folder name = `exampleWorldId`).
3. Do **not** commit large GLB binaries unless the team wants them in git.
4. **Agent Chrome cannot download exports:** use MCP `export_saved_project_to_example_world` or `npx tsx tools/renn-mcp/agent-export-saved-to-example-world.ts` (see below).
5. Reload dev (or wait for the Example Worlds menu fetch in dev) — **File → Example Worlds**, MCP `load_example_world`, or `npm run agent:work-on-project -- --example-world <id>`.

Browser and MCP loaders fetch `world.json` and hydrate blobs from `exampleWorlds/<id>/assets/` via `loadExampleWorldFromPublicBase` (attach) and `loadAgentExampleWorldFromDisk` (headless Node).

### Shipped examples (may change)

| World | Folder | Notes |
|-------|--------|--------|
| `hunt` | [`public/exampleWorlds/hunt/`](../public/exampleWorlds/hunt/) | Includes GLB assets |
| `world1` | [`public/exampleWorlds/world1/`](../public/exampleWorlds/world1/) | General example |
| `hunt_repair2` | [`public/exampleWorlds/hunt_repair2/`](../public/exampleWorlds/hunt_repair2/) | Large repair/hunt scene (660+ entities); exported via agent disk import |
| `self_drive_av` | [`public/exampleWorlds/self_drive_av/`](../public/exampleWorlds/self_drive_av/) | Parkour course driven by the industry-style **AV stack** (nested pipes: sense / plan / control / safety, Hybrid-A* manoeuvre planner). See [feature-av-stack.md](./feature-av-stack.md). Regenerate: `npx tsx tools/renn-mcp/export-self-drive-av-example-world.ts` |
| `world_default` | [`public/exampleWorlds/world_default/`](../public/exampleWorlds/world_default/) | Copy of the default static project [`public/world/world.json`](../public/world/world.json) (373 entities), which the Builder UI never loaded (`loadWorldFromStatic` is only used by tests). Its asset paths point at `../../world/assets/` so the 97 MB asset folder is not duplicated. Edit the source in `public/world/`, re-copy when it changes. |
| `av_fleet_eco` | [`public/exampleWorlds/av_fleet_eco/`](../public/exampleWorlds/av_fleet_eco/) | 7 AV cars (budget `eco`) on open ground with 4 low walls, `spread` layout of `buildFleetWorld` (`src/test/fixtures/avFleet.ts`). Every car runs the global AV autopilot pipe; each has its own `wanderer` goal stage (fixed point ~260 m away) and car2 actuator. Camera follows the first car. Headless smoke: `src/test/scenarios/agent-example-world-av-fleet.integration.test.ts`. Regenerate: `npx tsx tools/renn-mcp/export-av-fleet-example-world.ts` or `npm run sync:global-pipeline` |
| `policy_drive_field`, `policy_drive_slalom`, `policy_drive_maze` | [`public/exampleWorlds/policy_drive_*/`](../public/exampleWorlds/) | **Evolved neural driving policy** ([feature-policy-evolution.md](./feature-policy-evolution.md)): one world per course kind, each car driven only by the shipped policy weights (`src/policyEvolution/shippedPolicy.json`, 252 numbers, custom stage + unchanged `car2`). `_field`: held-out `field:1001` (open ground, scattered boxes); `_slalom`: `slalom:1001` (narrowing corridor with pillars); `_maze`: four held-out mazes `maze:1001`-`1004` side by side (220 m apart, 6x6 cells, goal chain = shortest route), steep third-person camera following the first car (use the free camera for the others). Camera must use `mode: 'thirdPerson'` (an unknown mode renders a black view). Source: `src/policyEvolution/` (`courses.ts`, `exampleWorld.ts`). Tests: `src/policyEvolution/exampleWorld.test.ts` (disk == exporter, every car drives off). Regenerate after `tools/policy-evolution/ship.ts`: `npx tsx tools/renn-mcp/export-policy-drive-example-world.ts` (also removes the retired combined `policy_drive`) |
| `policy_chains_field`, `policy_chains_slalom`, `policy_chains_maze`, `policy_chains_crowd` | [`public/exampleWorlds/policy_chains_*/`](../public/exampleWorlds/) | **v2 command-following net** (`src/policyEvolution/shippedPolicyV2.json`, `POLICY_STAGE_CODE_V2`, [spec](./spec-command-chains.md)) driving DIFFERENT target-vector chains through the SAME setup: one held-out setup per kind (first accepted seed from 1001, canonical start: `field:1001@0.3`, `slalom:1001`, `maze:1009`, `crowd:1002`; maze 1001-1008 and crowd 1001/1003 have < 2 chains), every chain of it in its own copy of the setup (x offsets 100/110/160/110 m), one car per copy. Floating coloured slabs (9 m up, above walls, cars and the 0.5 m rays; colour = chain) mark each chain's waypoints. Third-person camera follows chain 0's car (maze: steep). Headless outcomes with the shipped net (seed-fixed, not cherry-picked): field finish/finish/crash/crash, slalom finish/finish, maze offcourse/finish, crowd crash x3 (see `exampleWorld.test.ts` log). Source/test: `src/policyEvolution/exampleWorld.ts` (`POLICY_CHAINS_EXAMPLE_WORLDS`), `exampleWorld.test.ts`; exporter `tools/renn-mcp/export-policy-drive-example-world.ts` |
| `av_maze_escape` | [`public/exampleWorlds/av_maze_escape/`](../public/exampleWorlds/av_maze_escape/) | **Maze escape for AV speed optimisation**: seeded 8x8 recursive-backtracker maze (maze seed 7, 15 m pitch = 14 m corridors, walls 1 m thick x 1.5 m high, ~10% of the interior walls removed for loops, one exit gate on the north perimeter), the `self_hunt_flexible` AV car (copied exactly as the scripted-scenario arena does: pipe binding + all params, `saver` off, no `threatIds`, **plus the evolved default car params** `MAZE_ESCAPE_DEFAULT_CAR_PARAMS` = set H2 c870 (run run-muzksopu) from `src/avEvolution/maze/mazeEscapeDefaultCar.json`, merged after the pinned maze params; HOLDOUT-24 18.1 s mean, 24/24, 0 contacts; see feature-av-evolution.md; goal = wanderer perimeter collapsed onto one point 25 m behind the gate, flat yellow marker). Source: `src/avEvolution/maze/` (`generateMaze`, `listMazeEpisodes()` = TRAIN/HOLDOUT episode specs `{key, mazeSeed, startCell, startYaw}`, `buildMazeEpisodeWorld`). Tests: `src/avEvolution/maze/maze.test.ts` (always on, world equals exporter output); baseline of the current car params: `AV_MAZE_BASELINE=1 npx vitest run src/test/scenarios/av-maze-escape-baseline.diagnostic.test.ts` -> `test-results/av-maze-escape/baseline.json`. **`mazeProfile` is pinned `null`** (`MAZE_PINNED_CAR_PARAMS`; guards against any maze profile on the copied `self_hunt_flexible` binding overriding the evolved genes in-maze). Regenerate: `npx tsx tools/renn-mcp/export-av-maze-escape-example-world.ts` (rerun after `npm run sync:global-pipeline` / car or library changes in `self_hunt_flexible`) |
| `av_neural_crowd` | [`public/exampleWorlds/av_neural_crowd/`](../public/exampleWorlds/av_neural_crowd/) | **Neural drive mode of the AV car (Phase 1 of [plan-policy-in-av-car.md](./plan-policy-in-av-car.md))**: the `self_hunt_flexible` AV car (4 x 8, copied as the scripted-scenario arena does) in the static `parked-gauntlet` crowd case (two staggered rows of 14 parked 4 x 8 cars between side walls, walls 8.3 m off the axis, goal 250 m ahead, flat yellow marker) with binding `neuralMode: 'auto'` + the crowd trigger thresholds `NEURAL_CROWD_TRIGGER` (the plan's default thresholds never fire here). The shipped v1 policy (zero-padded to the v2 net) takes over for a few seconds inside the gauntlet (violet status mast + violet line to the aim point, watch `av.neural` / `av.neural.n`) and hands back on the open road. Thresholds are NOT tuned; the net was trained on goals, not on the AV's route carrots (see feature-av-stack.md 'Neural drive mode'). Source: `src/test/fixtures/avCrowdCases.ts` (`buildNeuralCrowdExampleWorld`, cases `AV_CROWD_CASES`). Tests: `src/test/scenarios/av-neural.integration.test.ts` (world equals exporter output). Regenerate: `npx tsx tools/renn-mcp/export-av-neural-example-world.ts` (rerun after `npm run sync:global-pipeline` / library changes) |
| `self_hunt_flexible` | [`public/exampleWorlds/self_hunt_flexible/`](../public/exampleWorlds/self_hunt_flexible/) | **Pursuit with a labyrinth**: the AV car (`entity_1779823253285_brtkx1p`, its pipeline is owned by the AV stack) flees 10 chasers that run the **same AV pipe** (`global_av_autopilot`, `budget: "eco"`, no `threatIds`, same tuning as the AV minus the flee params; `goalTolerance` 1.5 / `goalReach` 2) with a `follow` goal-source stage (`hunt_chase_av` / `hunt_chase_leader`, speed 40, `isFinal: false` so the speed planner never brakes for arrival or holds, `leadTime` 1.0 s / 0.3 s = aim at the predicted target position; the follow preset gained `leadTime` + `isFinal` params; with the old final goal + 6 m tolerance the pack held ~6 m away, lab 8 seeds: catches 0, min dist 6.7 m -> 1 catch, min 4.7 m, hunt-game test asserts < 5 m with determinism seed 8) and their own car2 actuator `hunt_chaser_car` (power 400, so the pack is not faster than before). `car` (Player Car, key `1` takeover) keeps the legacy pipe `pipe_1780343603350` (its `vis2`/`AutoBrake` stages are guarded against a missing `input.target`; they used to throw ~560 'undefined pose/distance' errors since `car` has no target param). Cost (2026-10-05): the 11 AV-pipe cars cost ~3900 weighted work/frame (~340 each), ~11x the AV alone; AV lab wall time for 4 seeds x 1800 frames 156 s -> 348 s. Pack: 4 hunters follow the AV directly, 5 trail the orange leader (`..._wy2smf6`), which targets the AV; each has a static distinct hue. Press `1` in Play to take over a chaser (input stage on `car` / `Player ROT`). No score/referee/pressure ramp/danger tint/beacon any more (removed again; the pack has no extra drive beyond its pipe). Pack cars used to carry the pipe **and** a decoupled entity-level copy of all 8 stages; only the pipe remains, (legacy: the `Target` id came from the stack-binding param; now the `follow` stage's `targetEntityId`). Lab/test chaser detection = AV-pipe car without `threatIds` that has a `follow` stage (`AVLAB_CHASER_PIPE` regex overrides). **Walls** (`wall_*` entities, static boxes, 1.5 m high x 1 m thick, same green material/friction/restitution as the older `box green 1 copy copy` walls, all axis-aligned or yawed only): maze A (6x6 cells, x -210..-120, z 240..330), maze B (7x5, x 70..175, z 270..345), maze C (4x4, x -310..-250, z 60..120), plus four large labyrinths with 14 m corridors, loops and 3 gates each (`wall_maze_D_*..G_*`, 151 walls, seeded recursive backtracker): D 8x10 cells x -371..-258, z 210..351; E 9x8 x 203..330, z 273..386; F 8x8 x 217..330, z -420..-307; G 10x8 x -441..-300, z -441..-328 (AV `fleeArea` widened to +-450 so it can enter them; >= 15 m from cars, >= 6 m from props) with 14 m corridors, dead ends, a few loops and 2-3 gates each; two long block walls between pack and AV (z 125 and z 150); two 16 m-wide U traps (opening south at x -20, z 215..250; opening west at x 175..205, z 133..149); an S chicane of 5 gates with 14 m gaps (x 190..320, z 20..164); a funnel (throat 14 m) at x 120..180, z -90..-40; a zig-zag at x -270..-140, z -100..-10. All cars keep >= 15 m from every wall; props that overlapped walls were relocated. There is no arena perimeter wall (open ground). **Scripts**: only `hinnstellen` (onTimer 3 s, flips an upside-down/lying car upright via `ctx.resetRotation()`) remains in `world.scripts`, attached to all 13 cars (AV, 11 chasers, `car`, Player ROT); the score/damage/GAME OVER `collision` script, an empty onUpdate script and dangling `script`/`timer` refs were removed. **Hazards**: no dynamic prop intersects or rests on a wall (2 m gap, tested); the 283 m `pyramid blue 1` now stands on the ground at (-1000, -540), far outside the maze area, instead of hovering over the walls. Headless check: `src/test/scenarios/hunt-game.integration.test.ts` (pipelines once, no referee leftovers, wall clearance, no dynamic prop on/in a wall, scripts, 1800 frames simulate). AV lab: `AVLAB_WORLD=self_hunt_flexible AVLAB_FOCUS=entity_1779823253285_brtkx1p`. AV car params for the labyrinth: `staticMap`, `fieldHeuristic`, `routeClearance`, **`budget: "eco"`** (economy mode incl. calm-cruise `scanFocus`; set `"full"` for the old behaviour; the full-budget suites and the pursuit sweep pin `full` explicitly), `maneuverRunSpeed` 7, `handbackMargin` 0.9, `fleeStoppedSpeed` 1.5 (see feature-av-stack.md, CPU budget and Maze routing).  **Keep right (2026-10-05): all 11 AV-pipe cars run `passSide: "right"`** (oncoming non-threat traffic is passed with the other car on the left; chasers carry `passIgnoreIds: [their follow target]`, the AV excludes the chasers through `threatIds`; feature-av-stack.md "Keep right when passing"; `"off"` or unset = old behaviour). **CPU (2026-10-05): all 11 AV cars run budget `saver`** (`budget: "eco"` + `saver: true` + `scopeParams` with `tickEvery` 3 / 4 / 2 for perception / route planner / motion + speed planner, see feature-av-stack.md "Saver budget"); Watch panel rows `av.budget` / `av.ms` on every car; `av-perf.diagnostic.test.ts` prints the per-frame ms split. Scripted scenario suites copy the car but drop the scopes and pin their own budget. **Goal display + score/damage (2026-10-05):** AV binding params `goalViz: true` (lime mast + ring at its goal, orange carrot + route chain, Builder visualize / `debugTargetLineEntityId` only), `hud: true` (HUD feed), `goalReachDist: 31`: **score +1** when the wanderer replaces its goal with the car within 31 m (flee goals never count), **damage +1** per chaser approach episode (`damageDist` 8 m centre distance, re-armed above `damageClear` 14 m). No world script involved (the collision / GAME OVER script stays removed); enable View -> Game HUD in the Builder to see green score / red damage. Test `hunt-game-score.integration.test.ts`; details in feature-av-stack.md 'Debug overlay'. **Maze-region profile:** none shipped (opt-in `mazeProfile` mechanism exists; hand-picked values reverted 2026-10-08, feature-av-evolution.md 'Transfer to self_hunt_flexible'). **Maze module (2026-10-07):** all 11 AV cars run `mazeModule: true` (in a confined space the flee goal is a waypoint on the least-resistance route to the nearest reachable exit; watch `av.maze`, violet route in the overlay; feature-av-stack.md 'Maze module'; `av_fleet_eco` inherits it through the sync). |

Removed: the small legacy Pipe3 scenes `self_drive_cube`, `self_drive_cylinder`, `self_drive_parkour`, `self_drive_parkour_beside` (headless tests build them from `src/test/fixtures/selfDrivingCarWorld.ts`, not from JSON).

### Agent / MCP worlds → example menu

Any world agents tune via MCP attach should also exist under `public/exampleWorlds/<id>/` so **File → Example Worlds** and `load_example_world` match what Play tests. Rule: [`.cursor/rules/agent-mcp-example-world-sync.mdc`](../.cursor/rules/agent-mcp-example-world-sync.mdc).

### Legacy Example

The example file lives at [`examples/airplane-world.json`](../examples/airplane-world.json). Load it in the Builder to test. (The filename is historical; the scene uses **registry-supported** transformers only.)

## airplane-world.json

Four entities:

| Entity | Body type | Transformers | Purpose |
|--------|-----------|----------------|---------|
| `ground` | static | none | Floor |
| `airplane` | dynamic | `input` + `car2` | Drive with WASD + Space (jump); camera follows (`world.camera.target` = `airplane`) |
| `butterfly1` | kinematic | `wanderer` + `kinematicMovement` | Random targets in a box, pose-driven motion |
| `tree1` | static | none | Scenery |

Global **`world.wind`** `[2, 0, 0]` is passed into the transformer pipeline in Play/Builder preview.

### Vehicle controls (`airplane` entity)

| Input | Action |
|-------|--------|
| W / S | Throttle / brake |
| A / D | Steer |
| Space | Jump (when touching another collider; car2 touch-gating) |

### Abbreviated JSON structure

```json
{
  "world": { "wind": [2, 0, 0], "camera": { "target": "airplane" } },
  "entities": [
    {
      "id": "airplane",
      "transformers": [
        {
          "type": "input",
          "priority": 0,
          "inputMapping": {
            "keyboard": { "w": "throttle", "s": "brake", "a": "steer_left", "d": "steer_right", "space": "jump" }
          }
        },
        { "type": "car2", "priority": 10, "params": { "power": 400, "lateralGrip": 100 } }
      ]
    },
    {
      "id": "butterfly1",
      "bodyType": "kinematic",
      "transformers": [
        { "type": "wanderer", "priority": 5, "params": { "perimeter": { "center": [5,3,5], "halfExtents": [8,2,8] } } },
        { "type": "kinematicMovement", "priority": 6 }
      ]
    }
  ]
}
```

### Export from agent Chrome (downloads blocked)

The agent Playwright profile often cannot save downloads. With Builder attached via MCP:

1. `export_saved_project_to_example_world` with `{ "projectName": "<display name>", "exampleWorldId": "<folder id>" }` — writes `public/exampleWorlds/<id>/` from IndexedDB (dev-only, matches `RENN_MCP_DEV_TOKEN`).

### How to test

1. Import or paste `examples/airplane-world.json` in the Builder.
2. Open Play (or use live preview).
3. Camera follows the `airplane` entity; drive with WASD.

---

## Test Fixture Worlds (`src/test/worlds/`)

Headless integration tests use world JSON files stored in [`src/test/worlds/`](../src/test/worlds/). These worlds use **primitive shapes only** (no GLB assets) so they run in Vitest without a browser or asset resolver.

| File | Purpose |
|------|---------|
| `car-test-world.json` | Box car on a large flat ground; `input` + `car2` transformers. Used by car movement, steering, and direction tests. |

### Adding a world from the browser (Firefox → test fixtures)

1. Open the world in the Builder.
2. Click **Export** (top toolbar):
   - **No GLB assets** → downloads `world.json` — copy directly to `src/test/worlds/`.
   - **With GLB assets** → downloads `world-{id}.zip` — unzip, copy `world.json` to `src/test/worlds/`. Strip `model` fields from entities if GLB loading is not required in the test.
3. Reference the fixture in a test:

```typescript
import myWorldJson from '../worlds/my-world.json'
import type { RennWorld } from '@/types/world'

const sim = await WorldSimulator.create(myWorldJson as unknown as RennWorld)
```

### Integration test infrastructure

Tests live in [`src/test/scenarios/`](../src/test/scenarios/). Most use `WorldSimulator` from [`src/test/helpers/worldSimulator.ts`](../src/test/helpers/worldSimulator.ts) (physics + transformers). **`box-model-material.test.ts`** covers Builder-style material hot-swap on a box collider with an attached GLTF visual (`RenderItemRegistry.updateMaterial`) without loading a GLB file.

**WorldSimulator API:**

```typescript
const sim = await WorldSimulator.create(world)  // loads physics + transformers
sim.setInput({ w: true })                        // hold W key
sim.runFrames(120)                               // advance 2 s at 60 fps
sim.runSeconds(2)                                // equivalent convenience
const [x, y, z] = sim.getPosition('car')        // read entity position
const [vx, vy, vz] = sim.getVelocity('car')     // read linear velocity
const snap = sim.snapshot()                      // log all dynamic entity states
sim.clearInput()                                 // release all keys
sim.dispose()                                    // clean up Rapier world
```

**Scenario script pattern (timed sequences):**

```typescript
sim.runFrames(60)                   // settle on ground
sim.setInput({ w: true })
sim.runFrames(60)                   // drive 1 s
const pos = sim.getPosition('car')
expect(pos[2]).toBeLessThan(startZ) // moved in -Z (forward)
```

Use `sim.snapshot()` to log positions first, then paste the values into `toBeCloseTo` assertions when building precise expected results.

Run all integration tests with:

```bash
npm run test:run
```

---

## E2E GLB fixtures (`e2e/fixtures/`)

Playwright tests for the **Performance booster** dialog with a real GLB use [`e2e/fixtures/`](../e2e/fixtures/):

| File | Purpose |
|------|---------|
| `giraffe-world.json` | World document: static trimesh entity `giraffe` referencing asset `giraffe-test-asset`. |
| `giraffe.glb` | User-provided model (not committed by default). |
| `giraffe-world.zip` | Built bundle: `world.json` + `assets/giraffe-test-asset.glb` for **File → Import**. |

Build the ZIP after adding `giraffe.glb`:

```bash
npm run test:build-fixtures
npm run test:e2e -- e2e/performance-booster-giraffe.spec.ts
```

If `giraffe-world.zip` is missing, the giraffe suite is skipped. See [`e2e/fixtures/README.md`](../e2e/fixtures/README.md).

- 2026-10-05: `npm run sync:global-pipeline` re-run for param forms: AV pipes carry richer `paramDefs` (groups, units, per-layer `tickEvery`) and the self-driving-car stages carry `@params` blocks; world params/poses unchanged.
