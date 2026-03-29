# Example Worlds and Test Fixtures

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

Tests live in [`src/test/scenarios/`](../src/test/scenarios/) and use `WorldSimulator` from [`src/test/helpers/worldSimulator.ts`](../src/test/helpers/worldSimulator.ts).

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
