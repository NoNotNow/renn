# Transformers

Transformers convert high-level intent (input, AI) into physics impulses. They do not mutate entity state or call physics APIs directly.

## Data flow

```
RawInput → InputMapping → TransformInput → TransformerChain → TransformOutput → Physics
```

- Transformers run in `priority` order (lower = earlier).
- Outputs are **additive**; a transformer can set `earlyExit` to stop the chain.
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
│       ├── carTransformer.ts                 # Vehicle throttle/steering
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
| `car` | Vehicle throttle/steering | `acceleration`, `steering`, `friction` |
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

53/53 tests passing (`npx vitest run src/transformers/ src/input/`).

Remaining optional: TransformerPanel UI component in the Builder.
