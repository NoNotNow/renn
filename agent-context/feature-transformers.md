# Transformers

Transformers convert high-level intent (input, AI, waypoints) into physics impulses or pose commands. They do not call physics APIs directly from `transform()`; the runtime applies `TransformOutput` after the chain runs.

## Target intent vs movement execution

| Layer | Responsibility |
|--------|------------------|
| **Target sources** (`targetPoseInput`, `wanderer`, future AI/script) | **Where** to go: `TransformInput.target` with `pose`, **linear** `speed` (m/s average along translation toward `pose.position`), optional `curve` / `velocity`. Does **not** specify kinematic vs dynamic vs forces. |
| **Movement transformers** (`kinematicMovement`, future force-based movers) | **How** to realize intent: read `input.target` and emit forces or `setPose` as designed. |

**Paradigms**

- **`target.speed`** is **linear only** (m/s). It is **not** angular rate and **not** a primary duration knob; segment time is **emergent** (≈ distance / speed for constant-speed translation).
- **Rotation** toward `target.pose.rotation` is **not** driven by `target.speed`; each movement transformer documents its own rotation policy (e.g. `kinematicMovement` uses slerp with `maxRotationRate`).

## Data flow

```
RawInput → InputMapping → TransformInput → TransformerChain → TransformOutput → Physics
```

- Transformers run in `priority` order (lower = earlier).
- **Forces and torques** are **additive**; `color`, `addRotation`, and `setPose` are **last-wins** in the chain.
- Target sources may **mutate** `TransformInput.target` each frame (last writer wins if multiple write).
- `TransformOutput.color` (optional [r,g,b] 0–1) is applied by the render loop via `setColor` for display feedback.
- `TransformOutput.addRotation` (optional Euler delta [x,y,z] rad): when set, the render loop adds it to the current body rotation and calls `physicsWorld.setRotation()`, then zeros angular velocity so physics does not override. Default is undefined so other transformers are unaffected.
- `TransformOutput.setPose` (optional full world pose): when set, the render loop sets position and rotation and zeros linear/angular velocity. Use with **`bodyType: kinematic`** for scripted paths; dynamic bodies may fight other forces.
- `resetAllForces()` is called before each frame so forces never accumulate across frames.

## Key files

```
src/
├── types/transformer.ts                      # All TS interfaces
├── transformers/
│   ├── transformer.ts                        # BaseTransformer + TransformerChain
│   ├── transformerRegistry.ts                # Factory: type string → instance
│   ├── transformerPresets.ts                 # Default configs for Builder dropdown
│   └── presets/
│       ├── inputTransformer.ts               # Raw input → actions (priority 0)
│       ├── car2Transformer.ts               # Impulse + addRotation (touch-gated)
│       ├── targetPoseInputTransformer.ts     # Waypoints → TransformInput.target
│       ├── wandererTransformer.ts            # Random poses in cube → TransformInput.target
│       └── kinematicMovementTransformer.ts   # input.target → TransformOutput.setPose
├── data/transformerPresets/
│   ├── loader.ts                             # listPresetNames, loadPreset (from JSON files)
│   ├── car2/                                 # Optional .json templates
│   ├── input/
│   ├── targetPoseInput/
│   ├── wanderer/
│   └── kinematicMovement/
├── input/
│   ├── rawInput.ts                           # Keyboard + trackpad capture
│   ├── inputMapping.ts                       # RawInput → semantic actions
│   └── inputPresets.ts                       # CHARACTER_PRESET, CAR_PRESET
├── physics/rapierPhysics.ts                  # applyForce/Impulse/TorqueFromTransformer
└── runtime/renderItemRegistry.ts             # executeTransformers() called in game loop
```

## Builder: `enabled` without scene reload

- Each transformer row has a green/red dot button that toggles the serialised `enabled` field immediately (not via the JSON Apply button).
- `getSceneDependencyKey` omits `enabled` from transformer configs so toggling does not trigger a full scene rebuild.
- `RenderItemRegistry.syncEntityTransformers` updates `item.entity.transformers` and sets `Transformer.enabled` on the live chain (same order as config). Builder calls it when the scene dependency key is unchanged after a transformers edit.

## Preset transformer reference

Templates live under `src/data/transformerPresets/<type>/*.json` and appear in the Builder transformer template dialog.

| Type | Purpose | Key params |
|---|---|---|
| `input` | Maps raw keys/wheel → actions | `inputMapping` (keyboard/wheel bindings) |
| `car2` | Impulse + addRotation for steering; **physics only when touching another object** | `power`, `steeringIntensity`, `steeringSpeed`, `lateralGrip`, `lateralToForwardTransfer` |
| `person` | WASD walk/run + turn torque when grounded | `walkForce`, `runForce`, `maxWalkSpeed`, `maxRunSpeed`, `turnSpeed` |
| `targetPoseInput` | Waypoint list → **`TransformInput.target`** (pose + linear speed); modes `cycle`, `pingPong`, `stopAtEnd` | `poses`, `speed`, `mode`, `positionEpsilon`, `rotationEpsilon` |
| `wanderer` | Random poses within perimeter cube → **`TransformInput.target`**; configurable speed, jump distance, linear/angular toggles | `speed`, `jumpDistance`, `linear`, `angular`, `perimeter` (center, halfExtents), `positionEpsilon`, `rotationEpsilon` |
| `kinematicMovement` | Reads **`input.target`**, emits **`setPose`** (linear move at `target.speed`, rotation via `maxRotationRate`) | `maxRotationRate` |

**Typical kinematic path:** `targetPoseInput` or `wanderer` (priority 5) then `kinematicMovement` (priority 6). Entity should use **`bodyType: kinematic`** for clean pose driving.

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
        "keyboard": { "w": "throttle", "s": "brake", "a": "steer_left", "d": "steer_right", "space": "handbrake" }
      }
    },
    {
      "type": "car2",
      "priority": 1,
      "params": { "power": 400, "lateralGrip": 100 }
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

### Car2 transformer params

The `car2` preset (impulse + addRotation + color feedback) accepts optional `params` in JSON. When the car has lateral velocity, part of the countered lateral force is applied as forward impulse so that some lateral energy is translated into forward motion during turns.

**Touch-gating:** Car2 applies **impulse** and **addRotation** only when the entity is touching another object (at least one contact with another collider). When not touching anything (e.g. in mid-air), the transformer still outputs **color** for input feedback but does not output impulse or addRotation, so physics is left unchanged. The runtime sets `input.environment.isTouchingObject` from the physics world’s contact state (from the previous step) before running the transformer chain; car2 reads this and gates its physics output on it.

| Param | Default | Meaning |
|-------|---------|---------|
| `power` | 400 | Throttle/brake impulse magnitude |
| `steeringIntensity` | 0.1 | Yaw per distance per wheel angle (radians per metre) |
| `steeringSpeed` | 0.01 | Wheel angle change rate (how fast steer input moves the wheel) |
| `lateralGrip` | 100 | Sideways grip strength (higher = less sliding) |
| `lateralToForwardTransfer` | 0.2 | Fraction of lateral grip translated into forward impulse when turning (0–1) |

Default preset (Builder + `getDefaultTransformerConfig('car2')`): `{ "type": "car2", "priority": 10, "enabled": true, "params": { "power": 1000, "steeringIntensity": 0.05, "steeringSpeed": 0.05, "lateralGrip": 120 } }`. Optional: `lateralToForwardTransfer` (e.g. `0.2`).

### Builder: Add transformer dropdown and template dialog

In the Builder, when an entity is selected, the Transformers section shows. Use the "Add transformer" dropdown to add a transformer (input or car2) with a default config from `src/transformers/transformerPresets.ts`. For each preset transformer, a **Templates…** button opens the transformer template dialog: load the built-in default or any JSON preset from `src/data/transformerPresets/<type>/*.json`, or save the current config as a template (download JSON or copy to clipboard) to add to that folder.

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

Run `npx vitest run src/transformers/ src/input/`.

Remaining optional: TransformerPanel UI component in the Builder.
