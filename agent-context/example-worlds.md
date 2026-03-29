# Example Worlds

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
