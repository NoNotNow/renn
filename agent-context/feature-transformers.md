# Transformers

Transformers convert high-level intent (input, AI) into physics impulses. They do not mutate entity state or call physics APIs directly.

## Data flow

```
RawInput → InputMapping → TransformInput → TransformerChain → TransformOutput → Physics
```

- Transformers run in `priority` order (lower = earlier).
- Outputs are **additive**; a transformer can set `earlyExit` to stop the chain.
- `TransformOutput.color` (optional [r,g,b] 0–1) is applied by the render loop via `setColor` for display feedback.
- `TransformOutput.addRotation` (optional Euler delta [x,y,z] rad): when set, the render loop adds it to the current body rotation and calls `physicsWorld.setRotation()`, then zeros angular velocity so physics does not override. Default is undefined so other transformers are unaffected. In the chain, **last-wins** (like color).
- `resetAllForces()` is called before each frame so forces never accumulate across frames.

## Key files

```
src/
├── types/transformer.ts                      # All TS interfaces
├── transformers/
│   ├── transformer.ts                        # BaseTransformer + TransformerChain
│   ├── transformerRegistry.ts                # Factory: type string → instance
│   └── presets/
│       ├── inputTransformer.ts               # Raw input → actions (priority 0)
│       ├── airplaneTransformer.ts            # Flight physics
│       ├── characterTransformer.ts           # Ground movement + jump
│       ├── carTransformer.ts                 # Vehicle physics (bicycle model)
│       ├── car2Transformer.ts                # Input-to-color feedback (WASD → RGB blend)
│       ├── animalTransformer.ts              # Wander AI
│       ├── butterflyTransformer.ts           # Flutter AI
│       └── customTransformer.ts              # eval() user code
├── input/
│   ├── rawInput.ts                           # Keyboard + trackpad capture
│   ├── inputMapping.ts                       # RawInput → semantic actions
│   └── inputPresets.ts                       # AIRPLANE_PRESET, CHARACTER_PRESET, CAR_PRESET
├── physics/rapierPhysics.ts                  # applyForce/Impulse/TorqueFromTransformer
└── runtime/renderItemRegistry.ts             # executeTransformers() called in game loop
```

## Preset transformer reference

| Type | Purpose | Key params |
|---|---|---|
| `input` | Maps raw keys/wheel → actions | `inputMapping` (keyboard/wheel bindings) |
| `airplane` | Flight with thrust/lift/drag | `thrustForce`, `liftCoefficient`, `dragCoefficient`, `pitchSensitivity` |
| `character` | Ground movement + jump | `walkSpeed`, `jumpForce`, `turnSpeed` |
| `car` | Vehicle physics (bicycle model) | `maxSpeed`, `acceleration`, `brakeForce`, `engineBrake`, `maxSteerAngle`, `wheelbase`, `lateralGrip`, `handbrakeGripFactor`, `handbrakeMultiplier`, `steeringTorqueScale`, `highSpeedSteerFactor`, `lowSpeedSteerFactor` |
| `car2` | Input-to-color feedback (WASD → RGB) + impulse + addRotation for precise steering | None (uses car preset actions: throttle, brake, steer_left, steer_right, handbrake) |
| `animal` | Wander AI | `wanderRadius`, `speed`, `directionChangeInterval` |
| `butterfly` | Flutter AI | `flutterFrequency`, `flightHeight`, `flutterForce` |
| `custom` | Inline JS code | `code` (return `{ force, torque, earlyExit }`) |

## Minimal JSON config

```json
{
  "id": "player",
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
      "params": { "thrustForce": 50.0, "liftCoefficient": 2.5, "dragCoefficient": 0.1 }
    }
  ]
}
```

## Car transformer: bicycle model

The `car` transformer uses the **bicycle model** (standard in arcade racing games). Key behaviors:

- **Throttle**: engine force along the car's forward axis, tapering to zero at `maxSpeed`.
- **Brake / Reverse**: decelerates when moving forward; switches to reverse when near-stationary.
- **Engine braking**: gentle deceleration when coasting (no throttle, no brake).
- **Steering**: front-wheel angle → turning radius → Y-axis torque. Speed-dependent: at low speed, `lowSpeedSteerFactor` (default 1.2) boosts steering for tighter turns; at high speed, `highSpeedSteerFactor` (default 0.35) reduces steer angle for softer turns.
- **Lateral grip**: counter-force opposing sideways velocity keeps the car tracking its heading.
- **Handbrake**: strong braking + reduced lateral grip for drifting (Space or Shift).

All output uses `force` and `torque` only (no impulse), consistent with the `resetAllForces → apply → step` pipeline.

### IMPORTANT: param rename from previous version

The old transformer had a `steering` param. **That param no longer exists.** Passing it is silently ignored. Replace any use of `steering` with `steeringTorqueScale`.

### Defaults are sized for a mass-12 car

All defaults are tuned for a standard car entity (mass 10-15, box ~2x1x4). Entities with `mass` set in JSON get that exact mass in kg — the physics system computes the correct density from the shape volume automatically.

### Param scaling guide

All force/torque params scale with entity mass. The formulas below help choose values for non-default masses.

#### `acceleration` — engine force

```
acceleration ≈ mass × maxSpeed / desiredSecondsToMax  (+20% for damping overhead)
```

| mass | maxSpeed | 0–max in ~2s | 0–max in ~4s |
|------|----------|-------------|-------------|
| 5    | 25       | 75          | 37          |
| 12   | 25       | 180         | 90          |
| 30   | 25       | 450         | 225         |

#### `brakeForce` — stopping force

`brakeForce ≈ 2 × acceleration`. Braking should feel decisive.

#### `steeringTorqueScale` — steering responsiveness

Must overcome angular damping and rotational inertia:

```
steeringTorqueScale ≈ angularDamping × I_y × 4
I_y (box) = mass × (width² + depth²) / 12
```

| mass | Shape (w×h×d) | angularDamping | I_y  | steeringTorqueScale |
|------|---------------|----------------|------|---------------------|
| 5    | 1.5×1×3       | 0.3            | 4.7  | 10–15               |
| 12   | 2×1×4         | 0.3            | 20   | 25–35               |
| 12   | 2×1×4         | 2.0            | 20   | 60–80               |
| 30   | 2.5×1×5       | 0.3            | 78   | 80–120              |

#### `highSpeedSteerFactor` — softer steering at high speed

Fraction of max steer angle applied at max speed (0–1). Lower = softer steering. Default 0.35. Use 1 to disable (full steering at all speeds).

#### `lowSpeedSteerFactor` — steeper turning when slow

Steer multiplier at rest (speed=0). Values > 1 boost low-speed turning (e.g. 1.2 = 20% sharper). Default 1.2. Use 1 for no boost.

#### `minSteerSpeed` — steering at standstill

Minimum effective forward speed (m/s) used when throttle/brake+steer held but car is nearly stationary. Default 0 (steering only applies when car has actual speed). Set > 0 (e.g. 0.5) to allow steering torque at standstill.

#### `lateralGrip` — tire grip

```
lateralGrip ≈ mass × 1.5–2.5   (snappy)
lateralGrip ≈ mass × 0.3–0.5   (drifty)
```

#### `wheelbase` — match entity depth

Set to ~half the entity depth (Z dimension). Too small = spin; too large = sluggish.

### Recommended entity config (mass 12, box 2×1×4)

Tested and working reference config:

```json
{
  "id": "car",
  "bodyType": "dynamic",
  "shape": { "type": "box", "width": 2, "height": 1, "depth": 4 },
  "mass": 12,
  "friction": 0.5,
  "linearDamping": 0.1,
  "angularDamping": 2.0,
  "transformers": [
    {
      "type": "input",
      "priority": 0,
      "inputMapping": {
        "keyboard": {
          "w": "throttle",
          "s": "brake",
          "a": "steer_left",
          "d": "steer_right",
          "space": "handbrake",
          "shift": "handbrake"
        }
      }
    },
    {
      "type": "car",
      "priority": 1,
      "params": {
        "maxSpeed": 25,
        "acceleration": 200,
        "brakeForce": 400,
        "engineBrake": 30,
        "maxSteerAngle": 0.5,
        "wheelbase": 2.0,
        "lateralGrip": 25,
        "handbrakeGripFactor": 0.15,
        "handbrakeMultiplier": 3,
        "steeringTorqueScale": 60
      }
    }
  ]
}
```

All defaults (shown above) work out of the box for mass ~12. For heavier entities, scale `acceleration`, `brakeForce`, `lateralGrip`, and `steeringTorqueScale` proportionally.

**Smooth acceleration (5–10 s to max speed):** `acceleration` is in Newtons. Use `acceleration ≈ mass × maxSpeed / timeToMaxSpeed` (e.g. mass 20, maxSpeed 25, 7.5 s → ~67). Alternatively set `timeToMaxSpeed` (seconds) in car params and the registry will derive acceleration from entity mass.

## Script API

```typescript
game.setTransformerEnabled(entityId, type, enabled)
game.setTransformerParam(entityId, type, paramName, value)
```

## Rules when adding a transformer

1. Preserve `priority` order semantics.
2. Keep `transform()` side-effect free — no direct physics calls.
3. Deliver output as `impulse` when possible (not persistent `force`).
4. Add/adjust tests in `src/transformers/*.test.ts`.

## Test status

100/100 tests passing (`npx vitest run src/transformers/ src/input/`).

Remaining optional: TransformerPanel UI component in the Builder.
