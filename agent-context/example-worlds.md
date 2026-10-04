# Example Worlds and Test Fixtures

## Global transformers and pipes (`public/global/`)

Shared **custom transformer source** and **pipe manifests** for the self-driving car stack. Headless tests, example worlds, and `hunt_repair2` all read the same files under [`public/global/`](../public/global/).

| Path | Role |
|------|------|
| [`public/global/transformers/self-driving-car/`](../public/global/transformers/self-driving-car/) | `umlenker.js`, `direction.js`, `auto-brake.js`, `target-line-visualizer.js` |
| [`public/global/pipes/self-driving-car-pipe3.json`](../public/global/pipes/self-driving-car-pipe3.json) | Pipe3 stage order + hunt vs fixture stage-id bindings |

**Sync after patch edits:** `npm run sync:global-pipeline` — copies `tools/renn-mcp/patches/` → global transformers, updates manifest checksums, syncs `hunt_repair2`, re-exports all `self_drive_*` example worlds.

On another browser/port: **File → Example Worlds** (loads exported `world.json` with embedded registry). **Organize → Global → Pipes** lists shipped defaults from [`shipped-global-behavior-library.json`](../public/global/shipped-global-behavior-library.json) (auto-merged into IndexedDB on Builder open). Fetch raw stage JS from `/global/transformers/self-driving-car/` when debugging.

## Folder Structure (`public/exampleWorlds/`)

Example worlds are stored in [`public/exampleWorlds/`](../public/exampleWorlds/) and can be opened via **File → Example Worlds** menu in the Builder. Each id is a folder name that contains at least `world.json`; GLB-heavy exports also need an `assets/` tree (same layout as a Builder **Export** zip).

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
| `self_drive_cube` | [`public/exampleWorlds/self_drive_cube/`](../public/exampleWorlds/self_drive_cube/) | Headless diagnostic scene in Play: car + cube obstacle, goal behind cube; Pipe3 self-driving patches. Regenerate: `npx tsx tools/renn-mcp/export-self-drive-example-world.ts` |
| `self_drive_parkour` | [`public/exampleWorlds/self_drive_parkour/`](../public/exampleWorlds/self_drive_parkour/) | Multi-segment parkour: `targetPoseInput` mission (4 waypoints), 3 mixed obstacles; same Pipe3 stack as cube. Regenerate: `npx tsx tools/renn-mcp/export-self-drive-parkour-example-world.ts` |
| `self_drive_cylinder` | [`public/exampleWorlds/self_drive_cylinder/`](../public/exampleWorlds/self_drive_cylinder/) | Cylinder-only stall repro (ground + `parkour_cylinder_l`, car **tight @ z≈−36**, wp @ z=−50). Headless artifact: `agent-context/recordings/seg4-cylinder-tight-stall.json`. Regenerate: `npm run sync:global-pipeline` or `export-self-drive-cylinder-example-world.ts` |
| `self_drive_parkour_beside` | [`public/exampleWorlds/self_drive_parkour_beside/`](../public/exampleWorlds/self_drive_parkour_beside/) | Short beside-gate parkour (cone + flank waypoint). Regenerate: `export-self-drive-parkour-beside-example-world.ts` or `npm run sync:global-pipeline` |
| `self_drive_av` | [`public/exampleWorlds/self_drive_av/`](../public/exampleWorlds/self_drive_av/) | Parkour course driven by the industry-style **AV stack** (nested pipes: sense / plan / control / safety, Hybrid-A* manoeuvre planner). See [feature-av-stack.md](./feature-av-stack.md). Regenerate: `npx tsx tools/renn-mcp/export-self-drive-av-example-world.ts` |
| `self_hunt_flexible` | [`public/exampleWorlds/self_hunt_flexible/`](../public/exampleWorlds/self_hunt_flexible/) | **Pursuit with a labyrinth**: the AV car (`entity_1779823253285_brtkx1p`, its pipeline is owned by the AV stack) flees 11 chasers sharing legacy pipe `pipe_1780343603350`. Pack: 4 hunters target the AV directly, 5 trail the orange leader (`..._wy2smf6`), which targets the AV; each has a static distinct hue. Press `1` in Play to take over a chaser (input stage on `car` / `Player ROT`). No score/referee/pressure ramp/danger tint/beacon any more (removed again; the pack has no extra drive beyond its pipe). Pack cars used to carry the pipe **and** a decoupled entity-level copy of all 8 stages; only the pipe remains, its `Target` id comes from the stack-binding param. **Walls** (`wall_*` entities, static boxes, 1.5 m high x 1 m thick, same green material/friction/restitution as the older `box green 1 copy copy` walls, all axis-aligned or yawed only): maze A (6x6 cells, x -210..-120, z 240..330), maze B (7x5, x 70..175, z 270..345), maze C (4x4, x -310..-250, z 60..120) with 14 m corridors, dead ends, a few loops and 2-3 gates each; two long block walls between pack and AV (z 125 and z 150); two 16 m-wide U traps (opening south at x -20, z 215..250; opening west at x 175..205, z 133..149); an S chicane of 5 gates with 14 m gaps (x 190..320, z 20..164); a funnel (throat 14 m) at x 120..180, z -90..-40; a zig-zag at x -270..-140, z -100..-10. All cars keep >= 15 m from every wall; props that overlapped walls were relocated. There is no arena perimeter wall (open ground). Headless check: `src/test/scenarios/hunt-game.integration.test.ts` (pipelines once, no referee leftovers, wall clearance, 1800 frames simulate). AV lab: `AVLAB_WORLD=self_hunt_flexible AVLAB_FOCUS=entity_1779823253285_brtkx1p`. AV car params for the labyrinth: `staticMap`, `fieldHeuristic`, `maneuverRunSpeed` 7, `handbackMargin` 0.9, `fleeStoppedSpeed` 1.5 (see feature-av-stack.md, Maze routing). |

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
