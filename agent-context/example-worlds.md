# Example Worlds

The full example file lives at `examples/airplane-world.json`. Load it in the Builder to test.

## airplane-world.json

Contains three entities:

| Entity | Body type | Transformers | Purpose |
|---|---|---|---|
| Airplane | dynamic | `input` (priority 0) + `airplane` (priority 1) | Player-controlled flight |
| Butterfly | kinematic | `butterfly` | AI flutter movement |
| Tree | static | none | Static scenery |

Also includes a global wind effect in `worldSettings`.

### Airplane controls

| Input | Action |
|---|---|
| W | Thrust (forward) |
| S | Brake |
| A | Roll left |
| D | Roll right |
| Trackpad horizontal | Yaw (turn) |
| Trackpad vertical | Pitch (nose up/down) |
| Space | Boost |

### Abbreviated JSON structure

```json
{
  "entities": [
    {
      "id": "airplane",
      "bodyType": "dynamic",
      "transformers": [
        {
          "type": "input",
          "priority": 0,
          "inputMapping": {
            "keyboard": { "w": "thrust", "s": "brake", "a": "roll_left", "d": "roll_right", "space": "boost" },
            "wheel": { "horizontal": "yaw", "vertical": "pitch" }
          }
        },
        {
          "type": "airplane",
          "priority": 1,
          "params": { "thrustForce": 50, "liftCoefficient": 2.5, "dragCoefficient": 0.1 }
        }
      ]
    },
    {
      "id": "butterfly",
      "bodyType": "kinematic",
      "transformers": [
        { "type": "butterfly", "params": { "flutterFrequency": 3.0, "flightHeight": 3.0, "flutterForce": 5.0 } }
      ]
    }
  ]
}
```

### How to test

1. Load `examples/airplane-world.json` in the Builder.
2. Switch to Play mode.
3. The airplane entity is automatically set as the camera target.
4. Fly with W/A/S/D and trackpad gestures.
